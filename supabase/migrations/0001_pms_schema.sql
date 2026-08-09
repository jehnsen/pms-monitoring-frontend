-- =====================================================================
-- MekanikoMoR Fleet PMS — schema, tenancy, and RLS
--
-- This database is SHARED with an unrelated detailing/POS application, so
-- every object created here is prefixed `pms_`. Nothing in this file touches
-- a table it does not own, and no existing table is altered.
--
-- The tenancy shape mirrors lib/tenancy.ts verbatim:
--
--     provider -> fleet_client -> vehicles -> work orders, documents, ...
--
-- A provider-side session sees every client beneath its provider; a client-side
-- session sees exactly one client, never a sibling under the same provider.
-- That rule lives in `pms_visible_client_ids()` and every RLS policy defers to
-- it, so there is one definition of scope in the database exactly as there is
-- one in the client (`scopeFleetState`).
--
-- Idempotent: safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------- enums
-- Created only if absent so a re-run does not error.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pms_user_role') then
    create type pms_user_role as enum (
      'provider_admin', 'service_advisor', 'provider_technician',
      'fleet_manager', 'operations', 'technician', 'purchasing_officer', 'viewer'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_client_status') then
    create type pms_client_status as enum ('active', 'suspended');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_vehicle_status') then
    create type pms_vehicle_status as enum ('active', 'in_service', 'down');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_vehicle_class') then
    create type pms_vehicle_class as enum ('sedan', 'suv', 'pickup', 'van', 'truck');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_fuel_type') then
    create type pms_fuel_type as enum ('gasoline', 'diesel', 'hybrid', 'electric');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_work_order_status') then
    create type pms_work_order_status as enum (
      'draft', 'pending_approval', 'approved', 'partially_approved',
      'declined', 'scheduled', 'in_progress', 'closed', 'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_work_order_type') then
    create type pms_work_order_type as enum ('preventive', 'corrective', 'inspection');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_priority') then
    create type pms_priority as enum ('low', 'medium', 'high', 'critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_task_category') then
    create type pms_task_category as enum (
      'engine', 'drivetrain', 'brakes', 'tires', 'electrical', 'safety', 'body', 'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_line_urgency') then
    create type pms_line_urgency as enum ('safety_critical', 'recommended', 'optional');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_parts_source') then
    create type pms_parts_source as enum ('own_stock', 'supplier_provided');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_line_approval_status') then
    create type pms_line_approval_status as enum ('pending', 'approved', 'declined', 'deferred');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_approval_action') then
    create type pms_approval_action as enum (
      'sent_for_approval', 'auto_approved', 'approved', 'declined',
      'deferred', 'escalated', 'variance_approved'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_purchase_order_status') then
    create type pms_purchase_order_status as enum ('draft', 'sent', 'received', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'pms_document_kind') then
    create type pms_document_kind as enum (
      'invoice', 'service_report', 'inspection', 'lto_registration', 'ctpl',
      'comprehensive_insurance', 'emission_test', 'ltfrb_franchise',
      'warranty', 'photo', 'other'
    );
  end if;
end $$;

-- ------------------------------------------------------------- providers
-- Text ids rather than uuids: the domain ids ("prov-mekanikomore", "fc-actimed",
-- "veh-3") are already stable and are referenced by lib/tenant.ts constants and
-- by every seeded record. Generating uuids here would orphan those constants.
create table if not exists pms_providers (
  id            text primary key,
  name          text        not null,
  slug          text        not null unique,
  logo_url      text,
  brand_color   text        not null,
  support_email text        not null,
  created_at    date        not null default current_date
);

create table if not exists pms_fleet_clients (
  id           text primary key,
  provider_id  text not null references pms_providers(id) on delete cascade,
  name         text not null,
  slug         text not null,
  contact_name text not null default '',
  contact_email text not null default '',
  contract_terms text not null default '',
  payment_terms_days int not null default 30,
  -- Sparse override folded over the provider defaults by
  -- effectiveApprovalSettings. NULL means "inherit everything" and is
  -- deliberately distinct from '{}' — an unset field must never read as zero.
  approval_threshold_overrides jsonb,
  logo_url     text,
  brand_color  text,
  status       pms_client_status not null default 'active',
  created_at   date not null default current_date,
  unique (provider_id, slug)
);

-- --------------------------------------------------------------- profiles
-- The bridge between Supabase Auth and tenancy. This is what makes tenant
-- isolation a real security control rather than a UI affordance: RLS policies
-- key off auth.uid() -> this row -> provider/client, none of which the browser
-- can forge.
--
-- A provider-side user carries fleet_client_id IS NULL; a client-side user
-- carries both. `resolveTenantScope` fails closed on any other combination and
-- so does pms_visible_client_ids().
create table if not exists pms_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  name            text not null,
  role            pms_user_role not null,
  title           text not null default '',
  provider_id     text references pms_providers(id) on delete cascade,
  fleet_client_id text references pms_fleet_clients(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists pms_profiles_provider_idx on pms_profiles(provider_id);
create index if not exists pms_profiles_client_idx   on pms_profiles(fleet_client_id);

-- --------------------------------------------------------------- vehicles
create table if not exists pms_vehicles (
  id              text primary key,
  -- The tenancy anchor. Work orders and PMS intervals derive their client from
  -- here rather than carrying a copy.
  fleet_client_id text not null references pms_fleet_clients(id) on delete cascade,
  plate_number    text not null,
  make            text not null,
  model           text not null,
  year            int  not null,
  vin             text not null,
  vehicle_class   pms_vehicle_class not null,
  fuel_type       pms_fuel_type not null,
  color           text not null default '',
  driver_licence_expiry date,
  odometer        int  not null default 0,
  -- Readings are not always same-day; projections roll forward from here
  -- rather than assuming the odometer is current.
  odometer_read_at date not null default current_date,
  avg_daily_km    numeric not null default 0,
  status          pms_vehicle_status not null default 'active',
  assigned_to     text not null default '',
  department      text not null default '',
  location        text not null default '',
  acquired_on     date,
  registration_expiry date,
  insurance_expiry    date,
  -- Per-task service history keyed by task template id:
  --   { "task-oil": { "lastDoneOdometer": 41000, "lastDoneOn": "2026-01-04" } }
  -- Kept as jsonb rather than a child table because it is always read and
  -- written whole, as one map, by the PMS engine.
  task_state      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists pms_vehicles_client_idx on pms_vehicles(fleet_client_id);

-- ------------------------------------------------------------ work orders
create table if not exists pms_work_orders (
  id            text primary key,
  reference     text not null,
  vehicle_id    text not null references pms_vehicles(id) on delete cascade,
  title         text not null,
  type          pms_work_order_type not null,
  status        pms_work_order_status not null,
  priority      pms_priority not null,
  opened_on     date not null,
  scheduled_for date,
  -- "HH:mm" arrival slot, separate from the date-only scheduled_for. Null for
  -- orders written before the counter workflow existed — never fabricate a
  -- time from a bare date.
  scheduled_time text,
  completed_on  date,
  odometer_at_service int not null default 0,
  technician    text not null default '',
  vendor        text not null default '',
  bay_id        text,
  -- A job can be closed without being collected; that gap is the "ready for
  -- collection" queue. Revenue is recognised on collection, not completion.
  collected_at  timestamptz,
  collected_by  text,
  labor_cost    numeric not null default 0,
  -- Authoritative only while the parts list is empty. Read through
  -- resolvePartsCost, never directly.
  parts_cost    numeric not null default 0,
  parts         jsonb not null default '[]'::jsonb,
  findings      text not null default '',
  task_ids      text[] not null default '{}',
  notes         text not null default '',
  pending_approval_entered_at timestamptz,
  approval_wait_hours numeric,
  created_at    timestamptz not null default now()
);

create index if not exists pms_work_orders_vehicle_idx on pms_work_orders(vehicle_id);
create index if not exists pms_work_orders_status_idx  on pms_work_orders(status);

-- Status history — append-only. Kept as a child table rather than jsonb so the
-- append-only property is enforceable in RLS (insert allowed, update/delete
-- never granted) instead of merely conventional.
create table if not exists pms_work_order_events (
  id            text primary key,
  work_order_id text not null references pms_work_orders(id) on delete cascade,
  status        pms_work_order_status not null,
  at            timestamptz not null,
  actor         text not null default '',
  seq           bigserial
);

create index if not exists pms_wo_events_order_idx on pms_work_order_events(work_order_id, seq);

-- The purchasable items on an order. Approval happens per line, not per order,
-- so the order's status is always derived from this set.
create table if not exists pms_work_order_lines (
  id            text primary key,
  work_order_id text not null references pms_work_orders(id) on delete cascade,
  description   text not null,
  category      pms_task_category not null default 'other',
  part_cost     numeric not null default 0,
  labour_cost   numeric not null default 0,
  urgency       pms_line_urgency not null default 'recommended',
  parts_source  pms_parts_source not null default 'supplier_provided',
  approval_status pms_line_approval_status not null default 'pending',
  approved_by   text,
  approved_at   timestamptz,
  decline_reason text,
  photo_urls    text[] not null default '{}',
  seq           bigserial
);

create index if not exists pms_wo_lines_order_idx on pms_work_order_lines(work_order_id, seq);

-- The shop's liability record for what was and wasn't authorised. Append-only.
--
-- fleet_client_id is carried explicitly rather than derived: this table must
-- remain readable in isolation without joining back through a work order to a
-- vehicle.
create table if not exists pms_approval_log (
  id            text primary key,
  work_order_id text not null references pms_work_orders(id) on delete cascade,
  fleet_client_id text not null references pms_fleet_clients(id) on delete cascade,
  line_id       text,
  action        pms_approval_action not null,
  actor_id      text not null default '',
  actor_name    text not null default '',
  at            timestamptz not null,
  note          text,
  amount_at_time numeric not null default 0,
  seq           bigserial
);

create index if not exists pms_approval_log_order_idx  on pms_approval_log(work_order_id, seq);
create index if not exists pms_approval_log_client_idx on pms_approval_log(fleet_client_id);

-- -------------------------------------------------------------- documents
create table if not exists pms_documents (
  id            text primary key,
  -- Explicit: a document may hang off a vehicle, a work order, both, or
  -- neither — the unlinked case has no derivation path.
  fleet_client_id text not null references pms_fleet_clients(id) on delete cascade,
  name          text not null,
  kind          pms_document_kind not null,
  vehicle_id    text references pms_vehicles(id) on delete set null,
  work_order_id text references pms_work_orders(id) on delete set null,
  uploaded_by   text not null default '',
  uploaded_on   date not null default current_date,
  size_bytes    bigint not null default 0,
  mime_type     text not null default '',
  -- Data URL for files added in-session; seeded records carry null and stand
  -- for documents held elsewhere.
  data_url      text,
  expires_on    date,
  reference_number text,
  issued_on     date,
  issuing_body  text,
  notes         text not null default ''
);

create index if not exists pms_documents_client_idx  on pms_documents(fleet_client_id);
create index if not exists pms_documents_vehicle_idx on pms_documents(vehicle_id);

-- ------------------------------------------------------- parts & purchasing
-- Stock is held per client, not pooled: receiving one client's order must not
-- replenish another's shelf just because the part id matches.
create table if not exists pms_parts (
  id            text primary key,
  fleet_client_id text not null references pms_fleet_clients(id) on delete cascade,
  sku           text not null,
  name          text not null,
  category      pms_task_category not null default 'other',
  unit          text not null default 'pc',
  unit_cost     numeric not null default 0,
  current_stock int not null default 0,
  reorder_point int not null default 0,
  preferred_vendor text not null default '',
  lead_time_days int not null default 0
);

create index if not exists pms_parts_client_idx on pms_parts(fleet_client_id);

create table if not exists pms_purchase_orders (
  id            text primary key,
  -- Explicit: a PO's lines can span many vehicles or none.
  fleet_client_id text not null references pms_fleet_clients(id) on delete cascade,
  reference     text not null,
  vendor        text not null default '',
  status        pms_purchase_order_status not null default 'draft',
  created_on    date not null default current_date,
  created_by    text not null default '',
  notes         text not null default ''
);

create index if not exists pms_po_client_idx on pms_purchase_orders(fleet_client_id);

create table if not exists pms_purchase_order_lines (
  id            text primary key,
  purchase_order_id text not null references pms_purchase_orders(id) on delete cascade,
  part_id       text not null,
  description   text not null default '',
  quantity      int not null default 0,
  unit_cost     numeric not null default 0,
  -- Which projected due-items this line was raised to cover, so a later
  -- forecast run excludes them rather than double-counting.
  service_task_ids text[] not null default '{}',
  vehicle_ids   text[] not null default '{}',
  seq           bigserial
);

create index if not exists pms_po_lines_order_idx on pms_purchase_order_lines(purchase_order_id, seq);

-- ------------------------------------------------- provider-level settings
-- One row per provider: the approval defaults every client inherits.
create table if not exists pms_approval_settings (
  provider_id   text primary key references pms_providers(id) on delete cascade,
  auto_approve_under numeric not null default 5000,
  ops_approval_under numeric not null default 50000,
  sla_hours     numeric not null default 4,
  variance_threshold_pct numeric not null default 15,
  default_parts_source pms_parts_source not null default 'supplier_provided',
  monthly_budget numeric not null default 150000
);

-- Alert read/dismiss bookkeeping, bucketed per tenant scope AND per user.
--
-- The client bucketed only by scope key because state was global to the
-- browser; with real accounts, one user's dismissal must not silence an alert
-- for a colleague, so the user id is part of the key.
create table if not exists pms_alert_interactions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  scope_key  text not null,
  read_ids   text[] not null default '{}',
  dismissed_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_key)
);

-- =====================================================================
-- Tenancy helpers
--
-- SECURITY DEFINER + a pinned search_path so the functions can read
-- pms_profiles regardless of the caller's own RLS, and cannot be hijacked by
-- a mutable search_path. These are the single definition of scope, mirroring
-- lib/tenancy.ts.
-- =====================================================================

-- Every fleet_client id the current user may read.
--
-- Mirrors visibleFleetClientIds + explainTenantScope together, including the
-- fail-closed cases: no profile, no provider, a client that does not belong to
-- the session's provider, a suspended client, or a client-side role with no
-- client pinned (role_side_mismatch) all yield the empty set.
create or replace function pms_visible_client_ids()
returns table (fleet_client_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select p.provider_id, p.fleet_client_id, p.role
    from pms_profiles p
    where p.id = auth.uid()
  )
  select c.id
  from pms_fleet_clients c, me
  where me.provider_id is not null
    and c.provider_id = me.provider_id
    -- Suspended clients resolve to no scope at all, on both sides.
    and c.status = 'active'
    and (
      case
        -- Provider-side: sees every active client beneath its provider, but
        -- only if the role really is a provider-side role.
        when me.fleet_client_id is null
          then me.role in ('provider_admin', 'service_advisor', 'provider_technician')
        -- Client-side: exactly one client, never a sibling.
        else c.id = me.fleet_client_id
      end
    );
$$;

-- Whether the current user may read/write rows owned by `target`.
create or replace function pms_can_access_client(target text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from pms_visible_client_ids() v where v.fleet_client_id = target
  );
$$;

-- The provider the current user belongs to, or null.
create or replace function pms_current_provider_id()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select provider_id from pms_profiles where id = auth.uid();
$$;

-- True when the current user is provider-side (client-side roles are false
-- even if fleet_client_id were somehow null).
create or replace function pms_is_provider_side()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select fleet_client_id is null
            and role in ('provider_admin', 'service_advisor', 'provider_technician')
     from pms_profiles where id = auth.uid()),
    false
  );
$$;

-- The client a work order belongs to, resolved through its vehicle — the one
-- hop that keeps work-order tenancy underived-but-consistent.
create or replace function pms_client_for_work_order(order_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.fleet_client_id
  from pms_work_orders o
  join pms_vehicles v on v.id = o.vehicle_id
  where o.id = order_id;
$$;

-- =====================================================================
-- Row Level Security
--
-- Enabled on every pms_ table with NO permissive default: a table with RLS on
-- and no matching policy denies everything, which is the fail-closed posture
-- lib/tenancy.ts describes. Policies are dropped and recreated so the file is
-- re-runnable.
-- =====================================================================

alter table pms_providers            enable row level security;
alter table pms_fleet_clients        enable row level security;
alter table pms_profiles             enable row level security;
alter table pms_vehicles             enable row level security;
alter table pms_work_orders          enable row level security;
alter table pms_work_order_events    enable row level security;
alter table pms_work_order_lines     enable row level security;
alter table pms_approval_log         enable row level security;
alter table pms_documents            enable row level security;
alter table pms_parts                enable row level security;
alter table pms_purchase_orders      enable row level security;
alter table pms_purchase_order_lines enable row level security;
alter table pms_approval_settings    enable row level security;
alter table pms_alert_interactions   enable row level security;

-- ---------------------------------------------------------- providers
drop policy if exists pms_providers_read on pms_providers;
create policy pms_providers_read on pms_providers
  for select to authenticated
  using (id = pms_current_provider_id());

-- Branding is the provider's own; a client-side session cannot rebrand the
-- service centre's instance.
drop policy if exists pms_providers_update on pms_providers;
create policy pms_providers_update on pms_providers
  for update to authenticated
  using (id = pms_current_provider_id() and pms_is_provider_side())
  with check (id = pms_current_provider_id() and pms_is_provider_side());

-- ------------------------------------------------------ fleet clients
drop policy if exists pms_fleet_clients_read on pms_fleet_clients;
create policy pms_fleet_clients_read on pms_fleet_clients
  for select to authenticated
  using (pms_can_access_client(id));

-- Onboarding a client is provider-side only — a client cannot create siblings —
-- and the new row is pinned to the session's own provider.
drop policy if exists pms_fleet_clients_insert on pms_fleet_clients;
create policy pms_fleet_clients_insert on pms_fleet_clients
  for insert to authenticated
  with check (pms_is_provider_side() and provider_id = pms_current_provider_id());

drop policy if exists pms_fleet_clients_update on pms_fleet_clients;
create policy pms_fleet_clients_update on pms_fleet_clients
  for update to authenticated
  using (pms_can_access_client(id))
  -- provider_id is fixed by the WITH CHECK: a patch cannot move a client
  -- between providers.
  with check (provider_id = pms_current_provider_id());

-- --------------------------------------------------------- profiles
-- A user always reads their own row (needed to resolve scope at all).
-- Provider-side staff additionally read profiles beneath their provider, and a
-- client-side user reads only colleagues in the same client — mirroring
-- scopeAccounts.
drop policy if exists pms_profiles_read on pms_profiles;
create policy pms_profiles_read on pms_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      provider_id = pms_current_provider_id()
      and (
        pms_is_provider_side()
        or (fleet_client_id is not null and pms_can_access_client(fleet_client_id))
      )
    )
  );

drop policy if exists pms_profiles_update_self on pms_profiles;
create policy pms_profiles_update_self on pms_profiles
  for update to authenticated
  using (id = auth.uid())
  -- Role and tenancy are NOT self-serviceable; a user rewriting their own
  -- fleet_client_id would be a one-statement tenant escape. Those columns are
  -- pinned to their existing values here.
  with check (
    id = auth.uid()
    and role = (select role from pms_profiles where id = auth.uid())
    and provider_id is not distinct from (select provider_id from pms_profiles where id = auth.uid())
    and fleet_client_id is not distinct from (select fleet_client_id from pms_profiles where id = auth.uid())
  );

-- --------------------------------------------------------- vehicles
drop policy if exists pms_vehicles_read on pms_vehicles;
create policy pms_vehicles_read on pms_vehicles
  for select to authenticated
  using (pms_can_access_client(fleet_client_id));

drop policy if exists pms_vehicles_insert on pms_vehicles;
create policy pms_vehicles_insert on pms_vehicles
  for insert to authenticated
  with check (pms_can_access_client(fleet_client_id));

drop policy if exists pms_vehicles_update on pms_vehicles;
create policy pms_vehicles_update on pms_vehicles
  for update to authenticated
  using (pms_can_access_client(fleet_client_id))
  -- Both sides checked: a patch can never move a vehicle between clients,
  -- which would take its whole service history with it.
  with check (pms_can_access_client(fleet_client_id));

drop policy if exists pms_vehicles_delete on pms_vehicles;
create policy pms_vehicles_delete on pms_vehicles
  for delete to authenticated
  using (pms_can_access_client(fleet_client_id));

-- ------------------------------------------------------ work orders
-- Tenancy derives through the vehicle, exactly as scopeFleetState does: an
-- order whose vehicle falls outside the scope is invisible rather than an
-- orphan.
drop policy if exists pms_work_orders_read on pms_work_orders;
create policy pms_work_orders_read on pms_work_orders
  for select to authenticated
  using (exists (
    select 1 from pms_vehicles v
    where v.id = vehicle_id and pms_can_access_client(v.fleet_client_id)
  ));

drop policy if exists pms_work_orders_insert on pms_work_orders;
create policy pms_work_orders_insert on pms_work_orders
  for insert to authenticated
  with check (exists (
    select 1 from pms_vehicles v
    where v.id = vehicle_id and pms_can_access_client(v.fleet_client_id)
  ));

drop policy if exists pms_work_orders_update on pms_work_orders;
create policy pms_work_orders_update on pms_work_orders
  for update to authenticated
  using (exists (
    select 1 from pms_vehicles v
    where v.id = vehicle_id and pms_can_access_client(v.fleet_client_id)
  ))
  -- Re-checked after the update so an order cannot be re-pointed at another
  -- tenant's vehicle, dragging it across the boundary.
  with check (exists (
    select 1 from pms_vehicles v
    where v.id = vehicle_id and pms_can_access_client(v.fleet_client_id)
  ));

-- ---------------------------------------- work order events (append-only)
-- SELECT and INSERT only. No update or delete policy exists, so the history
-- cannot drift from what actually happened — the append-only property is
-- enforced by the database, not by convention.
drop policy if exists pms_wo_events_read on pms_work_order_events;
create policy pms_wo_events_read on pms_work_order_events
  for select to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_wo_events_insert on pms_work_order_events;
create policy pms_wo_events_insert on pms_work_order_events
  for insert to authenticated
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

-- ------------------------------------------------------ work order lines
drop policy if exists pms_wo_lines_read on pms_work_order_lines;
create policy pms_wo_lines_read on pms_work_order_lines
  for select to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_wo_lines_insert on pms_work_order_lines;
create policy pms_wo_lines_insert on pms_work_order_lines
  for insert to authenticated
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_wo_lines_update on pms_work_order_lines;
create policy pms_wo_lines_update on pms_work_order_lines
  for update to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)))
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_wo_lines_delete on pms_work_order_lines;
create policy pms_wo_lines_delete on pms_work_order_lines
  for delete to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

-- -------------------------------------------- approval log (append-only)
-- Read and insert only, like the event history: this is the liability record.
--
-- The stamped fleet_client_id must agree with the order's own client, which is
-- the corruption scopeFleetState defends against client-side by dropping
-- mismatched entries. Here it simply cannot be written.
drop policy if exists pms_approval_log_read on pms_approval_log;
create policy pms_approval_log_read on pms_approval_log
  for select to authenticated
  using (
    pms_can_access_client(fleet_client_id)
    and fleet_client_id = pms_client_for_work_order(work_order_id)
  );

drop policy if exists pms_approval_log_insert on pms_approval_log;
create policy pms_approval_log_insert on pms_approval_log
  for insert to authenticated
  with check (
    pms_can_access_client(fleet_client_id)
    and fleet_client_id = pms_client_for_work_order(work_order_id)
  );

-- -------------------------------------------------------- documents
drop policy if exists pms_documents_read on pms_documents;
create policy pms_documents_read on pms_documents
  for select to authenticated
  using (pms_can_access_client(fleet_client_id));

drop policy if exists pms_documents_insert on pms_documents;
create policy pms_documents_insert on pms_documents
  for insert to authenticated
  with check (pms_can_access_client(fleet_client_id));

drop policy if exists pms_documents_delete on pms_documents;
create policy pms_documents_delete on pms_documents
  for delete to authenticated
  using (pms_can_access_client(fleet_client_id));

-- ------------------------------------------------------------ parts
drop policy if exists pms_parts_read on pms_parts;
create policy pms_parts_read on pms_parts
  for select to authenticated
  using (pms_can_access_client(fleet_client_id));

drop policy if exists pms_parts_insert on pms_parts;
create policy pms_parts_insert on pms_parts
  for insert to authenticated
  with check (pms_can_access_client(fleet_client_id));

drop policy if exists pms_parts_update on pms_parts;
create policy pms_parts_update on pms_parts
  for update to authenticated
  using (pms_can_access_client(fleet_client_id))
  with check (pms_can_access_client(fleet_client_id));

-- -------------------------------------------------- purchase orders
drop policy if exists pms_po_read on pms_purchase_orders;
create policy pms_po_read on pms_purchase_orders
  for select to authenticated
  using (pms_can_access_client(fleet_client_id));

drop policy if exists pms_po_insert on pms_purchase_orders;
create policy pms_po_insert on pms_purchase_orders
  for insert to authenticated
  with check (pms_can_access_client(fleet_client_id));

drop policy if exists pms_po_update on pms_purchase_orders;
create policy pms_po_update on pms_purchase_orders
  for update to authenticated
  using (pms_can_access_client(fleet_client_id))
  with check (pms_can_access_client(fleet_client_id));

drop policy if exists pms_po_lines_read on pms_purchase_order_lines;
create policy pms_po_lines_read on pms_purchase_order_lines
  for select to authenticated
  using (exists (
    select 1 from pms_purchase_orders po
    where po.id = purchase_order_id and pms_can_access_client(po.fleet_client_id)
  ));

drop policy if exists pms_po_lines_insert on pms_purchase_order_lines;
create policy pms_po_lines_insert on pms_purchase_order_lines
  for insert to authenticated
  with check (exists (
    select 1 from pms_purchase_orders po
    where po.id = purchase_order_id and pms_can_access_client(po.fleet_client_id)
  ));

-- ------------------------------------------------- approval settings
drop policy if exists pms_approval_settings_read on pms_approval_settings;
create policy pms_approval_settings_read on pms_approval_settings
  for select to authenticated
  using (provider_id = pms_current_provider_id());

-- Only the provider edits the defaults every client inherits. A client editing
-- its own negotiated bands writes to fleet_clients.approval_threshold_overrides
-- instead — writing the global row from a client session was the original bug.
drop policy if exists pms_approval_settings_update on pms_approval_settings;
create policy pms_approval_settings_update on pms_approval_settings
  for update to authenticated
  using (provider_id = pms_current_provider_id() and pms_is_provider_side())
  with check (provider_id = pms_current_provider_id() and pms_is_provider_side());

-- ----------------------------------------------- alert interactions
-- Strictly per-user: a user only ever sees and writes their own bucket.
drop policy if exists pms_alerts_read on pms_alert_interactions;
create policy pms_alerts_read on pms_alert_interactions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists pms_alerts_insert on pms_alert_interactions;
create policy pms_alerts_insert on pms_alert_interactions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists pms_alerts_update on pms_alert_interactions;
create policy pms_alerts_update on pms_alert_interactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- Grants
--
-- RLS constrains WHICH rows; grants constrain WHETHER the role may touch the
-- table at all. `anon` is granted nothing: every read in this app happens as a
-- signed-in user, so an unauthenticated key sees no fleet data whatsoever.
-- =====================================================================
grant usage on schema public to authenticated;

grant select                         on pms_providers            to authenticated;
grant update                         on pms_providers            to authenticated;
grant select, insert, update         on pms_fleet_clients        to authenticated;
grant select, update                 on pms_profiles             to authenticated;
grant select, insert, update, delete on pms_vehicles             to authenticated;
grant select, insert, update         on pms_work_orders          to authenticated;
-- Append-only tables: deliberately no update/delete grant.
grant select, insert                 on pms_work_order_events    to authenticated;
grant select, insert                 on pms_approval_log         to authenticated;
grant select, insert, update, delete on pms_work_order_lines     to authenticated;
grant select, insert, delete         on pms_documents            to authenticated;
grant select, insert, update         on pms_parts                to authenticated;
grant select, insert, update         on pms_purchase_orders      to authenticated;
grant select, insert                 on pms_purchase_order_lines to authenticated;
grant select, update                 on pms_approval_settings    to authenticated;
grant select, insert, update         on pms_alert_interactions   to authenticated;

-- Sequences behind the `seq` bigserial columns.
grant usage on all sequences in schema public to authenticated;
