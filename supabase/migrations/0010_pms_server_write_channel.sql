-- =====================================================================
-- TorqueLane — the server write channel (Phase 1)
--
-- Until now every write came from the browser through PostgREST as role
-- `authenticated`. RLS could check WHO wrote a row, but not whether its
-- totals or its status transition were legitimate, and a multi-statement
-- change (insert order, insert lines, insert event) could half-land if the
-- network dropped between calls.
--
-- From this migration on, work orders and everything hanging off them are
-- written only by server commands (server/commands/), each inside ONE
-- transaction. The mechanism:
--
--   * `pms_server` is a NOLOGIN, NOBYPASSRLS role. Nobody can connect as it.
--   * The server's connection user (`postgres`, via the Supavisor pooler) is
--     a member and, per transaction, runs
--         set local role pms_server;
--         select set_config('request.jwt.claims', '{"sub": "<user id>"}', true);
--     so `auth.uid()` — and therefore pms_visible_client_ids() and every
--     tenancy helper — resolves the REAL, server-verified user. RLS still
--     applies on this path; it is defence in depth, not the only check.
--   * `postgres` itself has BYPASSRLS on Supabase, which is exactly why the
--     role switch is mandatory: writing as `postgres` directly would skip
--     tenancy entirely. server/db.ts never issues a statement before it.
--   * `authenticator` (PostgREST's login role) is deliberately NOT a member,
--     so no JWT, however crafted, can make PostgREST assume pms_server.
--   * pms_server is never granted USAGE on schema `auth` (Supabase does not let
--     `postgres` grant it); see pms_auth_uid() below.
--   * The migrated tables keep SELECT for `authenticated` (the browser still
--     reads under RLS) but lose INSERT/UPDATE/DELETE. Their write policies
--     are re-created `to pms_server` with the same tenancy predicates.
--
-- Tables migrated in this phase:
--   pms_work_orders, pms_work_order_lines, pms_work_order_tasks,
--   pms_work_order_parts, pms_work_order_events (append-only),
--   pms_approval_log (append-only).
-- pms_vehicles is NOT migrated (Phase 2) but pms_server may update it, because
-- closing a work order resets the vehicle's PMS clock in the same transaction.
--
-- Idempotent: safe to run more than once.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pms_server') then
    create role pms_server nologin noinherit nobypassrls;
  end if;
end $$;

-- The connection user may assume it. On PG16+ the creating CREATEROLE role
-- already holds ADMIN OPTION on a role it created, which is what lets this
-- grant run as `postgres` on hosted Supabase (not a superuser there).
grant pms_server to postgres;

grant usage on schema public to pms_server;
-- bigserial `seq` columns on events, lines, approval log and parts.
grant usage on all sequences in schema public to pms_server;

-- pms_server cannot be granted USAGE on schema `auth`: on Supabase that schema
-- belongs to supabase_auth_admin and `postgres` holds no grant option on it
-- (`grant usage on schema auth ...` here would only emit "no privileges were
-- granted"). Every tenancy helper is SECURITY DEFINER and so calls auth.uid()
-- as its owner, which is fine. The one policy that calls auth.uid() inline,
-- pms_profiles_read, gets a pms_server twin below that goes through this
-- wrapper instead. The claim it reads is the transaction-local
-- `request.jwt.claims` set by server/db.ts, unaffected by SECURITY DEFINER.
create or replace function pms_auth_uid()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid();
$$;

revoke all on function pms_auth_uid() from public;
grant execute on function pms_auth_uid() to pms_server;


-- =====================================================================
-- Reads the commands need. pms_server sees exactly what the user it is
-- acting for would see: the existing read policies are widened to include
-- it, unchanged.
-- =====================================================================

grant select on
  pms_providers, pms_fleet_clients, pms_profiles, pms_vehicles,
  pms_work_orders, pms_work_order_events, pms_work_order_lines,
  pms_approval_log, pms_approval_settings, pms_service_tasks,
  pms_technicians, pms_vendors, pms_work_order_tasks, pms_work_order_parts,
  pms_parts
to pms_server;

alter policy pms_providers_read         on pms_providers         to authenticated, pms_server;
alter policy pms_fleet_clients_read     on pms_fleet_clients     to authenticated, pms_server;
alter policy pms_vehicles_read          on pms_vehicles          to authenticated, pms_server;
alter policy pms_work_orders_read       on pms_work_orders       to authenticated, pms_server;
alter policy pms_wo_events_read         on pms_work_order_events to authenticated, pms_server;
alter policy pms_wo_lines_read          on pms_work_order_lines  to authenticated, pms_server;
alter policy pms_approval_log_read      on pms_approval_log      to authenticated, pms_server;
alter policy pms_approval_settings_read on pms_approval_settings to authenticated, pms_server;
alter policy pms_service_tasks_read     on pms_service_tasks     to authenticated, pms_server;
alter policy pms_technicians_read       on pms_technicians       to authenticated, pms_server;
alter policy pms_vendors_read           on pms_vendors           to authenticated, pms_server;
alter policy pms_work_order_tasks_read  on pms_work_order_tasks  to authenticated, pms_server;
alter policy pms_work_order_parts_read  on pms_work_order_parts  to authenticated, pms_server;
alter policy pms_parts_read             on pms_parts             to authenticated, pms_server;

-- A command only ever needs the acting user's own profile (role, tenancy,
-- display name), so this is narrower than pms_profiles_read on purpose.
drop policy if exists pms_profiles_server_read on pms_profiles;
create policy pms_profiles_server_read on pms_profiles
  for select to pms_server
  using (id = pms_auth_uid());


-- =====================================================================
-- The browser loses write access to the migrated tables.
-- =====================================================================

revoke insert, update, delete on
  pms_work_orders, pms_work_order_lines, pms_work_order_tasks,
  pms_work_order_parts, pms_work_order_events, pms_approval_log
from authenticated;

drop policy if exists pms_work_orders_insert       on pms_work_orders;
drop policy if exists pms_work_orders_update       on pms_work_orders;
drop policy if exists pms_wo_events_insert         on pms_work_order_events;
drop policy if exists pms_wo_lines_insert          on pms_work_order_lines;
drop policy if exists pms_wo_lines_update          on pms_work_order_lines;
drop policy if exists pms_wo_lines_delete          on pms_work_order_lines;
drop policy if exists pms_approval_log_insert      on pms_approval_log;
drop policy if exists pms_work_order_tasks_insert  on pms_work_order_tasks;
drop policy if exists pms_work_order_tasks_update  on pms_work_order_tasks;
drop policy if exists pms_work_order_tasks_delete  on pms_work_order_tasks;
drop policy if exists pms_work_order_parts_insert  on pms_work_order_parts;
drop policy if exists pms_work_order_parts_update  on pms_work_order_parts;
drop policy if exists pms_work_order_parts_delete  on pms_work_order_parts;


-- =====================================================================
-- Server-only writes, same tenancy predicates as the policies they replace.
-- =====================================================================

-- Work orders: insert and update only. An order is cancelled, never deleted.
grant insert, update on pms_work_orders to pms_server;

drop policy if exists pms_work_orders_server_insert on pms_work_orders;
create policy pms_work_orders_server_insert on pms_work_orders
  for insert to pms_server
  with check (exists (
    select 1 from pms_vehicles v
    where v.id = vehicle_id and pms_can_access_client(v.fleet_client_id)
  ));

drop policy if exists pms_work_orders_server_update on pms_work_orders;
create policy pms_work_orders_server_update on pms_work_orders
  for update to pms_server
  using (exists (
    select 1 from pms_vehicles v
    where v.id = vehicle_id and pms_can_access_client(v.fleet_client_id)
  ))
  with check (exists (
    select 1 from pms_vehicles v
    where v.id = vehicle_id and pms_can_access_client(v.fleet_client_id)
  ));

-- Lines: a draft's lines are edited and removed before it is quoted.
grant insert, update, delete on pms_work_order_lines to pms_server;

drop policy if exists pms_wo_lines_server_insert on pms_work_order_lines;
create policy pms_wo_lines_server_insert on pms_work_order_lines
  for insert to pms_server
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_wo_lines_server_update on pms_work_order_lines;
create policy pms_wo_lines_server_update on pms_work_order_lines
  for update to pms_server
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)))
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_wo_lines_server_delete on pms_work_order_lines;
create policy pms_wo_lines_server_delete on pms_work_order_lines
  for delete to pms_server
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

-- Junctions: replaced wholesale (delete then insert).
grant insert, update, delete on pms_work_order_tasks, pms_work_order_parts to pms_server;

drop policy if exists pms_work_order_tasks_server_insert on pms_work_order_tasks;
create policy pms_work_order_tasks_server_insert on pms_work_order_tasks
  for insert to pms_server
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_tasks_server_update on pms_work_order_tasks;
create policy pms_work_order_tasks_server_update on pms_work_order_tasks
  for update to pms_server
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)))
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_tasks_server_delete on pms_work_order_tasks;
create policy pms_work_order_tasks_server_delete on pms_work_order_tasks
  for delete to pms_server
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_parts_server_insert on pms_work_order_parts;
create policy pms_work_order_parts_server_insert on pms_work_order_parts
  for insert to pms_server
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_parts_server_update on pms_work_order_parts;
create policy pms_work_order_parts_server_update on pms_work_order_parts
  for update to pms_server
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)))
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_parts_server_delete on pms_work_order_parts;
create policy pms_work_order_parts_server_delete on pms_work_order_parts
  for delete to pms_server
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

-- Append-only: SELECT + INSERT, and no update/delete policy for anyone (R7).
grant insert on pms_work_order_events, pms_approval_log to pms_server;

drop policy if exists pms_wo_events_server_insert on pms_work_order_events;
create policy pms_wo_events_server_insert on pms_work_order_events
  for insert to pms_server
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_approval_log_server_insert on pms_approval_log;
create policy pms_approval_log_server_insert on pms_approval_log
  for insert to pms_server
  with check (
    pms_can_access_client(fleet_client_id)
    and fleet_client_id = pms_client_for_work_order(work_order_id)
  );

-- Closing an order resets its vehicle's PMS clock in the same transaction.
-- The browser keeps its own vehicle writes until Phase 2 migrates them.
grant update on pms_vehicles to pms_server;
alter policy pms_vehicles_update on pms_vehicles to authenticated, pms_server;


-- =====================================================================
-- Order numbering support.
--
-- `pms_work_orders_reference_key` is unique across the whole table, so the
-- next number must clear every issued reference — including ones the caller's
-- tenant cannot read. This returns only the single highest reference for a
-- year, nothing else, and only to pms_server. Callers take
-- pg_advisory_xact_lock first so concurrent commands number in sequence
-- instead of racing to the same value. Phase 2 replaces this with
-- pms_document_series (R8).
-- =====================================================================

create or replace function pms_highest_work_order_reference(p_year int)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select reference
  from pms_work_orders
  where reference ~ ('^WO-' || p_year::text || '-[0-9]+$')
  order by split_part(reference, '-', 3)::bigint desc
  limit 1;
$$;

revoke all on function pms_highest_work_order_reference(int) from public;
grant execute on function pms_highest_work_order_reference(int) to pms_server;
