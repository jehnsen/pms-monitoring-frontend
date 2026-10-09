import { describe, expect, it } from "vitest";
import { sourceChoices, isLegacySource, NEW_LINE_SOURCES, DEFAULT_SOURCE_CHOICES } from "@/lib/parts-source";
import { formatQuantity } from "@/lib/utils";
import {
  toItem,
  toReorderRow,
  toShopOrder,
  toStockMove,
  toStockRow,
  toStockSummary,
  type RawItem,
  type RawReorderRow,
  type RawShopOrder,
  type RawStockMove,
  type RawStockRow,
} from "@/lib/api/inventory";

/**
 * The seam between the API's inventory resources and the screens: snake_case
 * to camelCase, centavos to pesos for display, decimal strings to numbers.
 * The mappers compute nothing else; every figure is the API's.
 */

const item = { id: "i1", sku: "90915-YZZD4", name: "Engine oil filter", uom: "pc", item_type: "part" };

describe("item mapper", () => {
  it("reads an item with its per-branch settings and stock", () => {
    const raw: RawItem = {
      ...item,
      barcode: null,
      category: "engine",
      purchase_uom: "box",
      purchase_uom_factor: "10.000",
      tax_class: "vatable",
      default_price_cents: 52000,
      is_stocked: true,
      is_active: true,
      preferred_vendor_id: "v1",
      preferred_vendor_name: "Toyota Shaw Service Center",
      branches: [
        {
          branch_id: "b1",
          location_id: "l1",
          reorder_point: "8.000",
          reorder_qty: "20.000",
          bin: "A-01",
          price_override_cents: null,
          effective_price_cents: 52000,
          on_hand: "13.000",
          avg_cost_cents: 35231,
          value_cents: 458003,
        },
      ],
      totals: { on_hand: "13.000", value_cents: 458003 },
    };

    const mapped = toItem(raw);

    expect(mapped.defaultPrice).toBe(520);
    expect(mapped.purchaseUomFactor).toBe(10);
    expect(mapped.branches[0]).toMatchObject({ onHand: 13, avgCost: 352.31, value: 4580.03, reorderPoint: 8, priceOverride: null, effectivePrice: 520, bin: "A-01" });
    expect(mapped.totalValue).toBe(4580.03);
  });
});

describe("stock mappers", () => {
  it("reads a stock row and its summary", () => {
    const raw: RawStockRow = {
      id: "s1",
      item,
      branch_id: "b1",
      location_id: "l1",
      location_name: "Main store",
      on_hand: "-2.000",
      avg_cost_cents: 5000,
      value_cents: -10000,
      reorder_point: null,
      reorder_qty: null,
      bin: null,
      is_low: false,
      is_negative: true,
    };

    expect(toStockRow(raw)).toMatchObject({ onHand: -2, avgCost: 50, value: -100, reorderPoint: null, isNegative: true });
    expect(toStockSummary({ lines: 3, value_cents: 123456, low: 1, negative: 0 })).toEqual({ lines: 3, value: 1234.56, low: 1, negative: 0 });
  });

  it("keeps a move's sign and its source", () => {
    const raw: RawStockMove = {
      id: "m1",
      item,
      branch_id: "b1",
      location_id: "l1",
      move_type: "issue",
      quantity: "-2.000",
      unit_cost_cents: 35231,
      value_cents: 70462,
      source_type: "work_order_line",
      source_id: "wl1",
      source_reference: "WO-2026-1656",
      source_document_id: "wo1",
      occurred_at: "2026-10-08T02:00:00Z",
      actor_name: "Arnel Pascual",
      reason: "Issued to WO-2026-1656",
      negative_flag: false,
    };

    expect(toStockMove(raw)).toMatchObject({ moveType: "issue", quantity: -2, unitCost: 352.31, value: 704.62, sourceReference: "WO-2026-1656", negative: false });
  });

  it("reads the reorder suggestion as the API gave it", () => {
    const raw: RawReorderRow = {
      item: { ...item, purchase_uom: "box", purchase_uom_factor: "10.000", preferred_vendor_id: "v1", preferred_vendor_name: "Toyota" },
      branch_id: "b1",
      on_hand: "3.000",
      on_order: "0.000",
      forecast_shortfall: "4.000",
      reorder_point: "8.000",
      reorder_qty: "20.000",
      projected: "-1.000",
      reason: "below_reorder_point",
      needs_order: true,
      suggested_stock_quantity: "20.000",
      suggested_purchase_quantity: "2.000",
      last_unit_cost_cents: null,
    };

    expect(toReorderRow(raw)).toMatchObject({ reason: "below_reorder_point", needsOrder: true, suggestedPurchaseQuantity: 2, forecastShortfall: 4, projected: -1, lastUnitCost: null });
  });
});

describe("shop order mapper", () => {
  it("carries the API's derived status and flags", () => {
    const raw: RawShopOrder = {
      id: "o1",
      reference: "SPO-2026-0001",
      branch_id: "b1",
      vendor_id: "v1",
      vendor_name: "Toyota Shaw Service Center",
      status: "partially_received",
      notes: "",
      created_on: "2026-10-08",
      expected_on: null,
      created_by_name: "Mike Manabat",
      total_cents: 1990000,
      issued_at: "2026-10-08T02:00:00Z",
      cancelled_at: null,
      cancellation_reason: null,
      can_edit: false,
      can_issue: false,
      can_receive: true,
      can_cancel: false,
      lines: [
        {
          id: "ol1",
          item,
          description: "Engine oil filter",
          purchase_uom: "box",
          purchase_uom_factor: "10.000",
          quantity: "3.000",
          unit_cost_cents: 350000,
          line_total_cents: 1050000,
          received_quantity: "1.000",
          outstanding_quantity: "2.000",
          work_order_line_id: null,
        },
      ],
      receipts: [{ id: "r1", reference: "GR-2026-0001", status: "posted", received_on: "2026-10-08", total_cents: 350000 }],
      history: [],
    };

    const order = toShopOrder(raw);

    expect(order.status).toBe("partially_received");
    expect(order.canReceive).toBe(true);
    expect(order.total).toBe(19900);
    expect(order.lines[0]).toMatchObject({ quantity: 3, receivedQuantity: 1, outstandingQuantity: 2, unitCost: 3500 });
    expect(order.receipts[0].total).toBe(3500);
  });
});

describe("parts source choices", () => {
  it("offers the three new sources for a new line", () => {
    expect(NEW_LINE_SOURCES).toEqual(["shop_stock", "purchased_for_job", "customer_supplied"]);
    expect(sourceChoices("shop_stock")).toEqual(NEW_LINE_SOURCES);
  });

  it("keeps a legacy value on a line that already has it, and no longer offers it otherwise", () => {
    expect(isLegacySource("own_stock")).toBe(true);
    expect(isLegacySource("shop_stock")).toBe(false);
    expect(sourceChoices("supplier_provided")).toEqual(["supplier_provided", "shop_stock", "purchased_for_job", "customer_supplied"]);
  });

  it("never offers shop stock as a default: it needs a particular item", () => {
    expect(DEFAULT_SOURCE_CHOICES).not.toContain("shop_stock");
  });
});

describe("quantity formatting", () => {
  it("shows up to three decimals and no trailing zeros", () => {
    expect(formatQuantity(13)).toBe("13");
    expect(formatQuantity(2.5)).toBe("2.5");
    expect(formatQuantity(0.125)).toBe("0.125");
    expect(formatQuantity(1234.5)).toBe("1,234.5");
  });
});
