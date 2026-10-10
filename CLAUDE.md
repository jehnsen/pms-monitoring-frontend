# TorqueLane web — Fleet PMS & Maintenance

Next.js 14 (App Router) · TypeScript · Tailwind · Radix primitives · Recharts ·
date-fns · lucide-react · TanStack Query · the **TorqueLane API** (Laravel, in
`../torquelane-api`; its docs call this repo `../web`).

Two sides share one codebase: **staff** (the service centre — owner, branch
manager, service advisors, technicians, cashier) and **portal** users (a fleet
client such as Actimed, who see only their own account). The API decides which
side a session is on and what it may read; this app renders that.

## Commands

```bash
npm run dev        # dev server on :3000 (the origin the API trusts)
npm run build      # production build (run before calling work done)
npm run lint
npx tsc --noEmit
npm test           # vitest — lib/**/*.test.ts (the billing preview's golden replay)
npm run test:e2e   # Playwright against a running API with the demo seed (see e2e/)
npm run api:types  # regenerate types/api.ts from ../torquelane-api/openapi.json
```

The e2e suite needs the API up first: in `../torquelane-api`,
`php artisan migrate:fresh --seed` then `php artisan serve --port=8000`. It
writes to that database (work orders, readings, documents) — demo data only.

## The API is the source of truth

Every business rule lives in the API: PMS due dates and health, the work-order
state machine, approval bands, billing, check-in hydration, the parts forecast,
analytics, alerts, tenancy and permissions. **The frontend computes no
authoritative total, status, due date or permission** (the API's standing rule
R2). It renders what the API returns, and the endpoints were shaped so it never
has to derive one (`approval.can_approve`, `approval.waiting_hours` /
`sla_breached`, `pms.next_item.progress`, list `summary` endpoints, …).
`../torquelane-api/docs/frontend-parity.md` maps every screen and action to
its endpoint, with the Phase 5 verification results.

- **No domain modules remain in `lib/`.** The old reference implementations
  (`pms`, `approvals`, `work-order-machine`, `tenancy`, `checkin`, `shop`,
  `analytics`, `alerts`, …) were deleted at the cutover; their golden fixtures
  live on in the API (`tests/Golden/fixtures/web/`).
- **`lib/billing.ts` is the one exception, and it is a PREVIEW.** The new
  work-order dialog and check-in quote while you type with it; the saved order
  is priced by the API. It stays golden-tested (`lib/billing.golden.test.ts`
  replays `fixtures/golden/billing.json`, which resolves `$seed` references into
  `fixtures/seed/demo-seed.json`) and every figure it drives is labelled
  "preview". Don't grow another client-side copy of a rule; ask the API for the
  value.
- Pure wording is fine client-side: `formatDayDelta`, "2h 15m on the job",
  share-of-total meters over two API figures.

## Data layer

- **`lib/api/client.ts`** — fetch wrapper: `credentials: "include"`, Sanctum
  CSRF bootstrap (`/sanctum/csrf-cookie`, `XSRF-TOKEN` echoed as
  `X-XSRF-TOKEN`, one retry on 419), `X-Request-Id`, and `X-Branch-Id` from the
  branch switcher. Base URL `NEXT_PUBLIC_API_URL` (default
  `http://localhost:8000/api/v1`). `apiAll` pages a list at 100 per page.
- **`lib/api/errors.ts`** — the API's envelope `{error:{code,message,details}}`
  as a typed `ApiError`. 401 → the session query is cleared and the guard sends
  you to `/login`; 404 → "Not found, or not yours" (an out-of-scope record is
  byte-identical to a missing one); 403 `module_disabled` → a module notice;
  422 → `fields` on forms. `components/ui/query-error.tsx` renders these.
- **`lib/api/query.tsx`** — the TanStack `QueryClient`. No retries on 4xx.
- **`lib/store.ts`** — per-screen query hooks (`useVehiclePage`,
  `useWorkOrder`, `useDashboard`, `useShopHome`, …) and `useFleetActions()`,
  whose actions keep their old names and resolve to an `ActionResult`
  (`{ok:true,data}` / `{ok:false,error,code,reason,fields}`). **Nothing is
  optimistic**: a write goes to the API, then the affected queries are
  invalidated (`AFFECTS` groups). A caller that shows success must check
  `result.ok`. Every query key carries the user and the selected branch, so
  switching either refetches.
- **Inventory** has its own seam: `lib/api/inventory.ts` (raw resources and
  mappers) and `lib/inventory.ts` (hooks, actions); its query-key roots live in
  `lib/api/inventory-keys.ts` so a work-order write can refresh them.
- **Billing** has its own seam too: `lib/api/billing.ts` (raw resources,
  mappers, `BILLING_ROOTS`) and `lib/receivables.ts` (hooks and
  `useBillingActions()`); types in `types/billing.ts`. (`lib/billing.ts` is
  the quote PREVIEW, unrelated.) Issuing an invoice and recording a payment
  require an `Idempotency-Key`: the dialog mints one when it opens and reuses
  it on a retry, so a retried click replays instead of double-posting.
- **The books** (Phase 8) have their own seam too: `lib/api/ledger.ts` (raw
  resources, mappers, `LEDGER_ROOT`) and `lib/ledger.ts` (hooks and
  `useLedgerActions()`); types in `types/ledger.ts`. Every books query key starts
  with `ledger`, and that root is in `BILLING_ROOTS` and `INVENTORY_ROOTS`, so an
  invoice, a payment or a stock move refreshes the books on screen. Balances,
  subtotals, running balances, the trial balance's totals and every close check
  are the API's; nothing is added up in the browser.
- **`lib/mappers.ts`** — the seam between API resources and `types/index.ts`:
  snake_case → camelCase, centavos → pesos (**display only**), and the defaults
  components rely on (`""`, `[]`) for nullable fields. A new field on a domain
  type needs its default here. `lib/api/views.ts` does the same for the
  screen-shaped endpoints (`/analytics/*`, `/shop/*`, `/requests`,
  `/check-in/lookup`, …).
- **`types/api.ts`** is generated (`npm run api:types`); `lib/api/schema.ts`
  aliases it. Don't edit it by hand.
- **Laravel turns `""` into `null`** (`ConvertEmptyStringsToNull`), and most
  string rules are `sometimes|string`, so an empty optional string must be
  *omitted*, not sent. The store's builders do this; follow suit in new ones.
- Pages that read data are client components and render skeletons until their
  query resolves; check the query's `data`/`error`, not a global `ready`.

## Session, permissions, branding

- **`lib/auth.ts`** — `useSession()` is `GET /me`: role and role label, side,
  capabilities, active modules, branches, branding. Sign-in posts to
  `/auth/login`; forgot/reset password and invitation acceptance are API flows
  (`/reset-password`, `/accept-invite` are the pages the API's emails link to).
  One-click demo accounts render only when `NEXT_PUBLIC_DEMO_MODE=true`
  (demo builds; every seeded password is `demo1234`).
- **`lib/rbac.ts`** — `useCan()` reads `session.capabilities`, never a local
  matrix (`ROLE_CAPABILITIES` there is documentation of the API's
  AccessMatrix only). Gate inside the action component, not at call sites;
  denied controls render through `DeniedAction` — dimmed with the reason, never
  hidden. `canAsStaff` for staff-only actions (catalogue, roster, vendors,
  scheduling). The API enforces all of it independently.
- **Tenancy is the API's.** A portal session sees exactly its own account; a
  sibling client's record is a 404. There is no client-side scope filter to
  maintain.
- **Branches** — staff with two or more branches get the topbar switcher
  (`lib/api/branch.ts`), persisted per user; it sets `X-Branch-Id` (`all` or one
  allowed branch).
- **Branding** comes from `/me`; `lib/tenant.ts` holds only the platform
  fallback (`DEFAULT_TENANT_SETTINGS`) and colour helpers. Product vs tenant:
  the product is TorqueLane (`lib/platform.ts`), shown where no tenant
  resolves; inside the app the tenant's mark shows. The demo *provider* is
  MekanikoMoR — tenant data in the API's seed.

## Screens worth knowing

- `/shop/*` is the staff side (`lib/nav.ts`'s `PROVIDER_NAV_SECTIONS`);
  `homeHrefFor(side, role)` decides where sign-in lands. A portal session on
  `/shop` gets a notice; staff on `/dashboard` are sent to `/shop`.
- **Work orders**: raised as a draft, then sent (`/send` numbers it and
  auto-approves inside the account's band) — the dialog does both, so the UX is
  one step. Scheduling (bay, time, technician) is staff-only and legal only once
  approved; closing is `workorder:complete` (technicians, not advisors).
- **Check-in** (`components/shop/check-in-workflow.tsx`): exact plate/VIN lookup
  via `/check-in/lookup` (a stale odometer is never pre-filled), walk-in
  registration via `POST /check-in` (consent recorded in the same call), the
  reading via `/vehicles/{id}/readings` (an implausible one comes back as a 422
  with `confirm_warning` — show the warning, ask, resend), then create → send →
  schedule per chosen job. Check-out lists `/shop/ready-for-collection` and
  releases all-or-none.
- **The stock room** (`/shop/inventory/*`, staff only; `inventory:view` to read,
  `inventory:manage` to change): Items, Stock on hand, Item movements, Receive PO,
  Stock count, Transfers, Reorder. Data is `lib/inventory.ts` (hooks and
  `useInventoryActions()`, keyed like `lib/store.ts`) over `lib/api/inventory.ts`
  (the raw resources and their mappers; types in `types/inventory.ts`). It renders
  the API's figures only: on hand, average cost, value, "low" / "negative", a
  purchase order's derived status and `can_*` flags, a count's variances, the
  Reorder suggestion. Stock only ever changes through a document (a receipt,
  a job, a count, a transfer) or an opening balance; there is no "edit quantity".
  A refused move (409 `conflict`, `details.reason = insufficient_stock`) shows in
  the dialog that made it.
- **Parts source on work-order lines** (`lib/parts-source.ts`): new lines choose
  Shop stock (names an inventory item, priced at the branch's price by the API
  unless typed over), Bought for this job, or Customer supplied (no part charge:
  the rate is disabled and 0). `own_stock` / `supplier_provided` still display on
  existing lines. The new-work-order dialog's estimate stays a labelled preview;
  staff see a job's `stock` cost and margin on its page (the API sends it to
  staff only).
- **Order-to-cash** (Phase 7): `/shop/billing` (the billing queue: closed jobs
  no invoice carries, oldest first; pick one account's jobs → a draft),
  `/invoices` and `/invoices/[id]` (both sides: staff see their branches,
  a portal user their own account's issued invoices, payments, balance and
  statement), `/shop/receivables` (AR aging as of a date; revenue invoiced vs
  received), and a **Balance** tab on `/shop/clients/[id]`. The invoice's VAT
  breakdown, balance, `days_overdue` and `can_*` are the API's; PDFs (invoice,
  acknowledgment receipt, statement) download through `apiBlob`. A closed
  job's stage is `ready_for_billing` → `invoiced` → `completed` (paid): the
  check-out's "Hand back vehicle" stamps `released_at` and settles nothing.
  Raising work for an account over its credit limit succeeds with a
  `warnings` entry, shown in the new-work-order dialog and check-in. No
  screen claims BIR accreditation.
- **The books** (Phase 8; `/shop/books/*`, staff only; `ledger:view` reads,
  `ledger:manage` changes): Chart of accounts (`/shop/books`), Posting rules and
  the accountant's export mapping (`/shop/books/rules`), Journal browser with an
  entry dialog and the CSV / Xero / QuickBooks export (`/shop/books/journal`),
  Period close (`/shop/books/periods`: the five-check list, close a month for
  good) and the accounting reports (`/shop/books/reports`: trial balance,
  general ledger, profit and loss by branch and consolidated, balance sheet,
  daily sales). Money and stock events post their own entries in the API; there
  is no way to make an entry by hand. A branch manager reads and sees the change
  and close controls dimmed (`DeniedAction`); everyone else gets the reason.
- **Documents** upload as multipart to the API (10 MB); a document on no vehicle
  is filed against an account (the portal user's own, or one staff pick).
  Downloads open a short-lived signed URL.

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
  the gap 
  echanism), never by a contrasting border.
- Every chart goes through `ChartFrame`, which supplies the table view. Don't add
  a chart without one — no value should be reachable only by hovering.

## Conventions

- Path alias `@/*` from the project root.
- `cn()` from `lib/utils` for class merging; formatters (`formatCurrency`,
  `formatKm`, `formatDayDelta`, …) live there too — reuse rather than re-format.
- Filters go in **one row above** everything they scope, never inside a card.
- Currency is PHP; dates render via `date-fns` through the `lib/utils` helpers.
