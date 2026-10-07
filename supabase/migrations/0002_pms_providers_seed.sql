-- =====================================================================
-- TorqueLane — demo provider & fleet client seed
--
-- GENERATED FILE — do not edit by hand.
-- Produced by scripts/emit-seed-sql.ts from lib/seed.ts's createSeedState(),
-- split out from the rest of the demo fleet (0006_pms_seed.sql) because this
-- part has to exist first: 0004_pms_service_tasks_seed.sql inserts a
-- catalogue row owned by this provider, and 0005_pms_normalisation.sql's
-- own-tenant backfills assume it too. The rest of the fleet (vehicles, work
-- orders, …) depends on tables 0003/0004/0005 create, so it has to come
-- after them — hence the split.
--
-- To regenerate:  npx vitest run scripts/emit-seed-sql.ts
--
-- Every statement is ON CONFLICT DO NOTHING, so re-running will not duplicate
-- rows. Run AFTER 0001_pms_schema.sql.
-- =====================================================================

-- ------------------------------------------------- providers
insert into pms_providers (id, name, slug, logo_url, brand_color, support_email, created_at) values
  ('prov-mekanikomore', 'MekanikoMoR', 'mekanikomore', null, '#1d5ba6', 'support@mekanikomore.ph', '2024-01-01')
on conflict (id) do nothing;

-- ------------------------------------------------- fleet clients
insert into pms_fleet_clients (id, provider_id, name, slug, contact_name, contact_email, contract_terms, payment_terms_days, approval_threshold_overrides, logo_url, brand_color, status, created_at) values
  ('fc-actimed', 'prov-mekanikomore', 'Actimed', 'actimed', 'Marisol Bautista', 'fleet@actimed.ph', 'Full-service PMS retainer, 16 units', 30, null, null, '#0f7a5a', 'active', '2024-01-01'),
  ('fc-northwind', 'prov-mekanikomore', 'Northwind Logistics', 'northwind', 'Ruben Salcedo', 'fleet@northwind.ph', 'Full-service PMS retainer, 7 units', 45, '{"autoApproveUnder":12000,"slaHours":2}'::jsonb, null, '#8a4b12', 'active', '2024-06-01'),
  ('fc-sagrada', 'prov-mekanikomore', 'Sagrada Medical Transport', 'sagrada', 'Dr. Imelda Cortez', 'operations@sagrada.ph', 'Priority PMS retainer, 5 units, 4-hour response', 15, '{"autoApproveUnder":0,"varianceThresholdPct":5}'::jsonb, null, '#8c1f3d', 'active', '2024-06-01'),
  ('fc-bayani', 'prov-mekanikomore', 'Bayani Construction', 'bayani', 'Andres Malolos', 'yard@bayanicon.ph', 'Pay-per-job, no retainer', 60, null, null, '#6b5a12', 'suspended', '2024-06-01')
on conflict (id) do nothing;

-- --------------------------------------------- approval settings
insert into pms_approval_settings (provider_id, auto_approve_under, ops_approval_under, sla_hours, variance_threshold_pct, default_parts_source, monthly_budget) values
  ('prov-mekanikomore', 5000, 50000, 4, 15, 'supplier_provided', 150000)
on conflict (provider_id) do nothing;
