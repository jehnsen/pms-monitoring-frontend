/**
 * The shop's own inventory, as the screens use it. Money is pesos (display
 * only, from the API's centavos); a quantity is a number (the API's decimal
 * string). Every figure here is the API's: value, status, suggestions,
 * `can_*` flags. Nothing is derived in the browser.
 */

export type ItemType = "part" | "consumable" | "retail" | "ingredient" | "service_fee";

export type TaxClass = "vatable" | "vat_exempt" | "zero_rated";

export type NegativeStockPolicy = "allow_and_flag" | "block";

export type MoveType = "opening" | "receipt" | "issue" | "return" | "adjustment" | "transfer_out" | "transfer_in" | "consumption";

export type MoveSource = "manual" | "goods_receipt" | "work_order_line" | "stock_count" | "stock_transfer";

/** An item as another record names it. */
export interface ItemRef {
  id: string;
  sku: string;
  name: string;
  uom: string;
  itemType: ItemType;
}

/** How one branch runs an item, and what it holds there. */
export interface ItemBranch {
  branchId: string;
  locationId: string | null;
  reorderPoint: number | null;
  reorderQty: number | null;
  bin: string | null;
  /** Pesos. */
  priceOverride: number | null;
  /** What a line for this item is priced at in this branch (pesos). */
  effectivePrice: number;
  onHand: number;
  avgCost: number;
  value: number;
}

export interface Item extends ItemRef {
  barcode: string | null;
  category: string;
  purchaseUom: string | null;
  /** Stock units in one purchase unit. */
  purchaseUomFactor: number;
  taxClass: TaxClass;
  /** Pesos. */
  defaultPrice: number;
  isStocked: boolean;
  isActive: boolean;
  preferredVendorId: string | null;
  preferredVendorName: string | null;
  branches: ItemBranch[];
  totalOnHand: number;
  totalValue: number;
}

export interface StockLocation {
  id: string;
  branchId: string;
  kind: string;
  name: string;
  isActive: boolean;
}

/** One row of Stock on hand. */
export interface StockRow {
  id: string;
  item: ItemRef;
  branchId: string;
  locationId: string;
  locationName: string;
  onHand: number;
  avgCost: number;
  value: number;
  reorderPoint: number | null;
  reorderQty: number | null;
  bin: string | null;
  isLow: boolean;
  isNegative: boolean;
}

export interface StockSummary {
  lines: number;
  /** Pesos: summed exactly, rounded once by the API. */
  value: number;
  low: number;
  negative: number;
}

export interface StockMoveRow {
  id: string;
  item: ItemRef;
  branchId: string;
  locationId: string;
  moveType: MoveType;
  /** Signed. */
  quantity: number;
  unitCost: number;
  value: number;
  sourceType: MoveSource;
  sourceId: string | null;
  sourceReference: string | null;
  sourceDocumentId: string | null;
  occurredAt: string;
  actorName: string;
  reason: string | null;
  negative: boolean;
}

export interface StockAlert {
  id: string;
  severity: "critical" | "warning";
  item: ItemRef;
  branchId: string;
  locationId: string;
  locationName: string;
  onHand: number;
  reorderPoint: number;
  message: string;
}

export type ReorderReason = "stockout" | "below_reorder_point" | "forecast_shortfall" | "ok";

export interface ReorderRow {
  item: ItemRef & {
    purchaseUom: string;
    purchaseUomFactor: number;
    preferredVendorId: string | null;
    preferredVendorName: string | null;
  };
  branchId: string;
  onHand: number;
  onOrder: number;
  forecastShortfall: number;
  reorderPoint: number | null;
  reorderQty: number | null;
  projected: number;
  reason: ReorderReason;
  needsOrder: boolean;
  suggestedStockQuantity: number;
  suggestedPurchaseQuantity: number;
  /** Pesos per stock unit: the store's average cost, a hint for the order. */
  lastUnitCost: number | null;
}

export type ShopOrderStatus = "draft" | "issued" | "partially_received" | "received" | "cancelled";

export interface ShopOrderLine {
  id: string;
  item: ItemRef | null;
  description: string;
  purchaseUom: string | null;
  purchaseUomFactor: number;
  /** In the purchase unit. */
  quantity: number;
  /** Pesos per purchase unit. */
  unitCost: number;
  lineTotal: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  workOrderLineId: string | null;
}

export interface ShopOrder {
  id: string;
  reference: string;
  branchId: string;
  vendorId: string;
  vendorName: string;
  status: ShopOrderStatus;
  notes: string;
  createdOn: string;
  expectedOn: string | null;
  createdByName: string;
  total: number;
  issuedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  canEdit: boolean;
  canIssue: boolean;
  canReceive: boolean;
  canCancel: boolean;
  lines: ShopOrderLine[];
  receipts: { id: string; reference: string; status: "posted" | "voided"; receivedOn: string; total: number }[];
  history: { id: string; status: string; at: string; actorName: string; note: string | null }[];
}

export interface GoodsReceiptLine {
  id: string;
  shopPurchaseOrderLineId: string;
  item: ItemRef | null;
  description: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  stockQuantity: number;
  stockUnitCost: number;
}

export interface GoodsReceipt {
  id: string;
  reference: string;
  branchId: string;
  shopPurchaseOrderId: string;
  orderReference: string;
  vendorName: string;
  status: "posted" | "voided";
  receivedOn: string;
  supplierRef: string | null;
  notes: string;
  total: number;
  receivedByName: string;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  canVoid: boolean;
  lines: GoodsReceiptLine[];
}

export interface StockCountLine {
  id: string;
  item: ItemRef;
  expectedQuantity: number;
  countedQuantity: number | null;
  varianceQuantity: number | null;
  unitCost: number | null;
  varianceValue: number | null;
  reason: string | null;
}

export interface StockCount {
  id: string;
  reference: string;
  branchId: string;
  locationId: string;
  status: "open" | "posted" | "cancelled";
  reason: string | null;
  notes: string;
  createdOn: string;
  createdByName: string;
  postedAt: string | null;
  canEdit: boolean;
  summary: { lines: number; countedLines: number; varianceLines: number; netVarianceValue: number };
  lines: StockCountLine[];
}

export interface StockTransferLine {
  id: string;
  item: ItemRef;
  quantity: number;
  unitCost: number;
  value: number;
}

export interface StockTransfer {
  id: string;
  reference: string;
  fromBranchId: string;
  fromLocationId: string;
  toBranchId: string;
  toLocationId: string;
  reversesTransferId: string | null;
  reversedByTransferId: string | null;
  canReverse: boolean;
  notes: string;
  transferredOn: string;
  createdByName: string;
  totalValue: number;
  lines: StockTransferLine[];
}
