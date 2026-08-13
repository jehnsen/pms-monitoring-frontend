# MekanikoMoR — Fleet PMS & Maintenance

A preventive-maintenance monitoring and work-order application for vehicle
fleets, built with Next.js 14 (App Router), TypeScript, and Tailwind.

```bash
npm install
npm run dev     # http://localhost:3000
```

📄 **[WORKFLOW.md](WORKFLOW.md)** — how work actually moves through the system
end to end: check-in, approval, billing, completion, and procurement. Start
there if you want to understand the behaviour rather than the build.

## Two sides, one codebase

The app serves both the **provider** (the service centre running this
instance — shop owner, service advisors, technicians) and its **fleet
clients** (Actimed and others, each seeing only their own fleet). A
provider-side session sees every client beneath its provider; a client-side
session sees exactly one, never a sibling under the same provider.

`homeHrefFor(role)` decides which side a bare sign-in lands on.

## What it does

Every vehicle is measured against a catalogue of twelve recurring service
intervals. Each interval carries **two limits — distance and time — and is due on
whichever arrives first**. The distance limit is projected onto the calendar
using the vehicle's rolling daily average, so the two can be compared directly
and the app can tell you which one is actually governing.

**Client side**

| Route | Purpose |
|---|---|
| `/dashboard` | Fleet health, compliance, six-week service load, spend trend, active jobs |
| `/vehicles` | Every unit, filterable by PMS state and department; card or table view |
| `/vehicles/[id]` | Full interval sheet, service history, and specification for one unit |
| `/schedule` | Everything falling due, grouped by remaining lead time |
| `/work-orders` | Preventive, corrective, and inspection jobs across their lifecycle |
| `/work-orders/[id]` | The service record: findings, itemised parts, costs, attachments |
| `/requests` | Quotations awaiting this client's approval decision |
| `/demand-forecast` | Projected parts demand, stock shortfall, lead-time risk |
| `/purchase-orders` | Raising and receiving orders against that demand |
| `/documents` | Invoices, reports, policies, and certificates for the whole fleet |
| `/reports` | Cost analysis, planned-vs-unplanned mix, spend and frequency rankings |
| `/service-catalogue` | The twelve PMS interval definitions |
| `/access` | Roles, personnel, and the permission matrix |
| `/settings` | Approval bands, VAT and labour rates, thresholds, theme |

**Provider side**

| Route | Purpose |
|---|---|
| `/shop` | Today on the floor: bay load, jobs in progress, revenue |
| `/shop/check-in` | Counter workflow — check a vehicle in, or hand it back |
| `/shop/queue` | The cross-client book of work |
| `/shop/clients` | Every fleet client beneath this provider |
| `/shop/technicians` · `/shop/vendors` | Roster and approved vendor list |
| `/shop/reports` | Floor utilisation, technician load, revenue analysis |

Closing a work order is what resets the PMS clock: the tasks it covers take the
order's odometer and completion date as their new baseline, and every downstream
figure recalculates. Closing also captures the service record — technician
findings and the parts actually fitted — because asked for later, nobody
remembers.

**Every job is a purchase before it is a repair.** Work orders pass through
per-line approval before they can be scheduled, with thresholds deciding who
may authorise the spend (and what approves itself). Order numbers are issued
when a draft is sent for approval, not when it is created. See
[WORKFLOW.md](WORKFLOW.md) for the full lifecycle.

**Alerts** are derived from fleet state on every read rather than stored, so a
notification can never outlive the condition behind it. They cover breached and
approaching intervals (by mileage or time), work orders past their slot,
approval SLA breaches, and registration, insurance, or licences nearing renewal.

**Access control** defines eight roles across eleven capabilities, split by
which side of the tenancy boundary they sit on. Gating lives inside the action
components, so any screen using them inherits it. Denied controls are dimmed
with a reason rather than hidden. Permissions shape the interface but do not
secure it — **Row Level Security in Postgres is the real boundary**, and
`lib/rls-parity.test.ts` fails if the two definitions drift apart.

## Architecture

```
app/(app)/               Route group sharing the sidebar + topbar shell
components/ui/           Primitives (button, card, dialog, select, meter, …)
components/charts/       Recharts wrappers, each with a table-view twin

lib/pms.ts               The due-date engine — the core domain logic
lib/work-order-machine.ts Lifecycle transitions and order numbering
lib/approvals.ts         Approval bands, SLA, variance thresholds
lib/billing.ts           Line amounts, subtotal, VAT, grand total
lib/checkin.ts           Plate/VIN lookup and form hydration
lib/tenancy.ts           The scoping chokepoint — fails closed
lib/rbac.ts              Roles and capabilities
lib/alerts.ts            Alerts, derived on every read
lib/parts-forecast.ts    Projected parts demand and lead-time risk
lib/shop.ts              Bay load, floor utilisation, revenue
lib/analytics.ts         Derived series for the dashboard and reports

lib/supabase.ts          Supabase browser client
lib/fleet-data.ts        Queries against the pms_ tables
lib/mappers.ts           Row <-> domain mapping (where normalise() lives)
lib/store.ts             Client store (useSyncExternalStore over Supabase)
lib/seed.ts              Deterministic demo fleet, used to generate seed SQL
supabase/migrations      Schema, RLS policies, auth users, seed data
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
   supabase/migrations/0006_pms_normalisation.sql      junction tables, catalogue FKs
   supabase/migrations/0007_pms_workflow.sql           line qty/rate, order numbering, VAT
   ```

   All seven are idempotent — re-running them will not duplicate anything.
3. Sign in as `owner@mekanikomore.ph` (provider side) or `fleet@actimed.ph`
   (client side), password `demo1234`.

The seed is one provider (MekanikoMoR) with four fleet clients — Actimed
(16 vehicles), Northwind Logistics, Sagrada Medical Transport, and Bayani
Construction. Bayani is seeded `suspended` on purpose, so its demo account
demonstrates the fail-closed tenancy path against real data.

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
