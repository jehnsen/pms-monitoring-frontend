# MekanikoMoRe — Fleet PMS & Maintenance

A preventive-maintenance monitoring and work-order application for vehicle
fleets, built with Next.js 14 (App Router), TypeScript, and Tailwind.

```bash
npm install
npm run dev     # http://localhost:3000
```

## What it does

Every vehicle is measured against a catalogue of twelve recurring service
intervals. Each interval carries **two limits — distance and time — and is due on
whichever arrives first**. The distance limit is projected onto the calendar
using the vehicle's rolling daily average, so the two can be compared directly
and the app can tell you which one is actually governing.

| Route | Purpose |
|---|---|
| `/dashboard` | Fleet health, compliance, six-week service load, spend trend, active jobs |
| `/vehicles` | Every unit, filterable by PMS state and department; card or table view |
| `/vehicles/[id]` | Full interval sheet, service history, and specification for one unit |
| `/schedule` | Everything falling due, grouped by remaining lead time |
| `/work-orders` | Preventive, corrective, and inspection jobs across their lifecycle |
| `/work-orders/[id]` | The service record: findings, itemised parts, costs, attachments |
| `/documents` | Invoices, reports, policies, and certificates for the whole fleet |
| `/reports` | Cost analysis, planned-vs-unplanned mix, spend and frequency rankings |
| `/access` | Roles, personnel, and the permission matrix |
| `/settings` | Interval catalogue, warning thresholds, theme, demo-data reset |

Closing a work order is what resets the PMS clock: the tasks it covers take the
order's odometer and completion date as their new baseline, and every downstream
figure recalculates. Closing also captures the service record — technician
findings and the parts actually fitted — because asked for later, nobody
remembers.

**Alerts** are derived from fleet state on every read rather than stored, so a
notification can never outlive the condition behind it. They cover breached and
approaching intervals (by mileage or time), work orders past their slot, and
registration or insurance nearing renewal.

**Access control** defines four roles across eight capabilities. Gating lives
inside the action components, so any screen using them inherits it. Note that
permissions are applied in the browser: they shape the interface but cannot
secure it, and a production deployment must mirror the matrix server-side.

## Architecture

```
app/(app)/          Route group sharing the sidebar + topbar shell
components/ui/      Primitives (button, card, dialog, select, meter, …)
components/charts/  Recharts wrappers, each with a table-view twin
lib/pms.ts          The due-date engine — the core domain logic
lib/analytics.ts    Derived series for the dashboard and reports
lib/seed.ts         Deterministic demo fleet: 16 vehicles, 12 months of history
lib/store.ts        Client store (useSyncExternalStore + localStorage)
```

**State.** The fleet lives in `localStorage` behind a `useSyncExternalStore`
store, seeded on first load from a fixed PRNG so the demo is identical across
reloads. Due dates depend on "now", so the server renders an empty shell and the
store fills in on mount — this is deliberate, and avoids hydration mismatches.
Pointing the app at a real backend means replacing `lib/store.ts`; nothing else
knows where the data came from.

**Theming.** Light and dark are driven by CSS custom properties in
`app/globals.css`, stamped onto `<html>` before first paint so there is no
flash. Chart colours are resolved to literal hex in `lib/chart-theme.ts` because
SVG presentation attributes don't evaluate `var()`.

## Charts

The palette is validated rather than eyeballed — each mode's series colours were
checked against that mode's own surface for CVD separation, lightness band,
chroma, and contrast. Dark mode uses its own steps, not an inverted copy.

Conventions held throughout: one y-axis, never two; categorical hues assigned in
fixed order and never cycled; the reserved status palette (good / warning /
critical) never used for a data series; a legend whenever there are two or more
series; 2px surface gaps rather than borders between stacked segments; and a
table view on every chart, so no value is reachable only by hovering.
