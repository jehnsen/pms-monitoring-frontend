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
secure it — **the API is the real boundary**: capabilities come from `GET /me`,
and every endpoint enforces role, scope and module on its own.

## Architecture

```
app/(app)/               Route group sharing the sidebar + topbar shell
components/ui/           Primitives (button, card, dialog, select, meter, …)
components/charts/       Recharts wrappers, each with a table-view twin

lib/api/client.ts        fetch wrapper: Sanctum cookies + CSRF, X-Branch-Id, errors
lib/api/errors.ts        The API's error envelope as a typed ApiError
lib/api/query.tsx        TanStack Query client and provider
lib/api/views.ts         Screen endpoints (/analytics, /shop, …) as typed views
lib/store.ts             Query hooks per screen, and useFleetActions() mutations
lib/mappers.ts           API resource <-> domain type mapping (centavos -> pesos)
lib/auth.ts              The session (GET /me), sign-in, profile, password
lib/rbac.ts              useCan(): capabilities from /me, denial reasons
lib/billing.ts           PREVIEW ONLY: quote arithmetic while typing
types/api.ts             Generated from the API's openapi.json
e2e/                     Playwright smoke and parity suites
```

**The TorqueLane API owns the data and every rule.** This app is a client of
the Laravel API in `../torquelane-api`: due dates, approvals, totals, check-in,
analytics, tenancy and permissions are computed there, and the screens render
what it returns. Mutations go to the API and then refetch the queries they
affect; nothing is optimistic. A portal session sees only its own account — a
sibling client's record is a 404 from the API, not a client-side filter.

## Running locally

1. Start the API (see its README): Postgres, then
   `php artisan migrate:fresh --seed` and `php artisan serve --port=8000`.
   The demo seed is one provider (MekanikoMoR) with four fleet clients —
   Actimed, Northwind Logistics, Sagrada Medical Transport, and Bayani
   Construction (seeded `suspended`, so its account shows the refused sign-in).
2. `cp .env.example .env` — `NEXT_PUBLIC_API_URL` points at the API;
   `NEXT_PUBLIC_DEMO_MODE=true` adds one-click demo accounts to the sign-in
   screen.
3. `npm run dev` on port 3000 (the origin the API allows), then sign in as
   `owner@mekanikomore.ph` (staff) or `donmiguel@mekanikomor.ph` (Actimed's
   fleet manager), password `demo1234`.

`npm run test:e2e` runs the Playwright suites against that API; they write
demo data, so never point them at a real database.

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


## credentials
demo1234

Email	Role	Account
--------------------
donmiguel@mekanikomor.ph	Fleet Manager	Actimed
ops@mekanikomore.ph	      Operations Supervisor	Actimed
tech@mekanikomore.ph	      Lead Technician	Actimed
purchasing@mekanikomor.ph	Purchasing Officer (lands on /requests)	Actimed
viewer@mekanikomore.ph	   Authorised Viewer	Actimed
fleet@northwind.ph	      Fleet Manager	Northwind Logistics
operations@sagrada.ph	   Operations Director	Sagrada Medical Transport
yard@bayanicon.ph	         Yard Manager (sign-in is refused because the account is suspended)	Bayani Construction