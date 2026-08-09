-- =====================================================================
-- MekanikoMoR — referential normalisation of the pms_ tables
--
-- Three denormalisations are removed here, all of the same shape: a value
-- that already has an authoritative row somewhere was being stored as
-- repeated free text or as an untyped array/blob on the referencing row.
--
--   1. `pms_work_order_lines.description` / `pms_purchase_order_lines.description`
--      repeated a catalogue task name on every line. Now `service_task_id`
--      references pms_service_tasks, with the text kept only for ad-hoc work.
--   2. `pms_work_orders.technician` / `.vendor` repeated a name per order.
--      Now pms_technicians / pms_vendors rows, referenced by id.
--   3. `task_ids[]`, `service_task_ids[]`, `vehicle_ids[]` and the `parts`
--      jsonb blob were arrays with no referential integrity and no way to
--      ask "which orders touched this task". Now junction tables.
--
-- NOT changed, deliberately: the enum columns (pms_task_category,
-- pms_line_urgency, pms_parts_source, …). A Postgres enum is already stored
-- as a 4-byte oid on the row — the label text lives once in pg_enum, not per
-- row. Replacing them with lookup tables would *grow* every row (a text FK
-- plus an index) and add a join per read. They are left alone.
--
-- Ad-hoc lines are why every new FK is nullable: a technician recording a
-- repair that isn't in the catalogue has no service_task_id, and the schema
-- must not force one. `description` therefore survives as the fallback label
-- rather than being dropped.
--
-- Backfill matches existing rows by name. Rows that don't match keep their
-- text and leave the FK null — that is the correct outcome for genuinely
-- ad-hoc work, not a failure.
--
-- Idempotent: safe to run more than once.
-- =====================================================================


-- =====================================================================
-- 1. Technicians and vendors — shop-level catalogues
--
-- Scope is the provider, matching pms_service_tasks: a technician is a
-- property of the shop, not of one fleet client. lib/technicians.ts was a
-- static list for the same reason bays still are.
-- =====================================================================

create table if not exists pms_technicians (
  id           text primary key,
  provider_id  text not null references pms_providers(id) on delete cascade,
  name         text not null,
  -- Advisory only, exactly as Bay.focus is: nothing stops a job going to a
  -- technician outside their specialty.
  specialty    text not null default 'general',
  home_bay_id  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (provider_id, name)
);

create index if not exists pms_technicians_provider_idx
  on pms_technicians(provider_id);

create table if not exists pms_vendors (
  id           text primary key,
  provider_id  text not null references pms_providers(id) on delete cascade,
  name         text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (provider_id, name)
);

create index if not exists pms_vendors_provider_idx
  on pms_vendors(provider_id);


-- =====================================================================
-- 2. Backfill the catalogues from the free text already on work orders
--
-- Distinct non-empty names become rows. Ids are derived from the name so a
-- re-run maps to the same row rather than duplicating it.
-- =====================================================================

-- A stable slug for derived ids: lowercase, non-alphanumerics to hyphens.
create or replace function pms_slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

insert into pms_technicians (id, provider_id, name)
select distinct
  'tech-' || c.provider_id || '-' || pms_slugify(o.technician),
  c.provider_id,
  o.technician
from pms_work_orders o
join pms_vehicles v      on v.id = o.vehicle_id
join pms_fleet_clients c on c.id = v.fleet_client_id
where coalesce(o.technician, '') <> ''
  and pms_slugify(o.technician) <> ''
on conflict (id) do nothing;

insert into pms_vendors (id, provider_id, name)
select distinct
  'vendor-' || c.provider_id || '-' || pms_slugify(o.vendor),
  c.provider_id,
  o.vendor
from pms_work_orders o
join pms_vehicles v      on v.id = o.vehicle_id
join pms_fleet_clients c on c.id = v.fleet_client_id
where coalesce(o.vendor, '') <> ''
  and pms_slugify(o.vendor) <> ''
on conflict (id) do nothing;


-- =====================================================================
-- 3. Work orders reference the catalogues by id
--
-- The text columns are kept and left populated. Dropping them would make
-- this migration irreversible against live data, and an order whose
-- technician has since left the shop still needs to render a name. The FK
-- is the source of truth when set; the text is the historical label.
-- =====================================================================

alter table pms_work_orders
  add column if not exists technician_id text references pms_technicians(id) on delete set null,
  add column if not exists vendor_id     text references pms_vendors(id)     on delete set null;

create index if not exists pms_work_orders_technician_idx
  on pms_work_orders(technician_id);
create index if not exists pms_work_orders_vendor_idx
  on pms_work_orders(vendor_id);

update pms_work_orders o
set technician_id = t.id
from pms_technicians t,
     pms_vehicles v,
     pms_fleet_clients c
where v.id = o.vehicle_id
  and c.id = v.fleet_client_id
  and t.provider_id = c.provider_id
  and t.name = o.technician
  and o.technician_id is null;

update pms_work_orders o
set vendor_id = d.id
from pms_vendors d,
     pms_vehicles v,
     pms_fleet_clients c
where v.id = o.vehicle_id
  and c.id = v.fleet_client_id
  and d.provider_id = c.provider_id
  and d.name = o.vendor
  and o.vendor_id is null;


-- =====================================================================
-- 4. Work-order lines reference the service-task catalogue
--
-- `description` becomes nullable-in-spirit: still not null (so no mapper
-- default is needed) but now redundant whenever service_task_id is set.
-- =====================================================================

alter table pms_work_order_lines
  add column if not exists service_task_id text
    references pms_service_tasks(id) on delete set null;

create index if not exists pms_work_order_lines_task_idx
  on pms_work_order_lines(service_task_id);

-- Name match is case-insensitive: the seed writes catalogue names verbatim,
-- but hand-entered lines vary in casing.
update pms_work_order_lines l
set service_task_id = t.id
from pms_service_tasks t,
     pms_work_orders o,
     pms_vehicles v,
     pms_fleet_clients c
where o.id = l.work_order_id
  and v.id = o.vehicle_id
  and c.id = v.fleet_client_id
  and t.provider_id = c.provider_id
  and lower(t.name) = lower(l.description)
  and l.service_task_id is null;

alter table pms_purchase_order_lines
  add column if not exists service_task_id text
    references pms_service_tasks(id) on delete set null,
  add column if not exists part_ref text
    references pms_parts(id) on delete set null;

create index if not exists pms_purchase_order_lines_task_idx
  on pms_purchase_order_lines(service_task_id);

-- `part_id` was a bare text column with no FK — it held a pms_parts id all
-- along, but nothing enforced it. part_ref is the enforced version; part_id
-- stays so a row pointing at a deleted part keeps its historical id.
update pms_purchase_order_lines l
set part_ref = p.id
from pms_parts p
where p.id = l.part_id
  and l.part_ref is null;


-- =====================================================================
-- 5. Junction tables replacing the id arrays
--
-- `task_ids text[]` could not be joined, could not be constrained, and made
-- "which work orders covered this task" a full scan with an array operator.
-- The arrays are kept in place for one release so a rollback doesn't lose
-- data; the app reads the junction tables.
-- =====================================================================

create table if not exists pms_work_order_tasks (
  work_order_id   text not null references pms_work_orders(id)   on delete cascade,
  service_task_id text not null references pms_service_tasks(id) on delete cascade,
  primary key (work_order_id, service_task_id)
);

create index if not exists pms_work_order_tasks_task_idx
  on pms_work_order_tasks(service_task_id);

insert into pms_work_order_tasks (work_order_id, service_task_id)
select distinct o.id, t.id
from pms_work_orders o
join lateral unnest(o.task_ids) as task_id on true
join pms_service_tasks t on t.id = task_id
on conflict do nothing;

create table if not exists pms_purchase_order_line_tasks (
  purchase_order_line_id text not null
    references pms_purchase_order_lines(id) on delete cascade,
  service_task_id text not null
    references pms_service_tasks(id) on delete cascade,
  primary key (purchase_order_line_id, service_task_id)
);

insert into pms_purchase_order_line_tasks (purchase_order_line_id, service_task_id)
select distinct l.id, t.id
from pms_purchase_order_lines l
join lateral unnest(l.service_task_ids) as task_id on true
join pms_service_tasks t on t.id = task_id
on conflict do nothing;

create table if not exists pms_purchase_order_line_vehicles (
  purchase_order_line_id text not null
    references pms_purchase_order_lines(id) on delete cascade,
  vehicle_id text not null
    references pms_vehicles(id) on delete cascade,
  primary key (purchase_order_line_id, vehicle_id)
);

insert into pms_purchase_order_line_vehicles (purchase_order_line_id, vehicle_id)
select distinct l.id, v.id
from pms_purchase_order_lines l
join lateral unnest(l.vehicle_ids) as vehicle_id on true
join pms_vehicles v on v.id = vehicle_id
on conflict do nothing;


-- =====================================================================
-- 6. Fitted parts move out of the jsonb blob onto rows
--
-- `pms_work_orders.parts` held PartLine objects — a part id, name, quantity
-- and unit cost per entry, with the name duplicated from pms_parts on every
-- work order. As rows they gain a real FK and become aggregatable in SQL.
--
-- `resolvePartsCost` semantics are preserved exactly: the aggregate
-- `parts_cost` stays authoritative while a job has no fitted-part rows.
-- =====================================================================

create table if not exists pms_work_order_parts (
  id            text primary key,
  work_order_id text not null references pms_work_orders(id) on delete cascade,
  -- Nullable for the same reason the line FKs are: a part fitted off the
  -- shelf that was never catalogued has no pms_parts row.
  part_id       text references pms_parts(id) on delete set null,
  -- The SKU as recorded on the job. Kept alongside the FK because the domain's
  -- PartLine carries a part *number*, and because a job's record of what was
  -- fitted must survive the catalogue row being deleted.
  part_number   text not null default '',
  -- Historical label, and the fallback when part_id is null.
  name          text not null default '',
  quantity      numeric not null default 0,
  unit_cost     numeric not null default 0,
  seq           bigserial
);

create index if not exists pms_work_order_parts_order_idx
  on pms_work_order_parts(work_order_id);
create index if not exists pms_work_order_parts_part_idx
  on pms_work_order_parts(part_id);

insert into pms_work_order_parts
  (id, work_order_id, part_id, part_number, name, quantity, unit_cost)
select
  coalesce(nullif(p.value->>'id', ''), o.id || '-part-' || p.ord),
  o.id,
  -- The blob carries a SKU, not a pms_parts id. Resolve it within the owning
  -- fleet client — SKUs are per-client, so a bare SKU match across clients
  -- would attach one tenant's part row to another tenant's job.
  (
    select x.id
    from pms_parts x
    join pms_vehicles v2 on v2.id = o.vehicle_id
    where x.sku = p.value->>'partNumber'
      and x.fleet_client_id = v2.fleet_client_id
    limit 1
  ),
  coalesce(p.value->>'partNumber', ''),
  coalesce(p.value->>'name', ''),
  coalesce((p.value->>'quantity')::numeric, 0),
  coalesce((p.value->>'unitCost')::numeric, 0)
from pms_work_orders o
join lateral jsonb_array_elements(
  case when jsonb_typeof(o.parts) = 'array' then o.parts else '[]'::jsonb end
) with ordinality as p(value, ord) on true
on conflict (id) do nothing;


-- =====================================================================
-- 7. Row level security
--
-- Every new table needs policies AND grants or lib/rls-parity.test.ts fails
-- — and, far more to the point, an unprotected pms_ table is readable by
-- every authenticated user of the shared project, including the unrelated
-- application's users.
--
-- Two shapes here:
--   - Provider-scoped catalogues (technicians, vendors): readable by every
--     session beneath the provider, writable provider-side only. Mirrors
--     pms_service_tasks exactly.
--   - Child tables of a tenant-scoped parent: visibility is the parent's,
--     resolved through the same pms_can_access_client() the parent uses.
--     Never a providerId filter — that is the sibling leak.
-- =====================================================================

alter table pms_technicians                    enable row level security;
alter table pms_vendors                        enable row level security;
alter table pms_work_order_tasks               enable row level security;
alter table pms_purchase_order_line_tasks      enable row level security;
alter table pms_purchase_order_line_vehicles   enable row level security;
alter table pms_work_order_parts               enable row level security;

/* ------------------------------------------------------- technicians */

drop policy if exists pms_technicians_read on pms_technicians;
create policy pms_technicians_read on pms_technicians
  for select to authenticated
  using (provider_id = pms_current_provider_id());

drop policy if exists pms_technicians_insert on pms_technicians;
create policy pms_technicians_insert on pms_technicians
  for insert to authenticated
  with check (pms_is_provider_side() and provider_id = pms_current_provider_id());

drop policy if exists pms_technicians_update on pms_technicians;
create policy pms_technicians_update on pms_technicians
  for update to authenticated
  using (provider_id = pms_current_provider_id() and pms_is_provider_side())
  with check (provider_id = pms_current_provider_id());

drop policy if exists pms_technicians_delete on pms_technicians;
create policy pms_technicians_delete on pms_technicians
  for delete to authenticated
  using (provider_id = pms_current_provider_id() and pms_is_provider_side());

/* ----------------------------------------------------------- vendors */

drop policy if exists pms_vendors_read on pms_vendors;
create policy pms_vendors_read on pms_vendors
  for select to authenticated
  using (provider_id = pms_current_provider_id());

drop policy if exists pms_vendors_insert on pms_vendors;
create policy pms_vendors_insert on pms_vendors
  for insert to authenticated
  with check (pms_is_provider_side() and provider_id = pms_current_provider_id());

drop policy if exists pms_vendors_update on pms_vendors;
create policy pms_vendors_update on pms_vendors
  for update to authenticated
  using (provider_id = pms_current_provider_id() and pms_is_provider_side())
  with check (provider_id = pms_current_provider_id());

drop policy if exists pms_vendors_delete on pms_vendors;
create policy pms_vendors_delete on pms_vendors
  for delete to authenticated
  using (provider_id = pms_current_provider_id() and pms_is_provider_side());

/* -------------------------------------------- work order ↔ task junction */

drop policy if exists pms_work_order_tasks_read on pms_work_order_tasks;
create policy pms_work_order_tasks_read on pms_work_order_tasks
  for select to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_tasks_insert on pms_work_order_tasks;
create policy pms_work_order_tasks_insert on pms_work_order_tasks
  for insert to authenticated
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_tasks_update on pms_work_order_tasks;
create policy pms_work_order_tasks_update on pms_work_order_tasks
  for update to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)))
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_tasks_delete on pms_work_order_tasks;
create policy pms_work_order_tasks_delete on pms_work_order_tasks
  for delete to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

/* ------------------------------------------------ fitted parts on a job */

drop policy if exists pms_work_order_parts_read on pms_work_order_parts;
create policy pms_work_order_parts_read on pms_work_order_parts
  for select to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_parts_insert on pms_work_order_parts;
create policy pms_work_order_parts_insert on pms_work_order_parts
  for insert to authenticated
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_parts_update on pms_work_order_parts;
create policy pms_work_order_parts_update on pms_work_order_parts
  for update to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)))
  with check (pms_can_access_client(pms_client_for_work_order(work_order_id)));

drop policy if exists pms_work_order_parts_delete on pms_work_order_parts;
create policy pms_work_order_parts_delete on pms_work_order_parts
  for delete to authenticated
  using (pms_can_access_client(pms_client_for_work_order(work_order_id)));

/* ----------------------------------- purchase order line junctions */

-- Resolves a PO line to its owning fleet client, the same way
-- pms_client_for_work_order resolves an order through its vehicle.
create or replace function pms_client_for_po_line(line_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select po.fleet_client_id
  from pms_purchase_order_lines l
  join pms_purchase_orders po on po.id = l.purchase_order_id
  where l.id = line_id;
$$;

drop policy if exists pms_po_line_tasks_read on pms_purchase_order_line_tasks;
create policy pms_po_line_tasks_read on pms_purchase_order_line_tasks
  for select to authenticated
  using (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));

drop policy if exists pms_po_line_tasks_insert on pms_purchase_order_line_tasks;
create policy pms_po_line_tasks_insert on pms_purchase_order_line_tasks
  for insert to authenticated
  with check (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));

drop policy if exists pms_po_line_tasks_update on pms_purchase_order_line_tasks;
create policy pms_po_line_tasks_update on pms_purchase_order_line_tasks
  for update to authenticated
  using (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)))
  with check (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));

drop policy if exists pms_po_line_tasks_delete on pms_purchase_order_line_tasks;
create policy pms_po_line_tasks_delete on pms_purchase_order_line_tasks
  for delete to authenticated
  using (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));

drop policy if exists pms_po_line_vehicles_read on pms_purchase_order_line_vehicles;
create policy pms_po_line_vehicles_read on pms_purchase_order_line_vehicles
  for select to authenticated
  using (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));

drop policy if exists pms_po_line_vehicles_insert on pms_purchase_order_line_vehicles;
create policy pms_po_line_vehicles_insert on pms_purchase_order_line_vehicles
  for insert to authenticated
  with check (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));

drop policy if exists pms_po_line_vehicles_update on pms_purchase_order_line_vehicles;
create policy pms_po_line_vehicles_update on pms_purchase_order_line_vehicles
  for update to authenticated
  using (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)))
  with check (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));

drop policy if exists pms_po_line_vehicles_delete on pms_purchase_order_line_vehicles;
create policy pms_po_line_vehicles_delete on pms_purchase_order_line_vehicles
  for delete to authenticated
  using (pms_can_access_client(pms_client_for_po_line(purchase_order_line_id)));


-- =====================================================================
-- 8. Grants
--
-- Nothing to anon, ever — a grant there would expose fleet rows to any
-- holder of the public key.
-- =====================================================================

grant select, insert, update, delete on pms_technicians                  to authenticated;
grant select, insert, update, delete on pms_vendors                      to authenticated;
grant select, insert, update, delete on pms_work_order_tasks             to authenticated;
grant select, insert, update, delete on pms_purchase_order_line_tasks    to authenticated;
grant select, insert, update, delete on pms_purchase_order_line_vehicles to authenticated;
grant select, insert, update, delete on pms_work_order_parts             to authenticated;
