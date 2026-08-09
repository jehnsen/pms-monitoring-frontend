-- =====================================================================
-- MekanikoMoR — dynamic PMS service-task catalogue
--
-- The interval catalogue (`SERVICE_TASKS` in lib/service-tasks.ts) was a
-- static, hardcoded list — the same pattern as bays and technicians. This
-- moves it into the database so a provider can add or retune intervals
-- without a code change, the same way it already manages fleet clients.
--
-- Scope: global to the provider, like the static list was. Every fleet client
-- beneath a provider is measured against the same catalogue; this mirrors how
-- bays/technicians work and keeps `Vehicle.taskState` keys (task ids) stable
-- across clients rather than per-client.
--
-- Idempotent: safe to run more than once.
-- =====================================================================

create table if not exists pms_service_tasks (
  id               text primary key,
  provider_id      text not null references pms_providers(id) on delete cascade,
  name             text not null,
  category         pms_task_category not null default 'other',
  interval_km      int not null default 0,
  interval_months  int not null default 0,
  estimated_cost   numeric not null default 0,
  estimated_hours  numeric not null default 0,
  -- Skipping this one takes the vehicle off the road — drives the steep
  -- healthScore penalty in lib/pms.ts. Never soften that weighting.
  critical         boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists pms_service_tasks_provider_idx on pms_service_tasks(provider_id);

alter table pms_service_tasks enable row level security;

-- Every session beneath the provider reads the same catalogue — client-side
-- roles included, since a fleet manager needs to see what their vehicles are
-- measured against even though only the provider can change it.
drop policy if exists pms_service_tasks_read on pms_service_tasks;
create policy pms_service_tasks_read on pms_service_tasks
  for select to authenticated
  using (provider_id = pms_current_provider_id());

-- Provider-side only, mirroring pms_fleet_clients_insert/update: a fleet
-- client cannot edit the schedule every client is measured against.
drop policy if exists pms_service_tasks_insert on pms_service_tasks;
create policy pms_service_tasks_insert on pms_service_tasks
  for insert to authenticated
  with check (pms_is_provider_side() and provider_id = pms_current_provider_id());

drop policy if exists pms_service_tasks_update on pms_service_tasks;
create policy pms_service_tasks_update on pms_service_tasks
  for update to authenticated
  using (provider_id = pms_current_provider_id() and pms_is_provider_side())
  with check (provider_id = pms_current_provider_id());

drop policy if exists pms_service_tasks_delete on pms_service_tasks;
create policy pms_service_tasks_delete on pms_service_tasks
  for delete to authenticated
  using (provider_id = pms_current_provider_id() and pms_is_provider_side());

grant select, insert, update, delete on pms_service_tasks to authenticated;
