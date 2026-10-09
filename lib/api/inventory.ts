/**
 * The shop's inventory endpoints (`/items`, `/stock/*`, `/shop-purchase-orders`,
 * `/goods-receipts`, `/stock-counts`, `/stock-transfers`): the API's raw
 * resources, and the seam that turns them into `types/inventory.ts`
 * (snake_case → camelCase, centavos → pesos for display, decimal strings →
 * numbers). Nothing is derived here: every status, value and suggestion is
 * the API's.
 */
import { centsToPesos } from "@/lib/mappers";
import type {
  GoodsReceipt,
  Item,
  ItemBranch,
  ItemRef,
  ItemType,
  MoveSource,
  MoveType,
  ReorderReason,
  ReorderRow,
  ShopOrder,
  ShopOrderLine,
  ShopOrderStatus,
  StockAlert,
  StockCount,
  StockLocation,
  StockMoveRow,
  StockRow,
  StockSummary,
  StockTransfer,
  TaxClass,
} from "@/types/inventory";

function qty(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return 0;
}

function qtyOrNull(value: string | number | null | undefined): number | null {
  return value === null || value === undefined || value === "" ? null : qty(value);
}

function pesos(cents: number | null | undefined): number {
  return typeof cents === "number" ? centsToPesos(cents) : 0;
}

function pesosOrNull(cents: number | null | undefined): number | null {
  return typeof cents === "number" ? centsToPesos(cents) : null;
}

/* ------------------------------------------------------------------ items */

export interface RawItemRef {
  id: string;
  sku: string;
  name: string;
  uom: string;
  item_type: string;
}

export function toItemRef(i: RawItemRef): ItemRef {
  return { id: i.id, sku: i.sku, name: i.name, uom: i.uom, itemType: i.item_type as ItemType };
}

export interface RawItem extends RawItemRef {
  barcode: string | null;
  category: string;
  purchase_uom: string | null;
  purchase_uom_factor: string;
  tax_class: string;
  default_price_cents: number;
  is_stocked: boolean;
  is_active: boolean;
  preferred_vendor_id: string | null;
  preferred_vendor_name: string | null;
  branches: {
    branch_id: string;
    location_id: string | null;
    reorder_point: string | null;
    reorder_qty: string | null;
    bin: string | null;
    price_override_cents: number | null;
    effective_price_cents: number;
    on_hand: string;
    avg_cost_cents: number;
    value_cents: number;
  }[];
  totals: { on_hand: string; value_cents: number };
}

export function toItem(i: RawItem): Item {
  return {
    ...toItemRef(i),
    barcode: i.barcode,
    category: i.category,
    purchaseUom: i.purchase_uom,
    purchaseUomFactor: qty(i.purchase_uom_factor),
    taxClass: i.tax_class as TaxClass,
    defaultPrice: pesos(i.default_price_cents),
    isStocked: i.is_stocked,
    isActive: i.is_active,
    preferredVendorId: i.preferred_vendor_id,
    preferredVendorName: i.preferred_vendor_name,
    branches: (i.branches ?? []).map(
      (b): ItemBranch => ({
        branchId: b.branch_id,
        locationId: b.location_id,
        reorderPoint: qtyOrNull(b.reorder_point),
        reorderQty: qtyOrNull(b.reorder_qty),
        bin: b.bin,
        priceOverride: pesosOrNull(b.price_override_cents),
        effectivePrice: pesos(b.effective_price_cents),
        onHand: qty(b.on_hand),
        avgCost: pesos(b.avg_cost_cents),
        value: pesos(b.value_cents),
      })
    ),
    totalOnHand: qty(i.totals?.on_hand),
    totalValue: pesos(i.totals?.value_cents),
  };
}

/* ------------------------------------------------------------------ stock */

export interface RawStockLocation {
  id: string;
  branch_id: string;
  kind: string;
  name: string;
  is_active: boolean;
}

export function toStockLocation(l: RawStockLocation): StockLocation {
  return { id: l.id, branchId: l.branch_id, kind: l.kind, name: l.name, isActive: l.is_active };
}

export interface RawStockRow {
  id: string;
  item: RawItemRef;
  branch_id: string;
  location_id: string;
  location_name: string;
  on_hand: string;
  avg_cost_cents: number;
  value_cents: number;
  reorder_point: string | null;
  reorder_qty: string | null;
  bin: string | null;
  is_low: boolean;
  is_negative: boolean;
}

export function toStockRow(r: RawStockRow): StockRow {
  return {
    id: r.id,
    item: toItemRef(r.item),
    branchId: r.branch_id,
    locationId: r.location_id,
    locationName: r.location_name,
    onHand: qty(r.on_hand),
    avgCost: pesos(r.avg_cost_cents),
    value: pesos(r.value_cents),
    reorderPoint: qtyOrNull(r.reorder_point),
    reorderQty: qtyOrNull(r.reorder_qty),
    bin: r.bin,
    isLow: r.is_low,
    isNegative: r.is_negative,
  };
}

export interface RawStockSummary {
  lines: number;
  value_cents: number;
  low: number;
  negative: number;
}

export function toStockSummary(s: RawStockSummary): StockSummary {
  return { lines: s.lines, value: pesos(s.value_cents), low: s.low, negative: s.negative };
}

export interface RawStockMove {
  id: string;
  item: RawItemRef;
  branch_id: string;
  location_id: string;
  move_type: string;
  quantity: string;
  unit_cost_cents: number;
  value_cents: number;
  source_type: string;
  source_id: string | null;
  source_reference: string | null;
  source_document_id: string | null;
  occurred_at: string;
  actor_name: string;
  reason: string | null;
  negative_flag: boolean;
}

export function toStockMove(m: RawStockMove): StockMoveRow {
  return {
    id: m.id,
    item: toItemRef(m.item),
    branchId: m.branch_id,
    locationId: m.location_id,
    moveType: m.move_type as MoveType,
    quantity: qty(m.quantity),
    unitCost: pesos(m.unit_cost_cents),
    value: pesos(m.value_cents),
    sourceType: m.source_type as MoveSource,
    sourceId: m.source_id,
    sourceReference: m.source_reference,
    sourceDocumentId: m.source_document_id,
    occurredAt: m.occurred_at,
    actorName: m.actor_name,
    reason: m.reason,
    negative: m.negative_flag,
  };
}

export interface RawStockAlert {
  id: string;
  severity: string;
  item: RawItemRef;
  branch_id: string;
  location_id: string;
  location_name: string;
  on_hand: string;
  reorder_point: string;
  message: string;
}

export function toStockAlert(a: RawStockAlert): StockAlert {
  return {
    id: a.id,
    severity: a.severity as StockAlert["severity"],
    item: toItemRef(a.item),
    branchId: a.branch_id,
    locationId: a.location_id,
    locationName: a.location_name,
    onHand: qty(a.on_hand),
    reorderPoint: qty(a.reorder_point),
    message: a.message,
  };
}

export interface RawReorderRow {
  item: RawItemRef & {
    purchase_uom: string;
    purchase_uom_factor: string;
    preferred_vendor_id: string | null;
    preferred_vendor_name: string | null;
  };
  branch_id: string;
  on_hand: string;
  on_order: string;
  forecast_shortfall: string;
  reorder_point: string | null;
  reorder_qty: string | null;
  projected: string;
  reason: string;
  needs_order: boolean;
  suggested_stock_quantity: string;
  suggested_purchase_quantity: string;
  last_unit_cost_cents: number | null;
}

export function toReorderRow(r: RawReorderRow): ReorderRow {
  return {
    item: {
      ...toItemRef(r.item),
      purchaseUom: r.item.purchase_uom,
      purchaseUomFactor: qty(r.item.purchase_uom_factor),
      preferredVendorId: r.item.preferred_vendor_id,
      preferredVendorName: r.item.preferred_vendor_name,
    },
    branchId: r.branch_id,
    onHand: qty(r.on_hand),
    onOrder: qty(r.on_order),
    forecastShortfall: qty(r.forecast_shortfall),
    reorderPoint: qtyOrNull(r.reorder_point),
    reorderQty: qtyOrNull(r.reorder_qty),
    projected: qty(r.projected),
    reason: r.reason as ReorderReason,
    needsOrder: r.needs_order,
    suggestedStockQuantity: qty(r.suggested_stock_quantity),
    suggestedPurchaseQuantity: qty(r.suggested_purchase_quantity),
    lastUnitCost: pesosOrNull(r.last_unit_cost_cents),
  };
}

/* ------------------------------------------------------------- documents */

export interface RawShopOrder {
  id: string;
  reference: string;
  branch_id: string;
  vendor_id: string;
  vendor_name: string;
  status: string;
  notes: string;
  created_on: string;
  expected_on: string | null;
  created_by_name: string;
  total_cents: number;
  issued_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  can_edit: boolean;
  can_issue: boolean;
  can_receive: boolean;
  can_cancel: boolean;
  lines: {
    id: string;
    item: RawItemRef | null;
    description: string;
    purchase_uom: string | null;
    purchase_uom_factor: string;
    quantity: string;
    unit_cost_cents: number;
    line_total_cents: number;
    received_quantity: string;
    outstanding_quantity: string;
    work_order_line_id: string | null;
  }[];
  receipts: { id: string; reference: string; status: string; received_on: string; total_cents: number }[];
  history: { id: string; status: string; at: string; actor_name: string; note: string | null }[];
}

export function toShopOrder(o: RawShopOrder): ShopOrder {
  return {
    id: o.id,
    reference: o.reference,
    branchId: o.branch_id,
    vendorId: o.vendor_id,
    vendorName: o.vendor_name,
    status: o.status as ShopOrderStatus,
    notes: o.notes,
    createdOn: o.created_on,
    expectedOn: o.expected_on,
    createdByName: o.created_by_name,
    total: pesos(o.total_cents),
    issuedAt: o.issued_at,
    cancelledAt: o.cancelled_at,
    cancellationReason: o.cancellation_reason,
    canEdit: o.can_edit,
    canIssue: o.can_issue,
    canReceive: o.can_receive,
    canCancel: o.can_cancel,
    lines: (o.lines ?? []).map(
      (l): ShopOrderLine => ({
        id: l.id,
        item: l.item ? toItemRef(l.item) : null,
        description: l.description,
        purchaseUom: l.purchase_uom,
        purchaseUomFactor: qty(l.purchase_uom_factor),
        quantity: qty(l.quantity),
        unitCost: pesos(l.unit_cost_cents),
        lineTotal: pesos(l.line_total_cents),
        receivedQuantity: qty(l.received_quantity),
        outstandingQuantity: qty(l.outstanding_quantity),
        workOrderLineId: l.work_order_line_id,
      })
    ),
    receipts: (o.receipts ?? []).map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status as "posted" | "voided",
      receivedOn: r.received_on,
      total: pesos(r.total_cents),
    })),
    history: (o.history ?? []).map((h) => ({ id: h.id, status: h.status, at: h.at, actorName: h.actor_name, note: h.note })),
  };
}

export interface RawGoodsReceipt {
  id: string;
  reference: string;
  branch_id: string;
  shop_purchase_order_id: string;
  order_reference: string;
  vendor_name: string;
  status: string;
  received_on: string;
  supplier_ref: string | null;
  notes: string;
  total_cents: number;
  received_by_name: string;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  can_void: boolean;
  lines: {
    id: string;
    shop_purchase_order_line_id: string;
    item: RawItemRef | null;
    description: string;
    quantity: string;
    unit_cost_cents: number;
    line_total_cents: number;
    stock_quantity: string;
    stock_unit_cost_cents: number;
  }[];
}

export function toGoodsReceipt(r: RawGoodsReceipt): GoodsReceipt {
  return {
    id: r.id,
    reference: r.reference,
    branchId: r.branch_id,
    shopPurchaseOrderId: r.shop_purchase_order_id,
    orderReference: r.order_reference,
    vendorName: r.vendor_name,
    status: r.status as "posted" | "voided",
    receivedOn: r.received_on,
    supplierRef: r.supplier_ref,
    notes: r.notes,
    total: pesos(r.total_cents),
    receivedByName: r.received_by_name,
    voidedAt: r.voided_at,
    voidedByName: r.voided_by_name,
    voidReason: r.void_reason,
    canVoid: r.can_void,
    lines: (r.lines ?? []).map((l) => ({
      id: l.id,
      shopPurchaseOrderLineId: l.shop_purchase_order_line_id,
      item: l.item ? toItemRef(l.item) : null,
      description: l.description,
      quantity: qty(l.quantity),
      unitCost: pesos(l.unit_cost_cents),
      lineTotal: pesos(l.line_total_cents),
      stockQuantity: qty(l.stock_quantity),
      stockUnitCost: pesos(l.stock_unit_cost_cents),
    })),
  };
}

export interface RawStockCount {
  id: string;
  reference: string;
  branch_id: string;
  location_id: string;
  status: string;
  reason: string | null;
  notes: string;
  created_on: string;
  created_by_name: string;
  posted_at: string | null;
  can_edit: boolean;
  summary: { lines: number; counted_lines: number; variance_lines: number; net_variance_value_cents: number };
  lines: {
    id: string;
    item: RawItemRef;
    expected_quantity: string;
    counted_quantity: string | null;
    variance_quantity: string | null;
    unit_cost_cents: number | null;
    variance_value_cents: number | null;
    reason: string | null;
  }[];
}

export function toStockCount(c: RawStockCount): StockCount {
  return {
    id: c.id,
    reference: c.reference,
    branchId: c.branch_id,
    locationId: c.location_id,
    status: c.status as StockCount["status"],
    reason: c.reason,
    notes: c.notes,
    createdOn: c.created_on,
    createdByName: c.created_by_name,
    postedAt: c.posted_at,
    canEdit: c.can_edit,
    summary: {
      lines: c.summary.lines,
      countedLines: c.summary.counted_lines,
      varianceLines: c.summary.variance_lines,
      netVarianceValue: pesos(c.summary.net_variance_value_cents),
    },
    lines: (c.lines ?? []).map((l) => ({
      id: l.id,
      item: toItemRef(l.item),
      expectedQuantity: qty(l.expected_quantity),
      countedQuantity: qtyOrNull(l.counted_quantity),
      varianceQuantity: qtyOrNull(l.variance_quantity),
      unitCost: pesosOrNull(l.unit_cost_cents),
      varianceValue: pesosOrNull(l.variance_value_cents),
      reason: l.reason,
    })),
  };
}

export interface RawStockTransfer {
  id: string;
  reference: string;
  from_branch_id: string;
  from_location_id: string;
  to_branch_id: string;
  to_location_id: string;
  reverses_transfer_id: string | null;
  reversed_by_transfer_id: string | null;
  can_reverse: boolean;
  notes: string;
  transferred_on: string;
  created_by_name: string;
  total_value_cents: number;
  lines: { id: string; item: RawItemRef; quantity: string; unit_cost_cents: number; value_cents: number }[];
}

export function toStockTransfer(t: RawStockTransfer): StockTransfer {
  return {
    id: t.id,
    reference: t.reference,
    fromBranchId: t.from_branch_id,
    fromLocationId: t.from_location_id,
    toBranchId: t.to_branch_id,
    toLocationId: t.to_location_id,
    reversesTransferId: t.reverses_transfer_id,
    reversedByTransferId: t.reversed_by_transfer_id,
    canReverse: t.can_reverse,
    notes: t.notes,
    transferredOn: t.transferred_on,
    createdByName: t.created_by_name,
    totalValue: pesos(t.total_value_cents),
    lines: (t.lines ?? []).map((l) => ({
      id: l.id,
      item: toItemRef(l.item),
      quantity: qty(l.quantity),
      unitCost: pesos(l.unit_cost_cents),
      value: pesos(l.value_cents),
    })),
  };
}
