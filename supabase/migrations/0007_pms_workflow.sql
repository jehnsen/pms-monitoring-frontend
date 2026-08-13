-- =====================================================================
-- MekanikoMoR — work order workflow: itemised billing, order numbering,
-- and approval assignment
--
-- Three changes, all to existing tables. No new tables, so no new RLS
-- policies or grants: every column added here inherits the policies already
-- on its table, and the tenancy rule is unchanged.
--
--   1. Work order lines gain quantity/rate inputs. They previously stored
--      only the extended `part_cost`/`labour_cost`, which meant a line could
--      be shown and approved but never explained — there was no way to say
--      "4 units at ₱850" or to recompute a total when a quantity changed.
--
--      The extended columns STAY, and are not replaced by generated columns.
--      They are the historical price the client approved; deriving them at
--      read time would let a later rate edit silently rewrite an authorised
--      amount. lib/billing.ts's `recalcLine` is what keeps the two in step.
--
--   2. `pms_work_orders.reference` becomes nullable-by-emptiness and gains a
--      unique index. Numbers are now issued at draft -> pending_approval
--      rather than at creation, so a draft that never leaves the shop doesn't
--      burn one and leave a gap in the book.
--
--   3. `assigned_provider_id` records which provider owns the work once it is
--      authorised, stamped automatically on approval.
--
-- Idempotent: safe to run more than once.
-- =====================================================================


-- =====================================================================
-- 1. Itemised line billing
--
-- Defaults reproduce each existing row's current total exactly, so the
-- backfill is not a guess:
--   quantity 1 x unit_part_rate (= old part_cost)  = old part_cost
--   labour_hours x labour_rate                     = old labour_cost
--
-- Labour is the awkward half: an existing row records a labour cost but no
-- rate, and a cost cannot be split into hours x rate without inventing one of
-- them. It is backfilled as a single flat hour at the whole stored cost,
-- which preserves the only property that matters — the total — and leaves the
-- line editable from there. lib/billing.ts's `withRates` applies the same
-- rule for any row that predates these columns.
-- =====================================================================

alter table pms_work_order_lines
  add column if not exists quantity       numeric not null default 1,
  add column if not exists unit_part_rate numeric not null default 0,
  add column if not exists labour_hours   numeric not null default 0,
  add column if not exists labour_rate    numeric not null default 0;

-- A quantity of zero would make `quantity * unit_part_rate` collapse a real
-- part cost to nothing; a line that bills only labour still counts as one of
-- itself. Negative rates are never a discount here — a credit is its own line.
alter table pms_work_order_lines
  drop constraint if exists pms_wo_lines_quantity_positive;
alter table pms_work_order_lines
  add constraint pms_wo_lines_quantity_positive check (quantity > 0);

alter table pms_work_order_lines
  drop constraint if exists pms_wo_lines_rates_non_negative;
alter table pms_work_order_lines
  add constraint pms_wo_lines_rates_non_negative check (
    unit_part_rate >= 0 and labour_hours >= 0 and labour_rate >= 0
  );

-- Backfill: only rows still at the column defaults, so re-running never
-- overwrites a rate a user has since edited.
update pms_work_order_lines
   set unit_part_rate = part_cost
 where unit_part_rate = 0
   and part_cost > 0;

update pms_work_order_lines
   set labour_hours = 1,
       labour_rate  = labour_cost
 where labour_hours = 0
   and labour_cost > 0;


-- =====================================================================
-- 2. Order numbering
--
-- The number is issued when the order stops being the shop's own scratch
-- space — the draft -> pending_approval shift — not at creation.
--
-- The previous generator counted the caller's *visible* work orders, which
-- was wrong twice over: the list was already narrowed by tenant scope, so two
-- fleet clients under one provider both produced WO-2026-0001; and a count
-- goes backwards when a row is filtered out, colliding with a live number.
-- lib/work-order-machine.ts's `nextReference` scans for the highest issued
-- number instead, which is gap-tolerant.
--
-- That generator still runs on the client and can race between two advisors
-- numbering at once. This index is what makes the race safe: the loser's
-- insert fails and the store's optimistic write rolls back, rather than two
-- orders quietly sharing a number. Empty references are excluded so any
-- number of unnumbered drafts can coexist.
-- =====================================================================

create unique index if not exists pms_work_orders_reference_key
  on pms_work_orders (reference)
  where reference <> '';

alter table pms_work_orders
  alter column reference set default '';


-- =====================================================================
-- 3. Approval assignment
--
-- Which provider owns the work once it is authorised. Stamped automatically
-- when approval lands, so no authorised job sits unowned.
--
-- Deliberately NOT `pms_work_orders.vendor`: that column means a third-party
-- shop the work is sent out to, and writing the provider's own name into it
-- would place the provider in its own vendor-spend analytics beside real
-- subcontractors. An in-house job has an assigned provider and an empty
-- vendor; the two facts are independent.
--
-- Nullable because a draft or a declined order has nothing assigned yet.
-- =====================================================================

alter table pms_work_orders
  add column if not exists assigned_provider_id text
    references pms_providers(id) on delete set null;

create index if not exists pms_work_orders_assigned_provider_idx
  on pms_work_orders (assigned_provider_id)
  where assigned_provider_id is not null;

-- Existing work that is already authorised is assigned to the provider that
-- owns its vehicle's client — one hop up the tenancy tree, the same rule
-- `assignOnApproval` applies to new approvals.
update pms_work_orders wo
   set assigned_provider_id = fc.provider_id
  from pms_vehicles v
  join pms_fleet_clients fc on fc.id = v.fleet_client_id
 where wo.vehicle_id = v.id
   and wo.assigned_provider_id is null
   and wo.status in ('approved', 'partially_approved', 'scheduled',
                     'in_progress', 'closed');


-- =====================================================================
-- 4. Billing settings
--
-- VAT is per provider rather than a constant: 12% is the Philippine standard
-- rate, but a non-VAT-registered provider setting 0 is a real configuration,
-- not a missing value — which is why these are `not null` with defaults
-- rather than nullable.
-- =====================================================================

alter table pms_approval_settings
  add column if not exists vat_rate_pct       numeric not null default 12,
  add column if not exists misc_fee_flat      numeric not null default 0,
  add column if not exists default_labour_rate numeric not null default 650;

alter table pms_approval_settings
  drop constraint if exists pms_approval_settings_vat_rate_range;
alter table pms_approval_settings
  add constraint pms_approval_settings_vat_rate_range check (
    vat_rate_pct >= 0 and vat_rate_pct <= 100
  );

alter table pms_approval_settings
  drop constraint if exists pms_approval_settings_misc_fee_non_negative;
alter table pms_approval_settings
  add constraint pms_approval_settings_misc_fee_non_negative check (
    misc_fee_flat >= 0 and default_labour_rate >= 0
  );
