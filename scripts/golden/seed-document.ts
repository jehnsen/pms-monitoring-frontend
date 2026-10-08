import { resolve } from "node:path";
import { createSeedState } from "@/lib/seed";
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { DEFAULT_APPROVAL_SETTINGS } from "@/lib/approvals";
import type { ApprovalSettings, FleetState, ServiceTask } from "@/types";
import { FROZEN_AT, TIMEZONE } from "./clock";

/**
 * The demo data the API seeder loads, exactly as the app generates it.
 *
 * Shared by scripts/emit-seed-json.ts (which writes it) and
 * scripts/emit-golden-fixtures.ts (whose `$seed` references point into it, and
 * which refuses to run if the file on disk has drifted from this).
 */
export interface SeedDocument {
  frozenAt: string;
  timezone: string;
  generator: string;
  state: FleetState;
  serviceTasks: ServiceTask[];
  defaultApprovalSettings: ApprovalSettings;
}

export const SEED_JSON_PATH = resolve(process.cwd(), "fixtures/seed/demo-seed.json");

/** Call only after freezeClock(): createSeedState() reads "today" from the clock. */
export function buildSeedDocument(): SeedDocument {
  return {
    frozenAt: FROZEN_AT,
    timezone: TIMEZONE,
    generator: "scripts/emit-seed-json.ts — createSeedState() under a frozen clock",
    state: createSeedState(),
    serviceTasks: SERVICE_TASKS,
    defaultApprovalSettings: DEFAULT_APPROVAL_SETTINGS,
  };
}

/** Stable text form: two-space indent, LF, trailing newline. */
export function serialiseSeedDocument(doc: SeedDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
