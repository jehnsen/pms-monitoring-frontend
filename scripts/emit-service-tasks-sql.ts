/**
 * Emits the static SERVICE_TASKS catalogue as seed SQL for pms_service_tasks.
 *
 * Same rationale as scripts/emit-seed-sql.ts: run the real source (here,
 * lib/service-tasks.ts's `SERVICE_TASKS` array) rather than hand-transcribing
 * it, so the seeded rows can't drift from what the app used to ship as a
 * hardcoded list.
 *
 * Run via: npx vitest run scripts/emit-service-tasks-sql.ts
 * Writes:  supabase/migrations/0005_pms_service_tasks_seed.sql
 *
 * This is a build-time authoring tool, not part of the app.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { SEED_PROVIDER } from "@/lib/tenant";

function lit(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

test("emit service tasks sql", () => {
  const rows = SERVICE_TASKS.map((task) => [
    lit(task.id),
    lit(SEED_PROVIDER.id),
    lit(task.name),
    lit(task.category),
    lit(task.intervalKm),
    lit(task.intervalMonths),
    lit(task.estimatedCost),
    lit(task.estimatedHours),
    lit(task.critical),
  ]);

  const sql = `-- =====================================================================
-- MekanikoMoR — PMS service-task catalogue seed
--
-- GENERATED FILE — do not edit by hand.
-- Produced by scripts/emit-service-tasks-sql.ts from lib/service-tasks.ts's
-- SERVICE_TASKS array (${rows.length} tasks), so the database starts with the
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
${rows.map((r) => `  (${r.join(", ")})`).join(",\n")}
on conflict (id) do nothing;
`;

  const dir = resolve(__dirname, "../supabase/migrations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "0005_pms_service_tasks_seed.sql"), sql, "utf8");
  console.log(`service tasks: ${rows.length} rows`);
});
