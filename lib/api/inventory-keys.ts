/**
 * The query-key roots of the inventory hooks (`lib/inventory.ts`). Kept apart
 * so a write elsewhere (closing a work order issues stock) can refresh them
 * without the two modules importing each other.
 */
export const INVENTORY_ROOTS = [
  "inv-items",
  "inv-item",
  "inv-locations",
  "inv-on-hand",
  "inv-moves",
  "inv-alerts",
  "inv-reorder",
  "inv-orders",
  "inv-order",
  "inv-receipts",
  "inv-counts",
  "inv-count",
  "inv-transfers",
  "inv-branches",
] as const;
