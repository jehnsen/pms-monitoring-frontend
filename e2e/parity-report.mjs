// Maps the Playwright parity log (parity-log/parity-calls.jsonl) onto the
// rows of ../torquelane-api/docs/frontend-parity.md: for every endpoint a row
// names, which roles' sessions called it from the UI and got a 2xx/3xx.
//
//   node e2e/parity-report.mjs [path/to/frontend-parity.md]
//
// Prints one line per row: the row's first cell, then per endpoint the roles
// that exercised it (PA provider admin, SA service advisor, T provider
// technician, FM fleet manager, V viewer, NW Northwind fleet manager) or
// "not called".
import fs from "node:fs";

const ROLE = { providerAdmin: "PA", serviceAdvisor: "SA", technician: "T", fleetManager: "FM", viewer: "V", northwind: "NW" };
const doc = process.argv[2] ?? "../torquelane-api/docs/frontend-parity.md";
const calls = fs
  .readFileSync("parity-log/parity-calls.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const normalise = (path) => path.split("?")[0].replace(/\{[a-z_]+\}/g, "{id}");

const seen = new Map();
for (const call of calls) {
  const key = `${call.method} ${call.endpoint}`;
  const entry = seen.get(key) ?? { ok: new Set(), refused: new Set() };
  (call.status < 400 ? entry.ok : entry.refused).add(ROLE[call.role] ?? call.role);
  seen.set(key, entry);
}

for (const line of fs.readFileSync(doc, "utf8").split(/\r?\n/)) {
  if (!line.startsWith("| ") || line.startsWith("| Screen") || line.startsWith("| Mutation") || line.startsWith("|---")) continue;
  const cells = line.split("|").map((cell) => cell.trim());
  const endpoints = [...cells[2].matchAll(/`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`/g)].map((m) => `${m[1]} ${normalise(m[2])}`);
  const results = endpoints.map((endpoint) => {
    const entry = seen.get(endpoint);
    if (!entry || entry.ok.size === 0) return `${endpoint}: not called${entry?.refused.size ? ` (refused: ${[...entry.refused].join(" ")})` : ""}`;
    return `${endpoint}: ${[...entry.ok].join(" ")}`;
  });
  console.log(`${cells[1]}\n    ${results.join("\n    ") || "(no endpoint)"}`);
}
