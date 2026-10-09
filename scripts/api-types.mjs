// Generates types/api.ts from the API's committed OpenAPI document.
//
// The API checkout is ../api by convention; on some machines it is the
// sibling ../torquelane-api. API_DIR overrides both.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const candidates = [process.env.API_DIR, "../api", "../torquelane-api"].filter(Boolean);
const spec = candidates
  .map((dir) => resolve(dir, "openapi.json"))
  .find((path) => existsSync(path));

if (!spec) {
  console.error(`openapi.json not found in: ${candidates.join(", ")}. Set API_DIR.`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [resolve("node_modules/openapi-typescript/bin/cli.js"), spec, "-o", "types/api.ts"],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
