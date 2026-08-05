# MekanikoMoR — Fleet PMS & Maintenance

Next.js 14 (App Router) · TypeScript · Tailwind · Radix primitives · Recharts ·
date-fns · lucide-react. No backend — see "Data" below.

## Commands

```bash
npm run dev     # dev server
npm run build   # production build (run before calling work done)
npm run lint
npx tsc --noEmit
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

## Permissions, alerts, documents

- **`lib/rbac.ts`** — four roles, eight capabilities. Gate inside the action
  component (`NewWorkOrderDialog`, `OdometerDialog`, `UploadDocumentDialog`), not
  at call sites, so new screens inherit the gate. Denied controls render through
  `DeniedAction` — dimmed with a reason, never hidden. **This is a UI affordance,
  not security**; mirror it server-side when an API exists.
- **`lib/alerts.ts`** — alerts are *derived on every read*, never stored, so they
  can't outlive their trigger. Ids must stay deterministic or dismissals stop
  sticking. Only `readIds`/`dismissedIds` persist.
- **`lib/documents.ts`** — uploads become data URLs in localStorage, hence the
  1.5 MB cap and `setStateChecked`'s rollback on quota failure. Only insurance,
  registration, and warranty offer an expiry (it feeds alerts); an expiry on an
  invoice is noise.

## Data

State is client-side: `lib/store.ts` wraps `localStorage` in a
`useSyncExternalStore` store, seeded from `lib/seed.ts` (deterministic PRNG, 16
vehicles, 12 months of history). Consume it through `useFleet()` (fleet state
with the PMS engine already applied) and `useFleetActions()` (mutations).

Two constraints that follow from this:

- **Pages that read fleet data are client components.** Due dates depend on
  "now", so `getServerSnapshot` returns empty and the UI renders skeletons until
  mount. Check `ready` before rendering data.
- **Seed dates are drawn inside their calendar month**, not by 30-day
  arithmetic — the naive version left the current month reading zero spend.

Two more rules that bite:

- **`normalise()` in `lib/store.ts` is the migration path.** Older payloads are
  live in people's browsers; any new required field on a persisted type needs a
  default there or their first load throws.
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
