# MekanikoMoR — System Workflow

How work actually moves through this system, end to end: who does what, what
the software does on its own, and where each rule lives in the code.

This is the behavioural companion to `README.md` (what the app is) and
`CLAUDE.md` (the invariants you must not break while changing it).

---

## 1. The two sides

One codebase serves two audiences, and almost every workflow below crosses
between them.

| | **Provider** — the service centre | **Fleet client** — e.g. Actimed |
|---|---|---|
| Who | Shop owner, service advisors, technicians | Fleet managers, ops, purchasing, drivers |
| Sees | Every client beneath its provider | Exactly its own fleet, never a sibling |
| Home | `/shop` | `/dashboard` |
| Nav | `PROVIDER_NAV_SECTIONS` | `CLIENT_NAV_SECTIONS` |
| Cares about | Bays, the book of work, revenue | Vehicle health, compliance, spend |

`homeHrefFor(role)` decides which side a bare sign-in lands on. Both `/shop`
and `/dashboard` self-guard, so landing on the wrong side by URL shows nothing
rather than another tenant's data.

The tenancy tree is `provider → fleet_client → vehicles → work orders, PMS
intervals, documents`. **A client-side session never sees a sibling client
under the same provider** — that is the specific leak a naive `providerId`
filter would let through, and `lib/tenancy.ts` is the single chokepoint that
prevents it. It fails closed: no scope, an unknown provider, or a suspended
client renders nothing at all rather than falling back to unscoped.

> The seeded `Bayani Construction` client is `suspended` on purpose, so the
> fail-closed path is demonstrable against real data rather than only tested.

---

## 2. The preventive-maintenance engine

Everything downstream — alerts, scheduling, forecasting, revenue — is derived
from this one calculation.

A **PMS item** is one recurring service task measured against one vehicle.
Every task carries two limits, and **is due on whichever arrives first**:

```
intervalKm     ──┐
                 ├──► due on whichever comes first ──► status + governedBy
intervalMonths ──┘
```

To compare a distance against a date, `lib/pms.ts` projects the odometer
forward using the vehicle's rolling `avgDailyKm`, then reports which limit
actually governs (`governedBy: "distance" | "time"`).

| Function | Produces |
|---|---|
| `evaluateTask` | One `PmsItem` — status, km/days remaining, progress, due date |
| `evaluateVehicle` | `VehicleHealth` — items sorted by urgency, counts, score |
| `summariseFleet` | The dashboard's KPI figures |
| `applyCompletion` | What closing a work order does to a vehicle |

Status thresholds (`DUE_SOON_KM` / `DUE_SOON_DAYS`) live in `lib/pms.ts` and
are read from there by the settings page, so they change in one place.

`healthScore` weights are deliberately steep — overdue critical −25, overdue
−15, due-soon critical −8, due-soon −4. A vehicle with two breached safety
intervals must not read as a healthy 90-something.

**Odometer readings are the input everything else trusts.** A reading that is
too high, too low, or older than 14 days is caught by
`lib/odometer-validation.ts` and `isOdometerStale` — because a bad odometer
silently shifts every due date behind it.

---

## 3. Check-in — the counter workflow

`/shop/check-in`. A vehicle arrives; an advisor turns it into scheduled work.

```
plate or VIN typed
   └─► lookupVehicle()            exact match, normalised (case/space/dash)
        ├─ found ──► hydrateCheckInForm()
        │             customer, make/model/year, VIN, driver, last odometer
        └─ miss ──► seed a new-vehicle form with only what was typed
   └─► odometer captured (validated, and written even if nothing is quoted)
   └─► due/overdue items offered  suggestedWorkAtCheckIn()
   └─► one work order raised per accepted item
```

The rule this implements: **the system never asks for data it already holds.**
The plate is the only thing an advisor must read off the vehicle; everything
else is looked up.

Two deliberate refusals:

- **Matching is exact, not prefix.** `ABC1` will not resolve to `ABC1234` —
  hydrating the *wrong* customer is worse than hydrating nothing.
- **A stale reading is not pre-filled.** If the last odometer is over 14 days
  old, the field stays empty (`odometerNeedsConfirmation`) to force a real look
  at the dash.

`lib/checkin.ts` is pure and takes the candidate vehicles as a parameter — the
caller passes the already-scoped list, since a lookup across the raw fleet
would confirm that another client's vehicle exists.

The odometer is written **first and independently**: even if every quoted line
is later declined, the reading still lands, because that is the part of
check-in that keeps every projection honest.

---

## 4. The work order lifecycle

The core state machine. Every job is a **purchase before it is a repair**, so
it passes through approval before anyone touches a spanner.

```
        ┌──────── revise & resend ─────────┐
        ▼                                  │
     draft ──► pending_approval ──►  approved ──► scheduled ──► in_progress ──► closed
                     │              partially_approved                            │
                     └──► declined ─┘                                             ▼
                                                                    collectedAt set ⇒ collected
     (cancelled reachable from any pre-closed state)
```

### Stored statuses vs. the stages users see

`lib/work-order-machine.ts` is the single authority on which transitions are
legal. `lifecycleStage()` projects the nine stored statuses onto the five
stages the business speaks in:

| Stage shown | Stored status |
|---|---|
| Draft | `draft` |
| Pending approval | `pending_approval` |
| Approved | `approved`, `partially_approved` |
| In progress | `scheduled`, `in_progress` |
| Ready for billing | `closed` with `collectedAt` **null** |
| Completed | `closed` with `collectedAt` **set** |

The extra statuses are not noise. `partially_approved` is a real answer — *"do
the brakes, skip the shocks"* — not a half-finished decision. `declined` (a
purchasing decision on the lines) and `cancelled` (the job abandoned) are
different events. And `closed` splits on collection because **revenue is
recognised when the customer takes the vehicle back, not when the work ends**;
the gap between those two moments is the queue the counter works from.

### What the system does on its own

| Trigger | Automatic consequence |
|---|---|
| `draft → pending_approval` | A sequential **order number** is issued (`WO-2026-0007`) |
| Total under the auto-approve ceiling | Every line approves on the spot, actor `System`, logged |
| Approval lands | Job is **assigned to the owning provider** (`assignedProviderId`) |
| Line decided | Order status **re-derived** from the full line set |
| Leaving `pending_approval` | Wait time stamped in *working hours* |
| `closed` | PMS clock resets for every task the order covered |

**Order numbers are issued at approval-send, not at creation.** A draft is the
shop's own scratch space and may never leave it; burning a number on one leaves
a permanent gap in the book. Until then `reference` is `""` — render it through
`displayReference()`, never test for the empty string at a call site.

`nextReference()` scans for the **highest number already issued** across the
provider's whole book, not a count of rows. (Counting was a real bug twice
over: the list being counted was tenant-scoped, so two clients both produced
`WO-2026-0001`; and a filtered-out row made the count go *backwards* onto a
live number.) The generator still runs client-side and can race, so a partial
unique index on `reference` makes the loser's write fail and roll back rather
than silently duplicate.

---

## 5. Approval — per line, not per order

The heart of the client/provider loop. Lives in `lib/approvals.ts`, with the
UI in `components/work-orders/approval-panel.tsx`.

**Approval happens per line**, because the honest real-world answer to a
quotation is rarely all-or-nothing. The order's status is therefore *always*
derived from its line set via `deriveOrderStatus()` and **never set directly**
once the order has left `draft`.

### Who may approve what

`requiredApprover()` evaluates the order's **total pending value** — not any
single line, because approval fatigue is what kills this feature if the
auto-approve band isn't real.

| Pending value (default) | Band | Who can authorise |
|---|---|---|
| under ₱5,000 | `auto` | Nobody — it approves itself, logged as `System` |
| ₱5,000 – ₱50,000 | `operations` | Operations, Purchasing, Fleet Manager, Provider Admin |
| above ₱50,000 | `fleet_manager` | Fleet Manager or Provider Admin only |

A ₱3,000 line inside a ₱60,000 order still needs a Fleet Manager. Service
advisors quote work; they never authorise the spend on it.

Bands are per provider and **overridable per client** —
`FleetClient.approvalThresholdOverrides` is a sparse override folded over the
provider's defaults, so an unset field *inherits* rather than being read as
zero.

### The SLA and the audit trail

A line waiting longer than `slaHours` (default 4) raises an
`approval_sla_breach` alert. Wait time is measured with
`businessHoursBetween()` — always Mon–Fri 08:00–18:00 — so a quote sent Friday
evening doesn't read as three days late by Monday morning.

Every decision appends to `approvalLog`, which is the shop's liability record:
who authorised what, when, and for how much. It carries `fleetClientId`
explicitly so it stays readable in isolation, and the database grants
**select + insert only** — there is no update or delete policy anywhere. Same
for `pms_work_order_events`. Append-only here is *enforced*, not conventional.

---

## 6. Billing

`lib/billing.ts` owns all money arithmetic; nothing else may re-derive it.

```
per line:   quantity × unitPartRate  ──┐
            labourHours × labourRate ──┴──►  Amount

order:      Σ line amounts               ──►  Sub total
                                       +     Misc / shop fee
                                       +     VAT  (12% default, per provider)
                                       ───────────────────────
                                             Grand total
```

Totals are derived on every read and recompute as the user types — there is no
"calculate" button and no stored order total to fall out of date.

**The one thing that *is* stored is each line's extended `partCost` /
`labourCost`**, and deliberately so: that is the historical price the client
approved. Re-deriving it at read time would let a later rate change silently
rewrite an amount someone already authorised. `recalcLine()` is the only
function permitted to write those two fields; never set a cost beside a
qty/rate change or the two drift apart.

Other decisions worth knowing:

- **Approval bands run on the pre-tax subtotal.** A threshold is a decision
  about the work; nobody approves VAT.
- **Rounding happens once per total**, never per line — summing pre-rounded
  lines drifts by a peso or two across a long order.
- **A 0% VAT rate is a real setting** (a non-VAT-registered provider), not a
  missing value.
- **An order with no lines bills nothing at all** — not even the flat misc fee,
  which would otherwise be a charge for no work.
- Orders predating this model carry only aggregate costs;
  `totalsFromSubtotal()` rolls those up by the same rules so they still show a
  grand total instead of zero.

At close-out, if actual cost exceeds the approved amount by more than
`varianceThresholdPct` (default 15%), **closing is blocked** until someone
re-approves the variance, which is itself written to the approval log.

---

## 7. Completion — how a job becomes a service record

Closing a work order is the single most consequential action in the system.

```
technician closes the job
   ├─ odometer at service      (validated, becomes the vehicle's new reading)
   ├─ findings                 the diagnostic half of the record
   ├─ itemised parts fitted    supersedes the estimate
   ├─ tasks ticked             ⇒ each takes this odometer + date as its baseline
   └─ variance re-approved     only if it breached the threshold
```

This is what resets the PMS clock — every ticked task restarts from this
reading and this date, and every downstream figure recalculates. It is captured
*at the moment of completion* because, asked for later, nobody remembers.

Read parts cost through `resolvePartsCost()`, never `order.partsCost`: the
stored field is the estimate, and itemised lines win once a technician records
them.

The job is now `closed` but not yet `collected`. It appears in the counter's
**ready-for-billing** queue until `collectedAt` is stamped at handover — which
is the moment `revenueBetween()` in `lib/shop.ts` recognises the revenue.

---

## 8. Procurement

A parallel loop, driven by the same due-date engine.

```
PMS engine projects what falls due
        │
        ▼
/demand-forecast   parts needed, shortfall vs stock, lead-time risk
        │
        ▼
/purchase-orders   draft ──► sent ──► received  (or cancelled)
        │                                │
        │                                └─► stock replenished
        └─ lines record which vehicle + task they cover,
           so the next forecast excludes them rather than double-counting
```

`lib/parts-forecast.ts` flags `leadTimeRisk` when there is no longer enough
lead time to reorder before the earliest projected need — the difference
between knowing you'll need a part and knowing you're already too late.

Stock is held **per client**, not pooled, and `po:issue` is the capability that
gates raising one.

---

## 9. Alerts and compliance

**Alerts are derived on every read and never stored**, so a notification can
never outlive the condition that caused it.

| Kind | Fires when |
|---|---|
| `pms_overdue` / `pms_due_soon` | An interval is breached or approaching |
| `work_order_overdue` | A job is past its scheduled slot |
| `approval_sla_breach` | A line has waited beyond `slaHours` |
| `document_expiry` | Registration, insurance, or warranty nearing renewal |
| `driver_licence_expiry` | The assigned driver's licence is expiring |

Alert ids must stay **deterministic**, or dismissals stop sticking. Read and
dismissed state is bucketed per tenant scope *and* per user — a provider
dismissing a fleet-wide alert has not decided anything on a client's behalf,
and one colleague's dismissal must not silence an alert for another.

`lib/compliance.ts` treats a narrower set of documents as roadworthiness-
critical (registration, CTPL, comprehensive insurance, emission, franchise).
A lapsed *warranty* is worth a heads-up; it never stops a truck at a checkpoint
the way an expired registration does.

---

## 10. Permissions

Eleven capabilities across eight roles, split by which side of the tenancy
boundary they sit on.

| Provider-side | Client-side |
|---|---|
| `provider_admin` | `fleet_manager` |
| `service_advisor` | `operations` |
| `provider_technician` | `technician` |
| | `purchasing_officer` |
| | `viewer` |

Capabilities: `vehicle:update`, `vehicle:manage`, `workorder:create`,
`workorder:update`, `workorder:complete`, `workorder:approve`, `po:issue`,
`document:upload`, `document:delete`, `settings:manage`, `access:manage`.

Both sides draw from the same capability list — **scope, not capability, is
what stops a provider-side grant from reading as cross-client access.**

Gating lives *inside* the action component (`NewWorkOrderDialog`,
`OdometerDialog`, `UploadDocumentDialog`), never at the call site, so any new
screen inherits it. A denied control renders through `DeniedAction` — dimmed
with a stated reason, **never hidden**, so the interface stays legible about
what exists and why you can't use it.

> **This is a UI affordance, not a security control.** The real boundary is Row
> Level Security in Postgres, which enforces the same tenancy rules
> independently via `pms_visible_client_ids()`. `lib/rls-parity.test.ts` fails
> if the SQL and the TypeScript ever drift apart.

---

## 11. How data moves

```
component ──► useFleet()          already tenant-scoped, PMS engine applied
          └─► useFleetActions()   scoped mutations
                    │
                    ├─ 1. local state updates immediately  (optimistic)
                    ├─ 2. write goes to Postgres
                    └─ 3. on failure: roll back + log
```

Because writes can now fail, **a caller that reports success must check the
result** — the older localStorage implementation could not fail, so this is
genuinely new behaviour.

Every mutation resolves the record's owning client (`clientForVehicle`,
`clientForOrder`, `writeClientId`) before touching anything. Raising a work
order against another tenant's vehicle is a silent no-op, not an error — and
RLS would reject it independently regardless.

Pages that read fleet data are **client components**: due dates depend on
"now", so the server renders an empty shell and the store fills in on mount.
Always check `ready` before rendering data, or the first paint shows zeros.

---

## 12. A complete pass, end to end

Following one real job through every stage above:

1. **Arrival.** A Hiace pulls in. The advisor types `ABC 1234`; the system
   fills in Actimed, the vehicle spec, the driver, and the last reading.
2. **Capture.** The advisor enters `84,910 km`. It validates against the
   vehicle's average and is written immediately.
3. **Offer.** Two intervals are overdue and one is due soon. The advisor
   discusses them and the client accepts two.
4. **Quote.** Two work orders are raised. Each priced as
   `qty × rate` + `hours × rate`; VAT added for the grand total.
5. **Number.** Sent for approval, the order becomes `WO-2026-0043`. The
   client's clock starts, in working hours.
6. **Decision.** ₱18,400 pending puts it in the `operations` band. The fleet
   manager approves the brake line and declines the shocks with a reason.
   Status derives to `partially_approved`; the job is assigned to the provider.
7. **Work.** Scheduled into Bay 2, started, and the technician records what was
   actually fitted.
8. **Close.** Actual is within 15% of approved, so it closes. The brake
   interval resets from 84,910 km and today's date. Alerts for it disappear on
   the next read, because they were never stored.
9. **Handover.** The client collects; `collectedAt` is stamped and the revenue
   is recognised. The declined shocks remain visible on the vehicle's record —
   the liability trail for a decision someone made.

---

## Where the rules live

| Concern | Module |
|---|---|
| Due dates, health scores | `lib/pms.ts` |
| Tenancy scoping | `lib/tenancy.ts` |
| Roles and capabilities | `lib/rbac.ts` |
| Transitions, order numbers | `lib/work-order-machine.ts` |
| Approval bands, SLA, variance | `lib/approvals.ts` |
| All money arithmetic | `lib/billing.ts` |
| Plate/VIN hydration | `lib/checkin.ts` |
| Derived alerts | `lib/alerts.ts` |
| Roadworthiness documents | `lib/compliance.ts` |
| Parts demand and lead time | `lib/parts-forecast.ts` |
| Bays, revenue, floor load | `lib/shop.ts` |
| State, scoped mutations | `lib/store.ts` |
| Row ↔ domain mapping | `lib/mappers.ts` |
| Schema, RLS, grants | `supabase/migrations/` |
