/**
 * Emits the demo data as JSON for the Laravel API's seeder.
 *
 * Like scripts/emit-seed-sql.ts, this runs the real `createSeedState()` rather
 * than restating it, so the API starts from byte-identical data to what this
 * app generates. Unlike that script, the clock is frozen (scripts/golden/clock.ts),
 * so the output is reproducible: every relative date in the seed ("serviced
 * 40 days ago") lands on the same calendar day every run.
 *
 * Run via: npx vitest run scripts/emit-seed-json.ts
 * Writes:  fixtures/seed/demo-seed.json
 *
 * Money is left exactly as the app stores it (pesos as numbers); the seeder
 * converts to *_cents. Nothing here is rounded or reshaped.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, vi } from "vitest";

// Before any import that might read the clock.
await vi.hoisted(async () => {
  const { freezeClock } = await import("./golden/clock");
  freezeClock();
});

import { buildSeedDocument, SEED_JSON_PATH, serialiseSeedDocument } from "./golden/seed-document";

test("emit seed json", () => {
  const first = serialiseSeedDocument(buildSeedDocument());
  // The generator is deterministic under a frozen clock; prove it before writing.
  expect(serialiseSeedDocument(buildSeedDocument())).toBe(first);

  mkdirSync(dirname(SEED_JSON_PATH), { recursive: true });
  writeFileSync(SEED_JSON_PATH, first);
  console.log(`wrote ${SEED_JSON_PATH} (${(first.length / 1024).toFixed(0)} KiB)`);
});
