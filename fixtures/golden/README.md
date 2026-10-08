# Golden fixtures

The exact behaviour of the TypeScript domain modules in `lib/`, captured as
JSON so the PHP port in the Laravel API can be proven against it, case by
case. **Generated. Do not edit by hand.**

```bash
npx vitest run scripts/emit-seed-json.ts        # fixtures/seed/demo-seed.json
npx vitest run scripts/emit-golden-fixtures.ts  # this directory
```

Both are deterministic: running either twice produces byte-identical files.
Per-module case counts, and the few tests that have no case, are in
[COVERAGE.md](COVERAGE.md).

## Where cases come from

- **Replayed tests.** Every `lib/*.test.ts` runs inside the emitter with the
  domain modules wrapped. Each top-level call a test makes becomes a case
  named after the test (`lib/billing.test.ts > computeTotals > …`). Several
  calls in one test are numbered `[i/n]`. A call made at `describe` scope,
  whose result the tests then assert on, is named after the describe block and
  suffixed `(computed at describe scope, asserted by its tests)`. The tests'
  own assertions still run, so fixtures only get written while the suite
  passes.
- **Sweeps** (`sweep › …`). Systematic coverage: the whole seed fleet, every
  work-order transition × role, every demo account, and edge-case grids.

Only top-level calls are cases. `evaluateVehicle` calling `computeIntervalStatus`
internally does not produce a separate case.

## File shape

Each `<module>.json` is an array of cases, one per line:

```json
{ "case": "sweep › roundMoney › 2.675", "fn": "roundMoney", "input": [ … ], "output": … }
```

- `fn`: the exported function's name. A `$`-prefixed `fn` is not a single
  function: `$clock`, `$constants`, or a composition (see below).
- `input`: the **positional argument list**, exactly as passed.
- `output`: the return value, or `{ "$throws": "message" }`.

The first two cases of every file are:

| `fn` | `output` |
|---|---|
| `$clock` | `{ frozenAt: "2026-10-08T10:00:00+08:00", timezone: "Asia/Manila", seed }`. Every case was computed with the clock frozen here, so any "now"/"today" a function defaults to is this instant. |
| `$constants` | Every non-function export of the module (thresholds, label maps, catalogues). `shop.json` also carries `BAYS` / `TOTAL_BAY_CAPACITY_HOURS`, which its floor maths reads. `parts.json` has *only* this case: `lib/parts.ts` is pure data. |

### Compositions

| `fn` | Meaning |
|---|---|
| `$authorizeTransition` (work-order-machine) | `input: [order, to, role]`. `output: { transition, roleHasCapability, allowed }`. `transition` is `checkTransition(order, to)`. `roleHasCapability` is `rbac.can(role, transition.capability)` (`true` when no capability is needed, `null` when the transition itself is illegal). `allowed` is both. Enumerates every from × to × role. |

## Value encoding

Plain JSON values are themselves. Everything else is a single-key (or
`$`-keyed) object:

| Encoding | Meaning |
|---|---|
| `{ "$date": "2026-10-08T10:00:00.000+08:00" }` | A JS `Date`, in Asia/Manila with its offset. Date-only **strings** in the domain types (`"2026-10-08"`) stay strings. |
| `{ "$undefined": true }` | An explicit `undefined` argument or array element. An `undefined` object property is simply absent. |
| `{ "$number": "Infinity" }` | `NaN`, `Infinity`, `-Infinity`. |
| `{ "$map": [[k, v], …] }`, `{ "$set": [ … ] }` | `Map` / `Set`, in insertion order. |
| `{ "$money": 1234.5, "cents": 123450 }` | A peso amount. `$money` is the number the TypeScript produced. `cents` is `Math.round($money × 100)`, so the PHP side can assert in integer cents. |
| `{ "$money": 0.335, "cents": 34, "subCentavo": true }` | An amount that is **not** a whole number of centavos (a 3-decimal rate, a margin). `cents` is a rounded approximation; compare `$money` instead. |
| `{ "$seed": "state/vehicles/veh-001" }` | A value equal to that node of `fixtures/seed/demo-seed.json` (see below). |
| `{ "$health": "veh-001" }` | A value equal to the fleet health computed from the seed (see below). |

**Which numbers are money.** These keys, wherever they appear:
`amountAtTime autoApproveUnder defaultLabourRate estimatedCost grandTotal labourCost labourRate labourTotal laborCost margin miscFeeFlat miscTotal monthlyBudget opsApprovalUnder outstanding ownStockValue partCost partsCost partsTotal spendThisPeriod subTotal supplierProvidedValue taxTotal totalValue unitCost unitPartRate`.
A few keys count as money only in particular functions: `parts`/`labor`/`total`
in `monthlyCosts`, `current`/`previous` in `rollingSpend`, and `value` in
`revenueByClient`, `revenueByServiceItem`, `spendByVehicle` and
`spendByCategory`. Bare amounts are money in the arguments of
`requiredApprover` (0), `canApprove` (1), `varianceExceeds` (0, 1),
`totalsFromSubtotal` (0, 1) and `roundMoney` (0). They are also money in the
results of `roundMoney`, `linePartAmount`, `lineLabourAmount`, `lineAmount`,
`approvedGrandTotal`, `lineCost`, `sumLinesByStatus`, `pendingValue`,
`approvedValue`, `declinedValue`, `resolvePartsCost`, `workOrderCost`,
`revenueBetween` and `authorisedValue`. Inside a `$seed` reference, money is
raw, exactly as in the seed file.

### References

`$seed` and `$health` keep the fixtures small. Without them, every whole-fleet
case would inline the entire 1 MB seed.

- **`$seed: path`.** A path into `fixtures/seed/demo-seed.json`. Segments are
  separated by `/`. At an array, a segment selects the element whose `id`
  equals it, or else is a numeric index. The empty path is the whole document.
  Common roots: `state/<collection>`, `state/<collection>/<id>`,
  `serviceTasks/<id>`, `defaultApprovalSettings`. A reference means *equal
  to* that node, which covers the very same object and also an equal copy (a
  test that generated its own seed with the same clock).
- **`$health: "*"`** is the fleet health array: the `output` of the case
  `sweep › evaluateFleet › whole seed fleet (defines $health)` in `pms.json`.
  **`$health: "<vehicleId>/…"`** is that vehicle's entry, followed by the
  same path rules (e.g. `veh-001/items/3`). Because of this, `evaluateVehicle`
  and `evaluateTask` sweep outputs are references into that one case. The port
  is proven by matching it.

Resolve references before comparing. They appear in both `input` and
`output`.

## Things the port must decide deliberately

- **Float rounding.** `roundMoney` is `Math.round(x × 100) / 100` on IEEE-754
  doubles, so `roundMoney(1.005)` is **1** (1.005 × 100 = 100.4999…) while
  `roundMoney(2.675)` is **2.68**. These are pinned in `billing.json`
  (`sweep › roundMoney › …`, the `3 × 0.335` lines). Exact decimal half-up
  arithmetic in PHP gives 1.01 for the first. Matching the fixture means
  reproducing the float behaviour. Departing from it is a decision to record,
  not a test to skip.
- **Strings are output.** Alert bodies, odometer warnings, check-in messages
  and `denialReason` are compared verbatim. That includes the number
  formatting from `lib/utils.ts` (`formatKm` → `23,000 km`, `formatDayDelta`
  → `460 days overdue`).
- **Alert ids are identity.** `pms:<vehicleId>:<taskId>`, `wo:<orderId>`,
  `approval-sla:<orderId>`, `doc:<documentId>`, `licence:<vehicleId>`. Users'
  read/dismiss state is keyed on them, so they must match exactly.
- **Timezone.** Every date calculation ran in Asia/Manila local time:
  calendar-day differences, `startOfDay`, business hours (Mon–Fri
  08:00–18:00, no holidays).
