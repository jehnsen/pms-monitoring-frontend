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
- **Detailing** (Phase 9) has its own seam too: `lib/api/detailing.ts` (mappers,
  `DETAILING_ROOT`), `lib/detailing.ts` (hooks and `useDetailingActions()`),
  `lib/detailing-public.ts` (the public booking page and the wall screen: no
  session, so none of the session-keyed hooks) and `lib/detailing-realtime.ts`
  (`useBookingChanges`: Echo over Reverb when the API says realtime is enabled,
  else a timer); types in `types/detailing.ts`. Every detailing query key starts
  with `detailing`. Completing a job consumes stock and a checkout posts an
  invoice and a payment, so those writes also refresh `INVENTORY_ROOTS` and
  `BILLING_ROOTS`. Which starts are free (and why not), where a job sits day by
  day, when it ends, what it comes to and what it is waiting for (`next`) are
  all the API's; nothing is planned or totalled in the browser.
- **The CRM** (Phase 11) has its own seam too: `lib/api/crm.ts` (`CRM_ROOT`,
  `camel()`, `pesos()`), `lib/crm.ts` (hooks and `useCrmActions()`),
  `lib/crm-public.ts` (the pages a message's link opens: no session) and
  `types/crm.ts`. Two things differ from the older seams, on purpose: the
  mapper is ONE generic deep camel-caser (the CRM's payloads are flat and many;
  it changes key names and nothing else), and money stays in CENTAVOS
  (`…Cents`), formatted where it is shown with `pesos()`. A segment's
  `filters` object keeps the API's key names because it is sent straight back.
  Every CRM query key starts with `crm`. Selling a prepaid package and
  redeeming a credit post to the books, so those writes also refresh
  `BILLING_ROOTS` (and a redemption the detailing queries); winning a lead
  opens a customer account, so it refreshes the directory. A CRM record is
  the organization's: these lists do not narrow with the branch switcher.
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
- **Detailing** (Phase 9; `/shop/detailing/*`, staff only, behind the
  `detailing` module): New booking (`/new`), Bookings (`/`), the job card with
  its inspection (`/bookings/[id]`), Schedule by bay or by detailer
  (`/schedule`), Shop monitor (`/monitor`), Packages & pricing (`/packages`)
  and Detailing settings (`/settings`). The nav section carries `module:
  "detailing"` and shows only where `/me` lists the module active
  (`navSectionsFor(side, modules)`); a branch without it gets the API's
  `module_disabled` notice. `detailing:view` reads; `detailing:book`,
  `detailing:work`, `detailing:qc` and `detailing:manage` act, each gated with
  `DeniedAction`. On the job card the order is book → inspect → job → sign-off
  → bill: starting without the check-in inspection comes back as a 409
  (`inspection_required`), and the page then asks for the override reason; an
  implausible mileage comes back as a 422 with `confirm_warning`; the sign-off
  is refused for a detailer named on the job; the counter checkout (invoice +
  payment in one call) mints its `Idempotency-Key` when the dialog opens. The
  damage map (`components/detailing/damage-map.tsx`) stores points in
  thousandths of the outline, as the API does.
- **Equipment monitoring** (Phase 10; `/shop/equipment/*`, staff only, behind
  the `equipment` module): the Health board (`/shop/equipment`: every tool with
  its service status, forecast, runtime and health, and the floor in numbers),
  the Equipment register (`/shop/equipment/register`: what each tool is, its
  make, serial, cost and service plan; add and edit), one tool
  (`/shop/equipment/[id]`: its service plan, reliability and cost, service
  history and usage log; log a service, log usage, change status) and Service
  profiles (`/shop/equipment/profiles`: which packages put how many hours on
  which tools). Data is `lib/equipment.ts` over `lib/api/equipment.ts` (types in
  `types/equipment.ts`; every key starts with `equipment`). **Nothing is
  metered in the browser**: a tool's runtime, ratios, due date and health score
  are derived by the API each time it is read, from completed detailing jobs and
  the usage log, so there is no "edit meter" anywhere. Which limit of the plan
  "trips first" (`service.binding`) and the reading or date each falls due at
  (`dueAt` / `dueOn`) are the API's maintenance engine's. A tool whose
  `countUnit` is `cups` (the espresso machine) shows cups where others show
  jobs. "Log a service" can take parts from the branch's store (`issuedParts`,
  picked from `useItemOptions()`): the API moves the stock and books the
  expense, so that write and removing an entry refresh `INVENTORY_ROOTS` (which
  carries the books); a refusal (not enough on the shelf) shows in the dialog.
  Every equipment write also refreshes `alerts`: a tool due for service or near
  its rated life is in the bell with the rest (`equipment_*` kinds). The form's
  lists and the values a category suggests come from `GET /equipment/options`.
  `equipment:view` reads; `equipment:manage` writes (`DeniedAction` otherwise).
- **The CRM** (Phase 11; `/shop/crm/*`, staff only, behind the `crm` module):
  Customers (`/shop/crm`), Customer 360 (`/shop/crm/customers/[id]`: one
  customer whole, with jobs, invoices, payments and bookings from EVERY branch,
  consents, notes, tasks, messages, membership, packages and a timeline the API
  builds from those records), Tasks (`/tasks`, including the booking requests
  customers leave from a reminder), Pipeline (`/pipeline`: leads by stage;
  losing asks why, winning converts to a company account with its terms and
  consent), Memberships & packages (`/memberships`: tiers, prepaid plans,
  packages sold and what they still owe as service), Reminder rules
  (`/reminders`: the four kinds, quiet hours and the other limits, "Run now"),
  Templates (`/templates`), Message log (`/messages`: sent, queued, failed and
  NOT sent with the reason, plus feedback and the NPS) and Segments & campaigns
  (`/campaigns`). `crm:view` reads, `crm:work` keeps notes and tasks, works
  leads, enrols and sells, `crm:manage` sets up; each gated with `DeniedAction`.
  **Nothing is decided in the browser**: who may be sent a message (consent,
  opt-out, cooldown, quiet hours), a task's `overdue`, a segment's size, a
  campaign's progress and a package's credits are the API's. The sale and the
  redemption of a prepaid credit each mint their `Idempotency-Key` once.
  On the detailing screens, `CustomerBenefitsNote` shows what a customer holds
  when they are picked for a booking, and `RedeemCredit` offers to settle a
  finished job with a prepaid credit where the API says it may
  (`next.canRedeem`); both render nothing for a session without the CRM.
- **A message's links** (`/r/[token]`, `/feedback/[token]`,
  `/unsubscribe/[token]`): no sign-in; the token in the URL is the credential.
  A reminder's link sends the customer to the branch's online booking where it
  has one, else takes a booking request; feedback takes one 0–10 answer;
  unsubscribe changes nothing until its button is pressed (mail scanners
  follow links). A dead token gets one message that never says whether it
  ever existed.
- **Public booking** (`/book/[branchSlug]`, and
  `/book/[branchSlug]/confirmation/[token]`): no sign-in. The page wears the
  BRANCH's look: `BranchTheme` sets the branch's `theme_tokens` (the same
  names as this app's design tokens, plus `font-heading` / `font-body`) as CSS
  variables on its wrapper, so semantic classes re-theme inside it. Samahuzai's
  tokens are obsidian and gold, Cormorant Garamond over DM Sans (loaded in
  `app/book/layout.tsx`). When the branch has online booking off, the page
  shows the API's notice instead of the form.
- **The wall screen** (`/display/monitor`): no sign-in. The link made under
  Detailing settings → Displays carries a display token in its URL fragment; the
  page keeps it on the device, sends it as `X-Display-Token` (never a cookie),
  and shows a "disconnected" message once the token is revoked.
- **The guide** (`/documentation`) and **the walkthrough** (`/workflow`): both
  public, no sign-in. `lib/guide.ts` holds the modules and the eight processes
  as plain data (no imports, so server components read it); the documentation
  page shows them in full, the workflow page shows the six that are not
  animated as step strips linking back to it. The role tables on the
  documentation page are drawn from `lib/rbac.ts` (`ROLE_CAPABILITIES`,
  `ROLE_DESCRIPTION`), the same table the access page shows. **When a screen,
  a rule or a grant changes, change its sentence in `lib/guide.ts` or its row
  in `lib/rbac.ts`**: neither is consulted to allow anything, so nothing will
  fail if they go stale; they will just be wrong.
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
