# MekanikoMoR — Fleet PMS & Maintenance

Next.js 14 (App Router) · TypeScript · Tailwind · Radix primitives · Recharts ·
date-fns · lucide-react. No backend — see "Data" below.

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
npm test        # vitest run — lib/*.test.ts, no watch
```

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

`healthScore` weights are deliberately steep (overdue critical −25, overdue −15,
due-soon critical −8, due-soon −4). A vehicle with two breached safety intervals
must not read as a 90-something — that was a real bug, don't soften it back.

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
- **This is a UI affordance, not a security control** — same caveat as RBAC
  below, and for the same reason: every tenant's rows sit in one `localStorage`
  blob the browser's own devtools can read. What this buys is one tested
  definition of scope, ready to mirror server-side verbatim once an API exists.
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

- **`lib/bays.ts` / `lib/technicians.ts`** — static catalogues, same pattern
  as `SERVICE_TASKS`: a bay or a technician is a property of the shop, not
  persisted state, so adding one today is a code change, not an admin screen.
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

State is client-side: `lib/store.ts` wraps `localStorage` in a
`useSyncExternalStore` store, seeded from `lib/seed.ts` (deterministic PRNG).
The seed is one provider (MekanikoMoR) with four fleet clients — Actimed (16
vehicles, the original fleet, byte-identical to before tenancy existed),
Northwind Logistics, Sagrada Medical Transport, and Bayani Construction
(seeded `suspended`, so its demo account demonstrates the fail-closed path
live). Consume state through `useFleet()` (already scoped, PMS engine
applied) and `useFleetActions()` (scoped mutations).

Two constraints that follow from this:

- **Pages that read fleet data are client components.** Due dates depend on
  "now", so `getServerSnapshot` returns empty and the UI renders skeletons until
  mount. Check `ready` before rendering data.
- **Seed dates are drawn inside their calendar month**, not by 30-day
  arithmetic — the naive version left the current month reading zero spend.

Two more rules that bite:

- **`normalise()` in `lib/store.ts` is the migration path.** Older payloads are
  live in people's browsers; any new required field on a persisted type needs a
  default there or their first load throws. This now includes tenancy
  backfill — a `fleetClientId`-less record resolves to `SEED_FLEET_CLIENT`,
  and a pre-tenancy flat `{ readIds, dismissedIds }` migrates into that
  client's alert bucket.
- **Read parts cost via `resolvePartsCost`**, never `order.partsCost`. Estimates
  carry only the aggregate; itemised lines win once a technician records them.

To point at a real API, replace `lib/store.ts`. Nothing else knows the source.

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
