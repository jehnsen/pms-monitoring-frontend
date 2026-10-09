import type { PartsSource } from "@/types";

/** What each source is called, and what it does to the bill and the shelf. */
export const PARTS_SOURCE_LABEL: Record<PartsSource, string> = {
  own_stock: "Own stock",
  supplier_provided: "Supplier provided",
  customer_supplied: "Customer supplied",
  shop_stock: "Shop stock",
  purchased_for_job: "Bought for this job",
};

export const PARTS_SOURCE_HINT: Record<PartsSource, string> = {
  own_stock: "Charged, no markup, no stock move (the original value).",
  supplier_provided: "Charged, earns the shop's markup, no stock move (the original value).",
  customer_supplied: "The customer brings the part: no stock move and no part charge.",
  shop_stock: "Issued from this branch's store when the work is recorded; charged at the item's price.",
  purchased_for_job: "Bought on a purchase order for this job; charged, never goes on the shelf.",
};

/** The sources offered for a new line. */
export const NEW_LINE_SOURCES: PartsSource[] = ["shop_stock", "purchased_for_job", "customer_supplied"];

/** The two Phase 3 values: still valid on an existing line, no longer offered for new ones. */
export function isLegacySource(source: PartsSource): boolean {
  return source === "own_stock" || source === "supplier_provided";
}

/** The choices for a line currently set to `current`: the new ones, plus a legacy value it already has. */
export function sourceChoices(current: PartsSource): PartsSource[] {
  return isLegacySource(current) ? [current, ...NEW_LINE_SOURCES] : NEW_LINE_SOURCES;
}

/** Defaults for new lines may be any source that needs no particular item. */
export const DEFAULT_SOURCE_CHOICES: PartsSource[] = ["supplier_provided", "own_stock", "purchased_for_job", "customer_supplied"];
