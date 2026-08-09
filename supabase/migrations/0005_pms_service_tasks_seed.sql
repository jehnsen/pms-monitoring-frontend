-- =====================================================================
-- MekanikoMoR — PMS service-task catalogue seed
--
-- GENERATED FILE — do not edit by hand.
-- Produced by scripts/emit-service-tasks-sql.ts from lib/service-tasks.ts's
-- SERVICE_TASKS array (12 tasks), so the database starts with the
-- exact catalogue the app used to ship as a hardcoded list.
--
-- To regenerate:  npx vitest run scripts/emit-service-tasks-sql.ts
--
-- Run AFTER 0004_pms_service_tasks.sql. Idempotent: ON CONFLICT DO NOTHING.
-- =====================================================================

insert into pms_service_tasks (
  id, provider_id, name, category, interval_km, interval_months,
  estimated_cost, estimated_hours, critical
) values
  ('oil-filter', 'prov-mekanikomore', 'Engine oil & filter change', 'engine', 5000, 6, 3200, 1, true),
  ('tire-rotation', 'prov-mekanikomore', 'Tire rotation & pressure check', 'tires', 10000, 6, 900, 0.75, false),
  ('brake-inspection', 'prov-mekanikomore', 'Brake pad & rotor inspection', 'brakes', 15000, 12, 1800, 1.5, true),
  ('air-filter', 'prov-mekanikomore', 'Air filter replacement', 'engine', 20000, 12, 1400, 0.5, false),
  ('cabin-filter', 'prov-mekanikomore', 'Cabin filter replacement', 'body', 20000, 12, 1100, 0.5, false),
  ('battery-check', 'prov-mekanikomore', 'Battery & charging system test', 'electrical', 20000, 12, 750, 0.5, false),
  ('wheel-alignment', 'prov-mekanikomore', 'Wheel alignment & balancing', 'tires', 25000, 18, 2400, 1.5, false),
  ('brake-fluid', 'prov-mekanikomore', 'Brake fluid flush', 'brakes', 40000, 24, 2600, 1.5, true),
  ('transmission-fluid', 'prov-mekanikomore', 'Transmission fluid service', 'drivetrain', 60000, 36, 6800, 2.5, true),
  ('coolant-flush', 'prov-mekanikomore', 'Coolant flush & thermostat check', 'engine', 60000, 36, 4200, 2, true),
  ('timing-belt', 'prov-mekanikomore', 'Timing belt inspection', 'engine', 90000, 60, 12500, 5, true),
  ('safety-inspection', 'prov-mekanikomore', 'Annual roadworthiness inspection', 'safety', 30000, 12, 1800, 2, true)
on conflict (id) do nothing;
