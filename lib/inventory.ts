"use client";

import { useCallback, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiAll, apiData, apiPage, newIdempotencyKey, type Page } from "@/lib/api/client";
import { useSelectedBranch } from "@/lib/api/branch";
import { INVENTORY_ROOTS } from "@/lib/api/inventory-keys";
import {
  toGoodsReceipt,
  toItem,
  toReorderRow,
  toShopOrder,
  toStockAlert,
  toStockCount,
  toStockLocation,
  toStockMove,
  toStockRow,
  toStockSummary,
  toStockTransfer,
  type RawGoodsReceipt,
  type RawItem,
  type RawReorderRow,
  type RawShopOrder,
  type RawStockAlert,
  type RawStockCount,
  type RawStockLocation,
  type RawStockMove,
  type RawStockRow,
  type RawStockSummary,
  type RawStockTransfer,
} from "@/lib/api/inventory";
import { useSession } from "@/lib/auth";
import { pesosToCents } from "@/lib/mappers";
import { run, useApiQuery, type Params } from "@/lib/store";
import type {
  GoodsReceipt,
  Item,
  NegativeStockPolicy,
  ReorderRow,
  ShopOrder,
  StockAlert,
  StockCount,
  StockLocation,
  StockMoveRow,
  StockRow,
  StockSummary,
  StockTransfer,
} from "@/types/inventory";

/**
 * The shop's inventory data layer, in the same shape as `lib/store.ts`: one
 * hook per resource or screen endpoint (keyed by the user and the selected
 * branch, so switching either refetches), and `useInventoryActions()` for the
 * writes, which resolve to `{ ok }` or the API's error and refetch what they
 * changed. Nothing is optimistic, and nothing here computes a stock figure:
 * on hand, value, status and suggestions are the API's.
 */

/* ----------------------------------------------------------------- reads */

export interface ItemQuery extends Params {
  page?: number;
  per_page?: number;
  q?: string;
  item_type?: string;
  category?: string;
  is_stocked?: boolean | number;
  include_inactive?: boolean | number;
}

export function useItemPage(params: ItemQuery, options: { enabled?: boolean } = {}) {
  return useApiQuery<Page<Item>>(
    ["inv-items", params],
    async () => {
      const page = await apiPage<RawItem>("/items", { query: params });
      return { ...page, data: page.data.map(toItem) };
    },
    { keepPrevious: true, ...options }
  );
}

/** Every active item, for pickers (bounded by the API's paging; screens that list items page them). */
export function useItemOptions(options: { enabled?: boolean } = {}) {
  const query = useApiQuery<Item[]>(["inv-items", "all"], async () => (await apiAll<RawItem>("/items")).map(toItem), options);
  const items = useMemo(() => query.data ?? [], [query.data]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  return { ...query, items, itemsById };
}

export function useStockLocations(options: { enabled?: boolean } = {}) {
  const query = useApiQuery<StockLocation[]>(
    ["inv-locations"],
    async () => (await apiAll<RawStockLocation>("/stock-locations")).map(toStockLocation),
    options
  );
  const locations = useMemo(() => query.data ?? [], [query.data]);
  const locationName = useCallback((id: string | null | undefined) => locations.find((l) => l.id === id)?.name ?? "—", [locations]);
  return { ...query, locations, locationName };
}

export interface OnHandQuery extends Params {
  page?: number;
  per_page?: number;
  branch_id?: string;
  location_id?: string;
  q?: string;
  item_type?: string;
  hide_zero?: boolean | number;
  low?: boolean | number;
}

export function useOnHand(params: OnHandQuery) {
  return useApiQuery<{ page: Page<StockRow>; summary: StockSummary }>(
    ["inv-on-hand", params],
    async () => {
      const body = await api<Page<RawStockRow> & { summary: RawStockSummary }>("/stock/on-hand", { query: params });
      return { page: { ...body, data: body.data.map(toStockRow) }, summary: toStockSummary(body.summary) };
    },
    { keepPrevious: true }
  );
}

export interface MovesQuery extends Params {
  branch_id?: string;
  location_id?: string;
  item_id?: string;
  move_type?: string;
  source_type?: string;
  from?: string;
  to?: string;
}

/** The movement ledger, newest first, a cursor at a time ("Load more"). */
export function useStockMoves(params: MovesQuery) {
  const branch = useSelectedBranch();
  const { session } = useSession();
  const query = useInfiniteQuery({
    queryKey: ["inv-moves", params, { branch, user: session?.uid ?? null }],
    enabled: Boolean(session),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const body = await api<{ data: RawStockMove[]; meta: { per_page: number; next_cursor: string | null } }>("/stock/moves", {
        query: { ...params, per_page: 50, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return { moves: body.data.map(toStockMove), next: body.meta.next_cursor };
    },
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const moves: StockMoveRow[] = useMemo(() => query.data?.pages.flatMap((p) => p.moves) ?? [], [query.data]);
  return { ...query, moves };
}

export function useStockAlerts(params: { branch_id?: string } = {}) {
  const query = useApiQuery<{ alerts: StockAlert[]; total: number; critical: number }>(["inv-alerts", params], async () => {
    const body = await api<{ data: RawStockAlert[]; meta: { total: number; critical: number } }>("/stock/alerts", { query: params });
    return { alerts: body.data.map(toStockAlert), total: body.meta.total, critical: body.meta.critical };
  });
  return { ...query, alerts: query.data?.alerts ?? [], critical: query.data?.critical ?? 0 };
}

export interface ReorderQuery extends Params {
  branch_id?: string;
  horizon_weeks?: number;
  all?: boolean | number;
}

export function useReorder(params: ReorderQuery) {
  const query = useApiQuery<{ rows: ReorderRow[]; needingOrder: number }>(["inv-reorder", params], async () => {
    const body = await api<{ data: RawReorderRow[]; meta: { total: number; needing_order: number } }>("/stock/reorder", { query: params });
    return { rows: body.data.map(toReorderRow), needingOrder: body.meta.needing_order };
  });
  return { ...query, rows: query.data?.rows ?? [], needingOrder: query.data?.needingOrder ?? 0 };
}

export interface ShopOrderQuery extends Params {
  page?: number;
  per_page?: number;
  branch_id?: string;
  vendor_id?: string;
  status?: string;
  q?: string;
}

export function useShopOrderPage(params: ShopOrderQuery) {
  return useApiQuery<Page<ShopOrder>>(
    ["inv-orders", params],
    async () => {
      const page = await apiPage<RawShopOrder>("/shop-purchase-orders", { query: params });
      return { ...page, data: page.data.map(toShopOrder) };
    },
    { keepPrevious: true }
  );
}

export function useShopOrder(id: string | undefined) {
  return useApiQuery<ShopOrder>(["inv-order", id], async () => toShopOrder(await apiData<RawShopOrder>(`/shop-purchase-orders/${id}`)), {
    enabled: Boolean(id),
  });
}

export function useGoodsReceiptPage(params: { page?: number; per_page?: number; branch_id?: string; shop_purchase_order_id?: string; status?: string }) {
  return useApiQuery<Page<GoodsReceipt>>(
    ["inv-receipts", params],
    async () => {
      const page = await apiPage<RawGoodsReceipt>("/goods-receipts", { query: params });
      return { ...page, data: page.data.map(toGoodsReceipt) };
    },
    { keepPrevious: true }
  );
}

export function useStockCountPage(params: { page?: number; per_page?: number; branch_id?: string; status?: string }) {
  return useApiQuery<Page<StockCount>>(
    ["inv-counts", params],
    async () => {
      const page = await apiPage<RawStockCount>("/stock-counts", { query: params });
      return { ...page, data: page.data.map(toStockCount) };
    },
    { keepPrevious: true }
  );
}

export function useStockTransferPage(params: { page?: number; per_page?: number; branch_id?: string }) {
  return useApiQuery<Page<StockTransfer>>(
    ["inv-transfers", params],
    async () => {
      const page = await apiPage<RawStockTransfer>("/stock-transfers", { query: params });
      return { ...page, data: page.data.map(toStockTransfer) };
    },
    { keepPrevious: true }
  );
}

/** Each branch the caller may see with what it does when a move would take stock below zero. */
export function useBranchStockPolicies() {
  const query = useApiQuery<{ id: string; name: string; policy: NegativeStockPolicy }[]>(["inv-branches"], async () =>
    (await apiAll<{ id: string; name: string; negative_stock_policy: string }>("/branches")).map((b) => ({
      id: b.id,
      name: b.name,
      policy: b.negative_stock_policy as NegativeStockPolicy,
    }))
  );
  return { ...query, branches: query.data ?? [] };
}

/* ---------------------------------------------------------------- writes */

export interface ItemDraft {
  sku: string;
  barcode: string;
  name: string;
  itemType: string;
  category: string;
  uom: string;
  purchaseUom: string;
  purchaseUomFactor: number;
  taxClass: string;
  /** Pesos, as typed. */
  defaultPrice: number;
  isStocked: boolean;
  isActive: boolean;
  preferredVendorId: string | null;
}

function itemToApi(draft: Partial<ItemDraft>) {
  const body: Record<string, unknown> = {};
  if (draft.sku !== undefined) body.sku = draft.sku.trim();
  if (draft.barcode !== undefined) body.barcode = draft.barcode.trim() === "" ? null : draft.barcode.trim();
  if (draft.name !== undefined) body.name = draft.name.trim();
  if (draft.itemType !== undefined) body.item_type = draft.itemType;
  if (draft.category !== undefined) body.category = draft.category.trim();
  if (draft.uom !== undefined) body.uom = draft.uom.trim();
  if (draft.purchaseUom !== undefined) {
    // An empty purchase unit means "bought as it is kept": the API pins the factor to 1.
    body.purchase_uom = draft.purchaseUom.trim() === "" ? null : draft.purchaseUom.trim();
    if (draft.purchaseUom.trim() !== "" && draft.purchaseUomFactor !== undefined) body.purchase_uom_factor = draft.purchaseUomFactor;
  }
  if (draft.taxClass !== undefined) body.tax_class = draft.taxClass;
  if (draft.defaultPrice !== undefined) body.default_price_cents = pesosToCents(draft.defaultPrice);
  if (draft.isStocked !== undefined) body.is_stocked = draft.isStocked;
  if (draft.isActive !== undefined) body.is_active = draft.isActive;
  if (draft.preferredVendorId !== undefined) body.preferred_vendor_id = draft.preferredVendorId;
  return body;
}

export interface BranchSettingsDraft {
  reorderPoint?: number | null;
  reorderQty?: number | null;
  bin?: string | null;
  /** Pesos; null clears the override. */
  priceOverride?: number | null;
}

export interface ShopOrderLineDraft {
  itemId?: string | null;
  description?: string;
  /** In the purchase unit. */
  quantity: number;
  /** Pesos per purchase unit. */
  unitCost: number;
  workOrderLineId?: string | null;
}

export interface ShopOrderDraft {
  branchId?: string;
  vendorId: string;
  notes?: string;
  expectedOn?: string | null;
  lines: ShopOrderLineDraft[];
}

function shopOrderToApi(draft: ShopOrderDraft) {
  return {
    ...(draft.branchId ? { branch_id: draft.branchId } : {}),
    vendor_id: draft.vendorId,
    notes: draft.notes ?? "",
    expected_on: draft.expectedOn || null,
    lines: draft.lines.map((line) => ({
      ...(line.itemId ? { item_id: line.itemId } : {}),
      ...(line.workOrderLineId ? { work_order_line_id: line.workOrderLineId } : {}),
      ...(line.description ? { description: line.description } : {}),
      quantity: line.quantity,
      unit_cost_cents: pesosToCents(line.unitCost),
    })),
  };
}

export interface ReceiptDraft {
  supplierRef?: string;
  notes?: string;
  lines: { orderLineId: string; quantity: number; /** Pesos per purchase unit, when the invoice differs from the order. */ unitCost?: number }[];
}

export interface CountLineEntry {
  itemId: string;
  /** null un-counts the line. */
  countedQuantity: number | null;
  reason?: string | null;
}

export function useInventoryActions() {
  const queryClient = useQueryClient();

  const refresh = useCallback(
    () =>
      queryClient.invalidateQueries({
        predicate: (query) => {
          const root = query.queryKey[0];
          // A stock write also moves what a job's cost shows.
          return typeof root === "string" && ((INVENTORY_ROOTS as readonly string[]).includes(root) || root === "work-order" || root === "work-orders");
        },
      }),
    [queryClient]
  );

  const write = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      const result = await run(fn);
      if (result.ok) await refresh();
      return result;
    },
    [refresh]
  );

  return useMemo(
    () => ({
      /* ------------------------------------------------------------ items */
      createItem: (draft: ItemDraft) =>
        write(async () => toItem(await apiData<RawItem>("/items", { method: "POST", idempotencyKey: newIdempotencyKey(), body: itemToApi(draft) }))),
      updateItem: (id: string, draft: Partial<ItemDraft>) =>
        write(async () => toItem(await apiData<RawItem>(`/items/${id}`, { method: "PATCH", body: itemToApi(draft) }))),
      setBranchSettings: (itemId: string, branchId: string, settings: BranchSettingsDraft) =>
        write(async () =>
          toItem(
            await apiData<RawItem>(`/items/${itemId}/branch-settings/${branchId}`, {
              method: "PUT",
              body: {
                ...(settings.reorderPoint !== undefined ? { reorder_point: settings.reorderPoint } : {}),
                ...(settings.reorderQty !== undefined ? { reorder_qty: settings.reorderQty } : {}),
                ...(settings.bin !== undefined ? { bin: settings.bin } : {}),
                ...(settings.priceOverride !== undefined ? { price_override_cents: settings.priceOverride === null ? null : pesosToCents(settings.priceOverride) } : {}),
              },
            })
          )
        ),
      recordOpening: (locationId: string, lines: { itemId: string; quantity: number; /** Pesos per stock unit. */ unitCost: number }[], reason?: string) =>
        write(async () =>
          (
            await apiData<RawStockMove[]>("/stock/opening", {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                location_id: locationId,
                ...(reason ? { reason } : {}),
                lines: lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit_cost_cents: pesosToCents(l.unitCost) })),
              },
            })
          ).map(toStockMove)
        ),

      /* -------------------------------------------------- purchase orders */
      createShopOrder: (draft: ShopOrderDraft) =>
        write(async () =>
          toShopOrder(await apiData<RawShopOrder>("/shop-purchase-orders", { method: "POST", idempotencyKey: newIdempotencyKey(), body: shopOrderToApi(draft) }))
        ),
      updateShopOrder: (id: string, draft: ShopOrderDraft) =>
        write(async () => toShopOrder(await apiData<RawShopOrder>(`/shop-purchase-orders/${id}`, { method: "PATCH", body: shopOrderToApi(draft) }))),
      issueShopOrder: (id: string) =>
        write(async () => toShopOrder(await apiData<RawShopOrder>(`/shop-purchase-orders/${id}/issue`, { method: "POST" }))),
      cancelShopOrder: (id: string, reason: string) =>
        write(async () => toShopOrder(await apiData<RawShopOrder>(`/shop-purchase-orders/${id}/cancel`, { method: "POST", body: { reason } }))),
      receiveGoods: (orderId: string, draft: ReceiptDraft) =>
        write(async () =>
          toGoodsReceipt(
            await apiData<RawGoodsReceipt>(`/shop-purchase-orders/${orderId}/receipts`, {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                ...(draft.supplierRef ? { supplier_ref: draft.supplierRef } : {}),
                ...(draft.notes ? { notes: draft.notes } : {}),
                lines: draft.lines.map((l) => ({
                  shop_purchase_order_line_id: l.orderLineId,
                  quantity: l.quantity,
                  ...(l.unitCost !== undefined ? { unit_cost_cents: pesosToCents(l.unitCost) } : {}),
                })),
              },
            })
          )
        ),
      voidReceipt: (id: string, reason: string) =>
        write(async () => toGoodsReceipt(await apiData<RawGoodsReceipt>(`/goods-receipts/${id}/void`, { method: "POST", body: { reason } }))),

      /* ------------------------------------------------------------ counts */
      openCount: (draft: { locationId: string; itemIds?: string[]; reason?: string; notes?: string }) =>
        write(async () =>
          toStockCount(
            await apiData<RawStockCount>("/stock-counts", {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                location_id: draft.locationId,
                ...(draft.itemIds?.length ? { item_ids: draft.itemIds } : {}),
                ...(draft.reason ? { reason: draft.reason } : {}),
                ...(draft.notes ? { notes: draft.notes } : {}),
              },
            })
          )
        ),
      enterCount: (id: string, lines: CountLineEntry[]) =>
        write(async () =>
          toStockCount(
            await apiData<RawStockCount>(`/stock-counts/${id}/lines`, {
              method: "PUT",
              body: {
                lines: lines.map((l) => ({
                  item_id: l.itemId,
                  counted_quantity: l.countedQuantity,
                  ...(l.reason !== undefined ? { reason: l.reason } : {}),
                })),
              },
            })
          )
        ),
      postCount: (id: string) => write(async () => toStockCount(await apiData<RawStockCount>(`/stock-counts/${id}/post`, { method: "POST" }))),
      cancelCount: (id: string) => write(async () => toStockCount(await apiData<RawStockCount>(`/stock-counts/${id}/cancel`, { method: "POST" }))),

      /* --------------------------------------------------------- transfers */
      transferStock: (draft: { fromLocationId: string; toLocationId: string; notes?: string; lines: { itemId: string; quantity: number }[] }) =>
        write(async () =>
          toStockTransfer(
            await apiData<RawStockTransfer>("/stock-transfers", {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                from_location_id: draft.fromLocationId,
                to_location_id: draft.toLocationId,
                ...(draft.notes ? { notes: draft.notes } : {}),
                lines: draft.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
              },
            })
          )
        ),
      reverseTransfer: (id: string) =>
        write(async () => toStockTransfer(await apiData<RawStockTransfer>(`/stock-transfers/${id}/reverse`, { method: "POST" }))),

      /* ---------------------------------------------------------- branches */
      setNegativeStockPolicy: (branchId: string, policy: NegativeStockPolicy) =>
        write(async () => {
          await apiData(`/branches/${branchId}`, { method: "PATCH", body: { negative_stock_policy: policy } });
        }),
    }),
    [write]
  );
}
