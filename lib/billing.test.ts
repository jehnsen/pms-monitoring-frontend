import { describe, expect, it } from "vitest";
import {
  approvedGrandTotal,
  computeTotals,
  lineAmount,
  lineLabourAmount,
  linePartAmount,
  recalcLine,
  totalsFromSubtotal,
  withRates,
} from "@/lib/billing";
import { DEFAULT_APPROVAL_SETTINGS } from "@/lib/approvals";
import type { ApprovalSettings, WorkOrderLine } from "@/types";

const settings: ApprovalSettings = DEFAULT_APPROVAL_SETTINGS;

function line(overrides: Partial<WorkOrderLine> = {}): WorkOrderLine {
  return recalcLine({
    id: "line-1",
    description: "Brake pad replacement",
    category: "brakes",
    quantity: 1,
    unitPartRate: 2_000,
    labourHours: 1,
    labourRate: 500,
    partCost: 0,
    labourCost: 0,
    urgency: "recommended",
    partsSource: "supplier_provided",
    approvalStatus: "pending",
    approvedBy: null,
    approvedAt: null,
    declineReason: null,
    photoUrls: [],
    ...overrides,
  });
}

describe("line amounts", () => {
  it("multiplies quantity by the unit rate", () => {
    expect(linePartAmount({ quantity: 4, unitPartRate: 850, labourHours: 0, labourRate: 0 })).toBe(
      3_400
    );
  });

  it("multiplies labour hours by the shop rate", () => {
    expect(
      lineLabourAmount({ quantity: 1, unitPartRate: 0, labourHours: 2.5, labourRate: 650 })
    ).toBe(1_625);
  });

  it("reports the line total as parts plus labour", () => {
    expect(lineAmount({ quantity: 2, unitPartRate: 500, labourHours: 1, labourRate: 650 })).toBe(
      1_650
    );
  });

  it("keeps fractional hours to the centavo", () => {
    // 0.3h at ₱650 is ₱195 exactly; the guard is against float drift like 194.99999
    expect(
      lineLabourAmount({ quantity: 1, unitPartRate: 0, labourHours: 0.3, labourRate: 650 })
    ).toBe(195);
  });
});

describe("recalcLine", () => {
  it("writes the extended amounts from the qty/rate inputs", () => {
    const result = recalcLine(line({ quantity: 3, unitPartRate: 1_000, labourHours: 2, labourRate: 650 }));
    expect(result.partCost).toBe(3_000);
    expect(result.labourCost).toBe(1_300);
  });

  it("is what keeps a stored total from drifting after a quantity change", () => {
    const original = line({ quantity: 1, unitPartRate: 2_000 });
    expect(original.partCost).toBe(2_000);

    // Changing quantity without recalculating is exactly the drift this guards.
    const bumped = recalcLine({ ...original, quantity: 3 });
    expect(bumped.partCost).toBe(6_000);
  });
});

describe("withRates", () => {
  it("reconstructs inputs that reproduce a legacy row's stored total", () => {
    // A row written before the qty/rate columns existed: costs, no rates.
    const legacy = withRates({
      id: "old",
      description: "Old line",
      category: "engine",
      partCost: 4_500,
      labourCost: 1_300,
      urgency: "recommended",
      partsSource: "supplier_provided",
      approvalStatus: "approved",
      approvedBy: "A",
      approvedAt: "2026-01-01T00:00:00.000Z",
      declineReason: null,
      photoUrls: [],
    });

    expect(legacy.quantity).toBe(1);
    expect(legacy.unitPartRate).toBe(4_500);
    // A cost cannot be split into hours x rate without inventing one, so it
    // becomes a single flat hour — the total is what has to survive.
    expect(legacy.labourHours).toBe(1);
    expect(legacy.labourRate).toBe(1_300);
    expect(lineAmount(legacy)).toBe(5_800);
  });

  it("leaves a line that already carries rates alone", () => {
    const explicit = withRates({
      ...line({ quantity: 2, unitPartRate: 300, labourHours: 4, labourRate: 650 }),
    });
    expect(explicit.quantity).toBe(2);
    expect(explicit.unitPartRate).toBe(300);
    expect(explicit.labourHours).toBe(4);
  });

  it("does not invent labour hours for a line that bills none", () => {
    const partsOnly = withRates({
      id: "p",
      description: "Filter",
      category: "engine",
      partCost: 900,
      labourCost: 0,
      urgency: "optional",
      partsSource: "own_stock",
      approvalStatus: "pending",
      approvedBy: null,
      approvedAt: null,
      declineReason: null,
      photoUrls: [],
    });
    expect(partsOnly.labourHours).toBe(0);
    expect(lineLabourAmount(partsOnly)).toBe(0);
  });
});

describe("computeTotals", () => {
  it("rolls parts, labour, misc and VAT into a grand total", () => {
    const totals = computeTotals(
      [line({ quantity: 2, unitPartRate: 1_000, labourHours: 2, labourRate: 500 })],
      { vatRatePct: 12, miscFeeFlat: 500 }
    );

    expect(totals.partsTotal).toBe(2_000);
    expect(totals.labourTotal).toBe(1_000);
    expect(totals.subTotal).toBe(3_000);
    expect(totals.miscTotal).toBe(500);
    // 12% of (3000 + 500)
    expect(totals.taxTotal).toBe(420);
    expect(totals.grandTotal).toBe(3_920);
  });

  it("treats a 0% rate as a real setting, not a missing one", () => {
    const totals = computeTotals([line()], { vatRatePct: 0, miscFeeFlat: 0 });
    expect(totals.taxTotal).toBe(0);
    expect(totals.grandTotal).toBe(totals.subTotal);
  });

  it("bills nothing at all for an order with no lines", () => {
    // A flat misc fee on an empty order would be a charge for no work.
    const totals = computeTotals([], { vatRatePct: 12, miscFeeFlat: 500 });
    expect(totals.subTotal).toBe(0);
    expect(totals.miscTotal).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });

  it("counts only the statuses asked for", () => {
    const lines = [
      line({ id: "a", approvalStatus: "approved", quantity: 1, unitPartRate: 1_000, labourHours: 0 }),
      line({ id: "b", approvalStatus: "declined", quantity: 1, unitPartRate: 5_000, labourHours: 0 }),
    ];

    const approved = computeTotals(lines, settings, ["approved"]);
    expect(approved.subTotal).toBe(1_000);

    // Unfiltered is the quotation view — everything still on the table.
    expect(computeTotals(lines, settings).subTotal).toBe(6_000);
  });

  it("rounds once at the total rather than per line", () => {
    // Three lines that each land on a third of a peso: summing pre-rounded
    // lines would drift, summing then rounding does not.
    const thirds = [
      line({ id: "a", quantity: 1, unitPartRate: 0.33, labourHours: 0 }),
      line({ id: "b", quantity: 1, unitPartRate: 0.33, labourHours: 0 }),
      line({ id: "c", quantity: 1, unitPartRate: 0.34, labourHours: 0 }),
    ];
    expect(computeTotals(thirds, { vatRatePct: 0, miscFeeFlat: 0 }).subTotal).toBe(1);
  });

  it("carries the rate it taxed at, so a receipt can state it", () => {
    expect(computeTotals([line()], { vatRatePct: 12, miscFeeFlat: 0 }).vatRatePct).toBe(12);
  });
});

describe("totalsFromSubtotal", () => {
  it("bills an order that has no lines by the same rules", () => {
    // Seeded history carries aggregates only; it still has to show a total.
    const totals = totalsFromSubtotal(4_000, 1_000, { vatRatePct: 12, miscFeeFlat: 0 });
    expect(totals.subTotal).toBe(5_000);
    expect(totals.taxTotal).toBe(600);
    expect(totals.grandTotal).toBe(5_600);
  });

  it("agrees with computeTotals for the same money", () => {
    const viaLines = computeTotals(
      [line({ quantity: 1, unitPartRate: 4_000, labourHours: 2, labourRate: 500 })],
      { vatRatePct: 12, miscFeeFlat: 250 }
    );
    const viaAggregate = totalsFromSubtotal(4_000, 1_000, {
      vatRatePct: 12,
      miscFeeFlat: 250,
    });
    expect(viaAggregate.grandTotal).toBe(viaLines.grandTotal);
  });

  it("bills nothing for an empty order", () => {
    const totals = totalsFromSubtotal(0, 0, { vatRatePct: 12, miscFeeFlat: 500 });
    expect(totals.grandTotal).toBe(0);
    expect(totals.miscTotal).toBe(0);
  });
});

describe("approvedGrandTotal", () => {
  it("bills only what the client actually authorised", () => {
    const lines = [
      line({ id: "a", approvalStatus: "approved", quantity: 1, unitPartRate: 1_000, labourHours: 0 }),
      line({ id: "b", approvalStatus: "pending", quantity: 1, unitPartRate: 9_000, labourHours: 0 }),
    ];
    // 1000 + 12% VAT, with the pending line excluded entirely.
    expect(approvedGrandTotal(lines, { vatRatePct: 12, miscFeeFlat: 0 })).toBe(1_120);
  });
});
