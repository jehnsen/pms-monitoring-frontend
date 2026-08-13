import type { ApprovalSettings, LineApprovalStatus, WorkOrderLine } from "@/types";

/**
 * The money layer for a work order.
 *
 * Every figure a user sees is derived here, from the lines, on every read —
 * nothing is stored as a total and then left to drift. The one exception is a
 * line's own `partCost`/`labourCost`, which *are* stored, because they are the
 * historical price the client approved: re-deriving them from today's rate
 * would silently rewrite an authorised amount. `recalcLine` is the seam that
 * keeps those two stored fields in step with their qty/rate inputs, and it is
 * the only thing that should ever write them.
 *
 * Rounding happens once, at each total, rather than per line — summing
 * pre-rounded lines drifts by a peso or two across a long order, which is
 * exactly the kind of discrepancy that costs an advisor a phone call.
 */

/** Currency is PHP, which has no sub-centavo billing. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A line's inputs, before the extended amounts are computed. This is what a
 * caller supplies; the extended `partCost`/`labourCost` are ours to write.
 */
export type LineRateInput = Pick<
  WorkOrderLine,
  "quantity" | "unitPartRate" | "labourHours" | "labourRate"
>;

/** Extended part total for one line: `quantity * unitPartRate`. */
export function linePartAmount(line: LineRateInput): number {
  return roundMoney(line.quantity * line.unitPartRate);
}

/** Extended labour total for one line: `labourHours * labourRate`. */
export function lineLabourAmount(line: LineRateInput): number {
  return roundMoney(line.labourHours * line.labourRate);
}

/**
 * The `Amount` column: what this single line bills in total.
 *
 * Note this reads the qty/rate inputs, not the stored `partCost`/`labourCost`,
 * so a caller computing a live total mid-edit gets the figure matching what is
 * on screen rather than the last saved one.
 */
export function lineAmount(line: LineRateInput): number {
  return roundMoney(linePartAmount(line) + lineLabourAmount(line));
}

/**
 * Brings a line's stored extended amounts back in step with its qty/rate
 * inputs. Call this on every mutation of a line — adding, editing a rate,
 * changing a quantity — so `partCost`/`labourCost` can never disagree with the
 * numbers they are supposed to be the product of.
 */
export function recalcLine<T extends WorkOrderLine>(line: T): T {
  return {
    ...line,
    partCost: linePartAmount(line),
    labourCost: lineLabourAmount(line),
  };
}

/**
 * Normalises a partial line into a fully-formed one.
 *
 * The qty/rate fields arrived after lines were already in Postgres, so a row
 * written before them has `partCost` but no `unitPartRate`. Rather than
 * back-fill a guess, an absent rate is reconstructed as "one unit at the whole
 * stored cost", which reproduces the original total exactly and leaves the
 * line editable from there. `lib/mappers.ts` leans on this for old rows.
 */
export function withRates(
  line: Omit<WorkOrderLine, "quantity" | "unitPartRate" | "labourHours" | "labourRate"> &
    Partial<LineRateInput>
): WorkOrderLine {
  const quantity = line.quantity ?? 1;
  const labourRate = line.labourRate ?? 0;

  // A stored labourCost with no recorded rate can't be split into hours ×
  // rate without inventing one of them; bill it as a single flat hour so the
  // total survives, which is the only property that actually matters here.
  const labourHours = line.labourHours ?? (line.labourCost > 0 ? 1 : 0);

  const resolved: WorkOrderLine = {
    ...line,
    quantity,
    unitPartRate:
      line.unitPartRate ?? (quantity > 0 ? roundMoney(line.partCost / quantity) : 0),
    labourHours,
    labourRate:
      line.labourRate ??
      (labourHours > 0 ? roundMoney(line.labourCost / labourHours) : labourRate),
  };

  return resolved;
}

/** The billing figures for one work order, all derived from its lines. */
export interface BillingTotals {
  /** Parts across all counted lines. */
  partsTotal: number;
  /** Labour across all counted lines. */
  labourTotal: number;
  /** Parts + labour, before misc and tax. */
  subTotal: number;
  /** The flat shop/miscellaneous charge from settings. */
  miscTotal: number;
  /** VAT on `subTotal + miscTotal`. */
  taxTotal: number;
  /** The rate `taxTotal` was computed at, carried so a receipt can state it. */
  vatRatePct: number;
  /** What is actually owed. */
  grandTotal: number;
}

const ZERO_TOTALS: Omit<BillingTotals, "vatRatePct"> = {
  partsTotal: 0,
  labourTotal: 0,
  subTotal: 0,
  miscTotal: 0,
  taxTotal: 0,
  grandTotal: 0,
};

/**
 * Rolls a set of lines up into the billing summary.
 *
 * `statuses` selects which lines count. Left unset, every line does — the
 * quotation view, where nothing has been decided yet. Pass `["approved"]` to
 * get what the client actually authorised, which is the figure that matters at
 * close-out and the one the variance check must run against.
 *
 * An order with no counted lines bills nothing at all — notably no misc fee and
 * no VAT, since a flat fee on an empty order is a charge for no work.
 */
export function computeTotals(
  lines: WorkOrderLine[],
  settings: Pick<ApprovalSettings, "vatRatePct" | "miscFeeFlat">,
  statuses?: LineApprovalStatus[]
): BillingTotals {
  const counted = statuses
    ? lines.filter((line) => statuses.includes(line.approvalStatus))
    : lines;

  const vatRatePct = settings.vatRatePct;
  if (counted.length === 0) return { ...ZERO_TOTALS, vatRatePct };

  const partsTotal = roundMoney(
    counted.reduce((total, line) => total + linePartAmount(line), 0)
  );
  const labourTotal = roundMoney(
    counted.reduce((total, line) => total + lineLabourAmount(line), 0)
  );
  const subTotal = roundMoney(partsTotal + labourTotal);
  const miscTotal = roundMoney(settings.miscFeeFlat);
  const taxTotal = roundMoney(((subTotal + miscTotal) * vatRatePct) / 100);

  return {
    partsTotal,
    labourTotal,
    subTotal,
    miscTotal,
    taxTotal,
    vatRatePct,
    grandTotal: roundMoney(subTotal + miscTotal + taxTotal),
  };
}

/**
 * The same rollup for an order that has no lines to roll up.
 *
 * Seeded history and anything raised before the line-approval workflow existed
 * carry only aggregate `partsCost`/`laborCost`. Those still have to show a
 * grand total, and it has to be computed by the same rules — so the aggregate
 * becomes the subtotal and misc/VAT apply on top exactly as they would
 * otherwise. Callers pick between this and `computeTotals` on whether
 * `order.lines` is empty; the arithmetic lives in one place either way.
 */
export function totalsFromSubtotal(
  partsTotal: number,
  labourTotal: number,
  settings: Pick<ApprovalSettings, "vatRatePct" | "miscFeeFlat">
): BillingTotals {
  const subTotal = roundMoney(partsTotal + labourTotal);
  const vatRatePct = settings.vatRatePct;

  if (subTotal === 0) return { ...ZERO_TOTALS, vatRatePct };

  const miscTotal = roundMoney(settings.miscFeeFlat);
  const taxTotal = roundMoney(((subTotal + miscTotal) * vatRatePct) / 100);

  return {
    partsTotal: roundMoney(partsTotal),
    labourTotal: roundMoney(labourTotal),
    subTotal,
    miscTotal,
    taxTotal,
    vatRatePct,
    grandTotal: roundMoney(subTotal + miscTotal + taxTotal),
  };
}

/**
 * What the client authorised, tax inclusive.
 *
 * The approval bands in `lib/approvals.ts` deliberately run on the pre-tax
 * line value — a threshold is a decision about the work, and VAT is not a
 * thing anyone approves. This is the separate question of what the invoice
 * comes to, so it is the number to compare an actual against.
 */
export function approvedGrandTotal(
  lines: WorkOrderLine[],
  settings: Pick<ApprovalSettings, "vatRatePct" | "miscFeeFlat">
): number {
  return computeTotals(lines, settings, ["approved"]).grandTotal;
}
