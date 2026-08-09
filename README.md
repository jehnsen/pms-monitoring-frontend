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
lib/seed.ts         Deterministic demo fleet, now used only to generate seed SQL
lib/supabase.ts     Supabase browser client
lib/fleet-data.ts   Queries against the pms_ tables
lib/mappers.ts      Row <-> domain mapping
lib/store.ts        Client store (useSyncExternalStore over Supabase)
supabase/migrations Schema, RLS policies, auth users, seed data
```

**State.** The fleet lives in Postgres (Supabase). `lib/store.ts` loads it once
per session behind a `useSyncExternalStore` store, so reads stay synchronous for
components, and mutations are optimistic — local state updates immediately, the
write goes to Postgres, and a failure rolls the change back. Due dates depend on
"now", so the server renders an empty shell and the store fills in on mount;
check `ready` before rendering data.

**Tenancy is enforced in the database.** `lib/tenancy.ts` decides what the UI
renders, and the same rules are mirrored as Row Level Security policies keyed
off `auth.uid()` — see `lib/rls-parity.test.ts`, which pins the SQL to the
TypeScript so the two copies cannot drift.

## Database setup

The app needs a Supabase project. Note that all its tables are prefixed `pms_`
so it can share a project with an unrelated application.

1. `cp .env.example .env` and fill in the project URL and **anon** key
   (Settings -> API). The service_role key is not used by the app and must
   never reach the browser.
2. Run the migrations in order, via the Supabase SQL editor or `psql`:

   ```
   supabase/migrations/0001_pms_schema.sql             tables, RLS policies, grants
   supabase/migrations/0002_pms_auth_users.sql         the demo accounts
   supabase/migrations/0003_pms_seed.sql               the demo fleet
   supabase/migrations/0004_pms_service_tasks.sql      the PMS interval catalogue table
   supabase/migrations/0005_pms_service_tasks_seed.sql the default 12 service items
   ```

   All five are idempotent — re-running them will not duplicate anything.
3. Sign in as `owner@mekanikomore.ph` / `demo1234`.

**Before exposing this instance to anyone**, rotate the demo passwords (they are
all `demo1234`) or delete the accounts you do not need. These are now real
credentials against a real database.

To regenerate the demo fleet so its dates read as current:
`npx vitest run scripts/emit-seed-sql.ts`. To regenerate the service-task seed
from `lib/service-tasks.ts`: `npx vitest run scripts/emit-service-tasks-sql.ts`.
Both need a config whose `include` covers `scripts/` (see the file headers).

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
