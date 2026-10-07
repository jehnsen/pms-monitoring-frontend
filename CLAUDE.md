# TorqueLane — Fleet PMS & Maintenance

Next.js 14 (App Router) · TypeScript · Tailwind · Radix primitives · Recharts ·
date-fns · lucide-react · Supabase (Postgres + Auth). See "Data" below.

TorqueLane is the platform; **MekanikoMoR** is its original provider tenant
(see "Rebrand" / `lib/platform.ts` vs `lib/tenant.ts`) and is becoming one of
potentially many as the ERP conversion below proceeds.

Two sides share one codebase: the **provider** (the service centre running
this instance — shop owner, service advisors, technicians) and its **fleet
clients** (Actimed and others, who each see only their own fleet). See
"Tenancy" before touching anything cross-cutting.

## Commands

```bash
npm run dev     # dev server
npm run build   # production build (run before calling work done)
npm run lint
npx tsc --noEmit
npm test        # vitest run — lib/ and server/ unit tests, no database
npm run test:db # live suite (tests/integration) — needs `npx supabase start`
```

Server commands need `DATABASE_URL` (the Supavisor **transaction** pooler,
port 6543, `postgresql://postgres.<ref>:<password>@…:6543/postgres`) and should
run with `TZ=Asia/Manila`. Without `DATABASE_URL` every work-order write fails
closed with a generic "nothing was changed" error.

## Domain model — read this before touching maintenance logic

A **PMS item** is one recurring service task evaluated against one vehicle. Every
task has two limits, `intervalKm` and `intervalMonths`, and **is due on whichever
arrives first**. `lib/pms.ts` projects the distance limit onto the calendar via
the vehicle's `avgDailyKm` so the two are comparable, then reports which one
governs (`governedBy`).

- `evaluateTask` → one `PmsItem` (status, km/days remaining, progress, due date)
- `evaluateVehicle` → `VehicleHealth` (items sorted by urgency, counts, score)
- `summariseFleet` → the dashboard's KPI figures
- `applyCompletion` → what closing a work order does to a vehicle

Thresholds live in `lib/pms.ts` as `DUE_SOON_KM` / `DUE_SOON_DAYS`; the settings
page reads them from there, so change them in one place.

The catalogue itself — `pms_service_tasks`, mapped through `ServiceTask` —
lives in the database, provider-global like bays and technicians (see below):
every fleet client beneath a provider is measured against the same schedule.
`evaluateVehicle`/`evaluateFleet` take it as an optional parameter defaulting
to `SERVICE_TASKS` (`lib/service-tasks.ts`, now used only as that default and
by `lib/seed.ts`'s generator) — `useFleet()` passes the live list from
`lib/store.ts`. Provider-admin CRUD is `addServiceTask` /`updateServiceTask` /
`deleteServiceTask` in `useFleetActions()`, gated by `settings:manage`. Editing
an interval does not retroactively touch any vehicle's `taskState`.

`healthScore` weights are deliberately steep (overdue critical −25, overdue −15,
due-soon critical −8, due-soon −4). A vehicle with two breached safety intervals
must not read as a 90-something — that was a real bug, don't soften it back.

## Work order lifecycle, billing, and check-in

- **`lib/work-order-machine.ts`** is the one place transitions are legal or
  not. Before, each store action guarded its own status and a new screen
  calling a different action could move an order anywhere. `checkTransition`
  is the gate; it returns the `Capability` needed rather than resolving it, so
  the module stays pure. The brief's five-stage workflow (Draft → Pending
  Approval → Approved/In Progress → Ready for Billing → Completed) is a
  *projection* over the nine stored statuses via `lifecycleStage` — the extra
  ones carry real distinctions (`partially_approved` is a genuine answer;
  `declined` ≠ `cancelled`) and must not be collapsed. `closed` splits on
  `collectedAt`: unset is "ready for billing", set is "completed", which
  matches revenue being recognised on collection.
- **Order numbers are issued at `draft → pending_approval`**, not at creation
  — a draft that never leaves the shop must not burn a number and leave a gap.
  `reference` is `""` until then; read it through `displayReference`.
  `nextReference` scans for the **highest issued** number over the *unscoped*
  order list. The old generator counted the tenant-**scoped** list, so two
  clients under one provider both produced `WO-2026-0001`, and a count went
  backwards when a row was filtered out. Since Phase 1 the server issues it:
  `issueReference` (`server/commands/work-order-repo.ts`) takes a
  transaction-scoped advisory lock, reads the **global** maximum through the
  `pms_highest_work_order_reference` definer function (the unique index is
  global, and RLS would hide other tenants' numbers), and feeds that to the
  unchanged `nextReference`. The partial unique index on `reference`
  (excluding `''`, migration `0009`) stays as the backstop; a violation maps
  to `conflict`. Phase 2 replaces all of this with `pms_document_series` (R8).
- **`lib/billing.ts` owns all money arithmetic.** Lines carry `quantity ×
  unitPartRate` and `labourHours × labourRate`; `partCost`/`labourCost` are
  **stored, not derived on read**, because they are the historical price the
  client approved — re-deriving would let a later rate change rewrite an
  authorised amount. `recalcLine` is the *only* thing that may write them;
  never set a cost beside a qty/rate change. `withRates` reconstructs inputs
  for rows predating the columns (one unit at the stored cost; labour becomes
  one flat hour) so old lines render and edit without a backfill guess.
  Rounding happens once per total, never per line.
- **Approval bands run on the pre-tax subtotal**, VAT never enters a
  threshold — a band is a decision about the work. `vatRatePct` /
  `miscFeeFlat` / `defaultLabourRate` live on `ApprovalSettings`; a 0% rate is
  a real setting (non-VAT-registered provider), not a missing value.
- **`assignedProviderId` is not `vendor`.** Approval stamps the owning
  provider automatically (`assignOnApproval`), and `vendor` stays reserved for
  genuine third-party subcontractors — writing the provider's own name there
  puts the shop in its own vendor-spend analytics. An in-house job has an
  assigned provider and an **empty** vendor.
- **`lib/checkin.ts`** turns a plate or VIN into hydrated form state so the
  counter never asks for data the fleet already holds. Matching is exact on a
  normalised form (case/space/dash insensitive) — a prefix match would hydrate
  the wrong customer. It is pure and takes the candidate vehicles as a
  parameter; the caller passes the already-scoped list, since a lookup over
  the raw fleet would confirm a sibling client's vehicle exists. A **stale**
  odometer is deliberately *not* pre-filled (`odometerNeedsConfirmation`) —
  accepting an old reading unchallenged shifts every due date behind it.

## Tenancy — read this before touching anything cross-client

The shape is `provider → fleet_client → vehicles → work orders, PMS
intervals, documents`. A provider-side session sees every client beneath its
provider; a client-side session sees exactly one client — never a sibling
under the same provider, which is the leak a naive `providerId` filter would
let through.

- **`lib/tenancy.ts`** is the single chokepoint. `resolveTenantScope` turns a
  session into a `TenantScope | null`; `scopeFleetState` narrows a full
  `FleetState` down to what that scope may read. `useFleetState()` in
  `lib/store.ts` calls it on every read, and the raw unscoped snapshot
  (`useRawFleetState`) is deliberately **not exported** — a new screen gets
  scoping by default because there's no unscoped path to reach for.
- **Fails closed, always.** No scope, or an ambiguous one (unknown provider,
  a client that doesn't belong to the session's provider, a suspended
  client), renders nothing — never a fallback to unscoped. `explainTenantScope`
  gives the reason, logged so an empty screen doesn't read as data loss.
- **Writes are scoped too.** Every mutation in `useFleetActions()` resolves the
  record's owning client via `guards.clientForVehicle` / `clientForOrder` /
  `writeClientId` before touching it — raising a work order against another
  tenant's vehicle, or approving a purchase order that isn't yours, is a no-op.
- **In the browser this is a UI affordance; on the server it is enforced.**
  The browser's guards only decide what to render and what to send. Server
  commands run the *same* `explainTenantScope` (inside their transaction,
  from the server-verified profile) and `can()` from `lib/rbac-core.ts`, and
  RLS enforces tenancy a third time underneath — so for work orders and
  approvals, scope and capability are real controls as of Phase 1.
- **`lib/rbac.ts`** roles split by side: `provider_admin` / `service_advisor` /
  `provider_technician` (provider) vs `fleet_manager` / `operations` /
  `technician` / `purchasing_officer` / `viewer` (client) — see
  `PROVIDER_ROLES` / `CLIENT_ROLES`. Capabilities are the same list on both
  sides; scope, not capability, is what stops a provider-side grant from
  reading as cross-client access.
- **Per-client approval bands**: `FleetClient.approvalThresholdOverrides` is a
  sparse override folded over the provider's `ApprovalSettings` defaults by
  `effectiveApprovalSettings` / `approvalSettingsForClient` — an unset field
  inherits, it is never treated as zero.
- **Branding resolves two levels deep**: provider-side sessions always see the
  provider's own mark; client-side sessions see their own logo/colour where
  set, falling back field-by-field to the provider's (`providerBranding`).
  Support email always stays with the provider.

## Permissions, alerts, documents

- **`lib/rbac.ts`** — eight capabilities across eight roles (provider- and
  client-side). Gate inside the action component (`NewWorkOrderDialog`,
  `OdometerDialog`, `UploadDocumentDialog`), not at call sites, so new screens
  inherit the gate. Denied controls render through `DeniedAction` — dimmed
  with a reason, never hidden. **This is a UI affordance, not security**;
  mirror it server-side when an API exists.
- **`lib/alerts.ts`** — alerts are *derived on every read*, never stored, so
  they can't outlive their trigger. Ids must stay deterministic or dismissals
  stop sticking. Persisted read/dismiss state is bucketed per tenant scope
  (`AlertInteractionByScope`, keyed by `tenantScopeKey`) — a provider
  dismissing a fleet-wide alert hasn't decided anything on a client's behalf,
  so provider and client scopes never share a bucket.
- **`lib/documents.ts`** — uploads become data URLs in localStorage, hence the
  1.5 MB cap and `setStateChecked`'s rollback on quota failure. Only insurance,
  registration, and warranty offer an expiry (it feeds alerts); an expiry on an
  invoice is noise.

## Shop (provider) side

`/shop/*` is the provider's own job — bays and a cross-client book of work,
not one fleet's compliance — and gets its own nav section and dashboard
(`lib/nav.ts`'s `PROVIDER_NAV_SECTIONS`, split from `CLIENT_NAV_SECTIONS`).
`homeHrefFor(role)` decides which side a bare sign-in lands on; both `/shop`
and `/dashboard` self-guard against the wrong side landing there by URL.

- **`lib/bays.ts` / `lib/technicians.ts`** — still static catalogues (unlike
  service tasks, now database-backed — see "Domain model" above): a bay or a
  technician is a property of the shop, so adding one today is a code change,
  not an admin screen.
  `Bay.focus` is advisory only — nothing stops a job from being assigned to a
  bay outside its specialty, and nothing stops two jobs booked into the same
  bay at once; `bayLoadFor`/`floorUtilisation` will just read over 100%.
- **`WorkOrder` carries shop-only fields**: `bayId`, `scheduledTime` ("HH:mm",
  separate from the date-only `scheduledFor`), `collectedAt`, `collectedBy`.
  All four default to `null` in `normalise()` for orders written before the
  counter workflow existed — never fabricate a time from a bare date.
- **Revenue is recognised on collection, not completion.** `revenueBetween` in
  `lib/shop.ts` only counts a job once `collectedAt` is set; a closed-but-
  uncollected job is "outstanding," which is informational only — there is no
  billing/invoice model behind it.
- **Bay time vs the catalogue's own estimate** (`technicianLoad`,
  `estimatedHours`) reads actual duration off the `closed` history event, not
  `completedOn` — that field is a date, and diffing it against a datetime
  start silently produced negative durations for every real job. Comparable
  bug: day keys for time series use `formatISO(day, { representation: "date"
  })`, not `toISOString()`, which shifts the date for anyone east of UTC.
- **Quotation send** (`sendForApproval` in `lib/store.ts`) is the provider's
  half of the approval loop: a `draft` work order becomes `pending_approval`,
  stamped into the append-only `approvalLog` as `sent_for_approval`. The wait
  timer (`ApprovalWaitBanner`) reads `businessHoursBetween` — always working
  hours, so a quote sent Friday evening doesn't read as three days late by
  Monday morning.

## Data

State lives in **Supabase Postgres**, in tables prefixed `pms_` — this is now
TorqueLane's own dedicated project, and the prefix is the platform namespace
(every table the product owns), not a workaround for sharing a project with
someone else's app. `lib/store.ts` loads the visible fleet once per session
behind a `useSyncExternalStore` store; `lib/fleet-data.ts` holds the queries
and `lib/mappers.ts` the row↔domain mapping. Consume state through
`useFleet()` (already scoped, PMS engine applied) and `useFleetActions()`
(scoped mutations) exactly as before.

The schema, RLS policies, demo accounts, and seed data are in
`supabase/migrations/`. The seed is one provider (MekanikoMoR, a tenant of the
platform — see "Rebrand" below) with four fleet clients — Actimed (16
vehicles, the original fleet), Northwind Logistics, Sagrada Medical Transport,
and Bayani Construction (seeded `suspended`, so its demo account demonstrates
the fail-closed path live).

### Database workflow

Migrations run through the Supabase CLI (`supabase/config.toml`), against a
local stack (`supabase start`, which needs Docker):

```bash
npx supabase start      # one-time per machine session: boots Postgres, Studio, etc.
npx supabase db reset   # drops and replays every migration in supabase/migrations/, in order
npx supabase stop       # tears the local stack down
```

`db reset` must apply cleanly to an **empty** project — that is what makes the
migration list in `supabase/migrations/` a reliable description of the schema,
rather than a history that only works against whatever state someone's
project happened to already be in. Demo accounts and seed fleet data ship as
ordinary migrations (`0002`, `0003`, `0005`), not a separate `seed.sql`, so
`[db.seed]` in `config.toml` stays disabled. A new migration always takes the
next number (see Standing Rule R10) and should be idempotent, matching the
existing ones.

Rules that bite:

- **Pages that read fleet data are client components.** Due dates depend on
  "now", so `getServerSnapshot` returns empty and the UI renders skeletons
  until mount. Check `ready` before rendering data.
- **Mutations are optimistic.** Local state updates immediately, the write
  goes to Postgres, and a failure rolls it back and logs. Writes can now fail —
  they could not before — so a caller that shows success must check the result.
  For work orders the preview comes from the same pure planner the server runs
  and is replaced by the command's canonical rows (see "Server commands").
- **The browser cannot write work orders.** `pms_work_orders`, `_lines`,
  `_tasks`, `_parts`, `_events` and `pms_approval_log` have no INSERT/UPDATE/
  DELETE grant for `authenticated` (migration `0010`). A `supabase.from(...)
  .insert()` against them from the browser fails with 42501 — use a command.
  Other entities still write through PostgREST until Phase 2.
- **RLS is the real boundary.** `lib/tenancy.ts` still scopes what the UI
  renders, but the database enforces the same rule independently via
  `pms_visible_client_ids()`. Any change to one must be made in the other;
  `lib/rls-parity.test.ts` fails if they drift. Adding a `pms_` table means
  adding its RLS policies **and** its grants, or that test fails too — and
  adding a *migration* that creates tables means adding it to that test's
  `allSchemas`, or its tables are never checked and the test passes vacuously.
  A child table inherits its parent's tenancy (`pms_client_for_work_order`,
  `pms_client_for_po_line`) rather than storing a `provider_id` — that filter
  is the sibling-client leak.
- **The append-only tables are enforced, not conventional.**
  `pms_work_order_events` and `pms_approval_log` are granted select+insert
  only, with no update or delete policy anywhere.
- **`lib/mappers.ts` is where `normalise()` went.** Any new non-nullable field
  on a domain type needs a default there, or a null column surfaces as a
  runtime error deep in a component.
- **Relations are normalised; the domain types are not.** `0006` moved
  `task_ids[]`, `service_task_ids[]`, `vehicle_ids[]` and the `parts` jsonb
  into junction tables (`pms_work_order_tasks`, `pms_work_order_parts`,
  `pms_purchase_order_line_tasks`/`_vehicles`), and repeated names into
  `pms_technicians` / `pms_vendors` / `pms_service_tasks` FKs. `order.taskIds`
  is still a `string[]` at every call site — the mapper is the seam, so
  normalising storage never rippled into components. Writing one of these
  fields means writing child rows (`replaceTasks` / `replaceParts` in
  `server/commands/work-order-repo.ts` for work orders), not a column.
- **Every catalogue FK is nullable, deliberately.** A technician recording an
  unlisted repair has no `service_task_id`, and a part fitted off the shelf has
  no `pms_parts` row. The text column survives beside each FK as the historical
  label — a line whose catalogue task is later deleted still renders. Never
  make one of these `not null`.
- **Enum columns are already ids.** `pms_task_category` and friends store a
  4-byte oid per row, not the label. Converting them to lookup tables would
  grow every row and add a join; don't "normalise" them for space.
- **Seed dates are drawn inside their calendar month**, not by 30-day
  arithmetic — the naive version left the current month reading zero spend.
  Regenerate with `scripts/emit-seed-sql.ts`, which runs the real
  `createSeedState()` rather than duplicating it in SQL.
- **Read parts cost via `resolvePartsCost`**, never `order.partsCost`.
  Estimates carry only the aggregate; itemised lines win once a technician
  records them.

## Styling

Semantic tokens only — `bg-surface`, `text-muted-foreground`, `border-border`,
`text-brand`. Never raw Tailwind palette colours (`bg-slate-100`), because they
don't respond to the theme. Tokens are defined in `app/globals.css` for `:root`
and `[data-theme="dark"]`; both modes must be updated together.

Useful classes: `.card` / `.card-raised` (panels), `.tabular` (columns of
numbers — **not** large standalone figures, where it looks loose), `.skeleton`.

## Charts

`lib/chart-theme.ts` holds literal hex per mode — SVG presentation attributes
don't evaluate `var()`, so chart colours cannot use CSS custom properties. Dark
values are their own validated steps, not inverted light ones.

Rules that are not negotiable in this codebase:

- One y-axis. Never a dual-axis chart.
- Categorical slots assigned in fixed order (`series1`, `series2`, …), never
  cycled, never reassigned by rank.
- The status palette (`ok` / `warning` / `critical`) is reserved for state and is
  never a data series; status chips always ship an icon **and** a label.
- Two or more series ⇒ a legend is present.
- Stacked segments are separated by a 2px stroke in the *surface* colour (that's
  the gap mechanism), never by a contrasting border.
- Every chart goes through `ChartFrame`, which supplies the table view. Don't add
  a chart without one — no value should be reachable only by hovering.

## Conventions

- Path alias `@/*` from the project root.
- `cn()` from `lib/utils` for class merging; formatters (`formatCurrency`,
  `formatKm`, `formatDayDelta`, …) live there too — reuse rather than re-format.
- Filters go in **one row above** everything they scope, never inside a card.
- Currency is PHP; dates render via `date-fns` through the `lib/utils` helpers.

## ERP conversion: Standing Rules

This codebase is being converted from a single-product fleet PMS tool into
TorqueLane, a multi-tenant ERP + CRM for Philippine auto care businesses
(repair/PMS, detailing, equipment monitoring, optional café POS), in
numbered phases. These rules are in force for every phase from Phase 0
onward; each phase's prompt assumes them without repeating them.

R1  Phases are additive. Do not rewrite earlier phases' work unless the current
    prompt says to. If an earlier design blocks you, stop and report.
R2  After Phase 2 the browser never writes. All mutations go through server
    commands (server actions / route handlers) in server/commands/. The browser
    reads through supabase-js under RLS.
R3  Every command follows the same shape: verify session (server-side) → resolve
    TenantScope (lib/tenancy.ts) → check capability (lib/rbac-core.ts) → check
    module entitlement (after Phase 3) → open ONE transaction → load and lock
    rows → run pure domain functions → write rows + audit entry + outbox events
    → commit → return canonical rows mapped through lib/mappers.ts.
R4  Business rules live in pure TypeScript modules in lib/ with unit tests.
    No "use client", no React and no Supabase imports in a domain module.
R5  Every new table must have: a tenancy anchor (column, or derivation through a
    parent via a pms_*_for_* helper; never a copied provider_id on a child
    table), RLS enabled, a SELECT policy using the tenancy helpers, writes
    allowed only on the server write channel, explicit grants, an entry in
    lib/rls-parity.test.ts, and a live isolation test.
R6  Money: numeric in Postgres, integer centavos for any NEW arithmetic in
    TypeScript, converted at the boundary. Round once per total, never per line
    (existing lib/billing.ts rule). Never use floats to sum ledger amounts.
R7  Issued financial and stock documents are immutable. Corrections happen by
    void/reversal documents, never by UPDATE or DELETE. Append-only tables are
    granted SELECT + INSERT only.
R8  Document numbers (work orders, invoices, receipts, POs, GRs, journal
    entries) are issued server-side from pms_document_series inside the same
    transaction as the document. They are gap-free and never reused.
R9  Business dates are Asia/Manila calendar dates. Day keys use
    formatISO(day, { representation: "date" }), never toISOString().
R10 Never edit a migration that has been applied. New migrations take the
    next number and are idempotent where practical.
R11 Never weaken an existing invariant documented in CLAUDE.md (health score
    weights, reference issuing at draft→pending_approval, stored line costs,
    fail-closed tenancy, sibling-client isolation) without the prompt saying so.
R12 Done means: npm run build, npx tsc --noEmit, npm run lint, npm test and
    npm run test:db all pass, and CLAUDE.md documents the new tables,
    invariants and "rules that bite" from the phase.
R13 Keep the existing styling and chart rules (semantic tokens only,
    ChartFrame for every chart, status palette reserved for state).
R14 When these rules conflict with a prompt or with reality, stop and report.
    Do not improvise a workaround.

### Roadmap

Titles for Phases 3–14 are provisional placeholders; each phase's own prompt
is authoritative about its scope.

- **Phase 0 — Platform groundwork.** Dedicated Supabase project, migration
  dependency order, live RLS test harness, platform rebrand (`lib/platform.ts`),
  `lib/rbac-core.ts` split. **Done.**
- **Phase 1 — Server command layer: work orders & approvals.** Cookie auth,
  `pms_server` write channel, transactional commands in `server/commands/`.
  **Done.**
- **Phase 2 — Every remaining write onto commands; server-issued document
  series (`pms_document_series`, R8).** After this the browser never writes (R2).
- **Phase 3 — Module entitlements (PMS, detailing, equipment, café POS).**
- **Phase 4 — Invoices, receipts & immutable financial documents.**
- **Phase 5 — Money model (centavos, ledger).**
- **Phase 6 — CRM core (contacts, leads, pipelines).**
- **Phase 7 — Detailing module.**
- **Phase 8 — Equipment monitoring module.**
- **Phase 9 — Café POS module.**
- **Phase 10 — Cross-module reporting & analytics.**
- **Phase 11 — Billing/subscriptions for provider tenants.**
- **Phase 12 — Notifications & outbox events.**
- **Phase 13 — Public API / integrations.**
- **Phase 14 — Launch hardening (perf, audit, migration tooling).**

### Phase 0 notes

- **Migration numbering follows real dependency order, not narrative order.**
  The original 0001–0007 set (added in one commit) was never tested against
  an empty project; `0002_pms_auth_users.sql` and the old `0003_pms_seed.sql`
  referenced rows and tables that migrations 0004/0006 only created later.
  Fixed by splitting the provider/fleet-client/approval-settings rows into
  their own early migration (`0002_pms_providers_seed.sql`) and reordering
  everything else to match actual foreign-key dependency: schema → provider
  seed → service-task table → service-task seed → normalisation → rest of
  the demo fleet → auth users → profile fields → workflow. `supabase db
  reset` against an empty project is now the acceptance test for migration
  order — run it before adding or reordering any migration.
- **`scripts/emit-seed-sql.ts` now writes two files**.
  `0002_pms_providers_seed.sql` (providers, fleet clients, approval settings)
  and `0006_pms_seed.sql` (everything else). Regenerating still means running
  the one script; it writes both outputs from the same `createSeedState()` call.
- **`lib/rbac-core.ts`** holds the pure role/capability matrix (`Capability`,
  `ROLE_CAPABILITIES`, `PROVIDER_ROLES`, `CLIENT_ROLES`, `can()`,
  `denialReason()`) with no "use client" and no React import — safe to import
  from a server module. `lib/rbac.ts` re-exports it all and adds only
  `useCan()`, which is the sole reason that module still needs the directive.
  `app/api/admin/users/route.ts` imports roles from `lib/rbac-core.ts` rather
  than hand-mirroring them.
- **`lib/platform.ts`** holds platform-level identity (name, support email,
  default theme) with no directive — safe on the server. Distinct from
  `lib/tenant.ts`'s `DEFAULT_TENANT_SETTINGS`/`SEED_PROVIDER`, which is tenant
  (MekanikoMoR) branding, resolved per session by `lib/tenancy.ts`'s
  `providerBranding`. Product-identity UI copy (page metadata, the `Logo`
  component's default `name`, the sign-in footer) reads `lib/platform.ts`;
  seed data keeps the MekanikoMoR tenant name.
- **Live RLS tests**: `tests/integration/*.test.ts`, run via `npm run test:db`
  against `supabase start` + `supabase db reset`. Separate vitest config
  (`vitest.integration.config.ts`) so a slow/offline integration run never
  affects `npm test`. Tests skip (not fail) if the local stack isn't
  reachable — see `tests/integration/supabase-test-client.ts`.
- **`supabase/config.toml`** disables `[db.seed]` — demo data ships as
  ordinary migrations (0002, 0004, 0006), not a separate `seed.sql`.

## Server commands (Phase 1)

Work orders and approvals are written **only** by server commands. The
browser sends intent; the server verifies who is asking, decides, and writes
everything in one transaction.

```
browser (lib/store.ts)                      server
  useFleetActions().decideLine(...)
    ├─ preview: applyLineDecisions(...)      ← lib/work-order-plans.ts (pure)
    └─ decideLinesAction(input) ───────────► server/actions/work-orders.ts  "use server"
                                               getVerifiedUser()  ← cookie → GoTrue
                                               commands.decideLines(deps, user, input)
                                                 server/commands/work-orders.ts
                                                   runCommand(...)  ← context.ts (R3 preamble)
                                                   pgDb.withUserTx  ← server/db.ts
    ◄──── { ok, data: { order } } ──────────────  canonical rows via lib/mappers.ts
  adopt(canonical) or restore(previous)
```

| File | Role |
|---|---|
| `lib/work-order-plans.ts` | Pure planners: what each command *does*. No clock, ids, or I/O. |
| `server/actions/work-orders.ts` | `"use server"` entry points. Verify the user, call the command. Nothing else. |
| `server/commands/context.ts` | `runCommand`: R3 preamble (profile → scope → capability) inside one tx. |
| `server/commands/work-orders.ts` | The commands: `createWorkOrder`, `updateDraft`, `recordLines`, `sendForApproval`, `decideLines`, `schedule`, `start`, `complete`, `close`, `markCollected`, `cancel`. |
| `server/commands/work-order-repo.ts` | Load/lock/assemble a `WorkOrder`; row writers; `issueReference`. |
| `server/commands/validate.ts` | Boundary parsing of untrusted action input. |
| `server/commands/result.ts` | `CommandResult` and the SQLSTATE → code mapping. |
| `server/db-port.ts` / `server/db.ts` | The transaction port; postgres.js implementation. |
| `server/testing/fake-db.ts` | In-memory port for unit tests (rollback, no RLS). |
| `server/supabase-server.ts`, `middleware.ts` | Cookie sessions: verify and refresh. |

### The write channel (migration `0010`)

- **`pms_server`** is `NOLOGIN NOINHERIT NOBYPASSRLS`. Only `postgres` (the
  pooler's connection user) is a member; `authenticator` is not, so no JWT can
  make PostgREST assume it (`rls-parity` and `test:db` both check this).
- `server/db.ts` opens every transaction with `set local role pms_server` and
  `set_config('request.jwt.claims', {"sub": <verified user id>}, true)`.
  `auth.uid()` — and so `pms_visible_client_ids()` and every policy — resolves
  the real user. Both settings are transaction-local, which is what makes them
  safe on the Supavisor **transaction** pooler (`prepare: false` for the same
  reason).
- The migrated tables (`pms_work_orders`, `_lines`, `_tasks`, `_parts`,
  `_events`, `pms_approval_log`) keep SELECT for `authenticated`; their writes
  are granted to `pms_server` only, with `… to pms_server` policies using the
  same tenancy predicates as the browser policies they replace. Events and the
  approval log are INSERT-only for `pms_server` too (R7). `pms_server` may also
  UPDATE `pms_vehicles`, because closing resets the PMS clock in the same tx.
- **Tenancy is checked three times on this path**: the command's own scope
  check (TypeScript), RLS as the user (`pms_server` + claims), and FK/WITH
  CHECK predicates. Scope is resolved *inside* the transaction, from the
  server-read profile, so a client suspended a moment ago cannot slip a write
  through.

### The command pattern, annotated

```ts
export function decideLines(deps: CommandDeps, user: VerifiedUser | null, input: unknown) {
  //               label (logs)  ─┐   ┌─ verified by the action, never by the body
  return runCommand("decideLines", deps, user, "workorder:approve", async (c) => {
    //    runCommand has already: refused a null user (unauthenticated), opened ONE
    //    transaction as pms_server, read the caller's profile, resolved TenantScope
    //    with explainTenantScope (fail closed → forbidden), and checked the capability.
    const { o, orderId } = orderIdOf(input);                       // 1. parse — unknown
    const decisions = v.list(o, "decisions", 100).map(v.lineDecision); //    input, by name

    const { order, client } = await lockOwnedOrder(c, orderId);    // 2. SELECT … FOR UPDATE,
                                                                   //    out_of_scope if not ours
    const settings = await effectiveSettings(c.tx, client);        // 3. authority beyond the
    if (!canApprove(c.session.role, pendingValue(order.lines), settings)) { // capability
      throw new CommandError("forbidden", "…needs a Fleet Manager.");
    }

    const plan = applyLineDecisions(order, decisions, planContext(c, client)); // 4. decide:
                          // pure, shared with the browser preview; throws PlanError on an
                          // illegal transition (checkTransition is the only gate)

    for (const line of plan.changedLines) await updateLine(c.tx, order.id, line); // 5. write
    await updateOrder(c.tx, order.id, { status: plan.order.status, /* … */ });    //  rows,
    await insertApprovalLog(c.tx, order.id, plan.logEntries);                     //  log and
    if (plan.event) await insertEvent(c.tx, order.id, plan.event);                //  event in
                                                                                  //  the SAME tx
    return { order: await canonical(c, order.id) };                // 6. re-read via mappers
  }); // any throw rolls the whole transaction back and maps to { ok: false, code, message }
}
```

### Adding a command

1. Put the rule in a **pure** function (in `lib/work-order-plans.ts` or a new
   `lib/` module): input is loaded domain objects plus intent; output is the
   next state, events and log entries. `now`/`newId`/actor come in through
   `PlanContext`. Throw `PlanError` to refuse. Unit-test it (R4).
2. Add any new table to the `Table` union in `server/db-port.ts`.
3. Write the command in `server/commands/<entity>.ts`: `runCommand(label,
   deps, user, capability, body)`. Parse every field through `validate.ts`;
   lock what you read; never accept an id for a new row, a total, a status or
   an approval stamp from input; write rows + events/log in the body; return
   rows re-read through `lib/mappers.ts`.
4. Export a thin wrapper from a `"use server"` file in `server/actions/` — and
   **only** the wrapper. Exporting the command itself would let the browser
   pass any `user` it liked.
5. In `lib/store.ts`, call it through `submitCommand(label, preview, call,
   canonicalOf)`: the preview (optional) comes from the same planner; success
   adopts the canonical rows; any refusal restores exactly what the preview
   touched.
6. Migration: grant the writes to `pms_server` only, with `to pms_server`
   policies using the tenancy helpers; revoke them from `authenticated`; widen
   the read policies the command needs with `alter policy … to authenticated,
   pms_server`. Add the checks to `lib/rls-parity.test.ts` and a live test to
   `tests/integration/` (R5).
7. Tests: a unit test on `FakeDb` per refusal path, and at least one
   `test:db` case proving the browser role cannot write and RLS still binds.

### Rules that bite (Phase 1)

- **`postgres` has BYPASSRLS on Supabase.** Never run a statement on the
  server connection outside `pgDb.withUserTx`, which switches role first.
  There is no other export from `server/db.ts` for that reason.
- **`pms_server` cannot use schema `auth`.** Supabase does not let `postgres`
  grant USAGE on it (the GRANT silently does nothing). Every tenancy helper
  is SECURITY DEFINER, so that is fine — but a new policy that applies to
  `pms_server` must not call `auth.uid()` inline. Use `pms_auth_uid()`; see
  `pms_profiles_server_read`, which reads only the caller's own row.
- **Session lives in cookies now** (`@supabase/ssr`); the old
  `pms.supabase.auth` localStorage session is ignored, so everyone signs in
  once more after deploying. Server code identifies users with
  `auth.getUser()` (a GoTrue round trip), never `getSession()` or a local JWT
  decode.
- **`createWorkOrder` resolves a `Promise<WorkOrder | null>`**, not a
  `WorkOrder`: the id and number are the server's. It has no optimistic
  preview. Every other work-order action kept its synchronous signature.
- **Bands are the client's.** The server prices a new order against the
  *vehicle's client's* effective bands, whoever raises it. A provider-side
  session's browser previously used the provider defaults, so an order on a
  client with overrides (Sagrada: `autoApproveUnder: 0`) can now open
  `pending_approval` where it used to auto-approve.
- **Lines are decided only while `pending_approval`.** The approval panel
  still renders buttons on a draft's pending lines; the server refuses those
  with `invalid_transition`, because approving a draft would skip numbering.
- **Draft lines only.** `recordLines` edits lines on a `draft`; a declined
  quote is reopened as a draft by `updateDraft`. An approved amount is the
  historical price and is not editable by any command.
- **Closing writes the vehicle's `status` too** (`applyCompletion` sets it
  `active`); the old browser write dropped it.
- **Unrecognised failures map to `conflict`** ("nothing was changed, try
  again") and are logged server-side with the SQLSTATE. Messages from Postgres
  never reach the browser.
- **postgres.js specifics** (`server/db.ts`): plain objects are wrapped with
  `tx.json` (otherwise they serialise as `"[object Object]"`); `date` columns
  come back as `"YYYY-MM-DD"` and timestamps as ISO strings, matching
  PostgREST, because `lib/mappers.ts` is shared.
- **`TZ=Asia/Manila`** on the server (R9). Dates are stamped through
  `lib/business-date.ts`, but `businessHoursBetween` and date-fns read the
  process zone; `server/runtime.ts` pins it as a fallback.
- **`FakeDb` has no RLS.** Unit tests prove the TypeScript scope checks;
  only `npm run test:db` proves the database's.
