"use client";

import * as React from "react";
import { ShoppingCart, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranchName } from "@/components/inventory/branch-field";
import { ReorderReasonBadge } from "@/components/inventory/inventory-chrome";
import { ShopOrderDialog } from "@/components/inventory/shop-order-dialog";
import { useReorder } from "@/lib/inventory";
import { formatQuantity } from "@/lib/utils";

const HORIZONS = [2, 4, 6, 8, 12];

/**
 * Reorder: what is on hand, what is already on order, each branch's reorder
 * point, and the fleet forecast's shortfall for the same SKU, read together.
 * The suggestion (in the unit the item is bought in) is the API's.
 */
export default function ReorderPage() {
  const [weeks, setWeeks] = React.useState(6);
  const [showAll, setShowAll] = React.useState(false);
  const { rows, needingOrder, isSuccess, error, refetch } = useReorder({ horizon_weeks: weeks, ...(showAll ? { all: 1 } : {}) });
  const branchName = useBranchName();

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader
        title="Reorder"
        description="What to buy, from what is on the shelf, what is already coming, each branch's reorder point, and the parts the fleet forecast says clients will need."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-4" />
          Forecast horizon
          <Select value={String(weeks)} onValueChange={(value) => setWeeks(Number(value))}>
            <SelectTrigger aria-label="Forecast horizon" className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZONS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show items that are covered
        </label>
        {isSuccess ? (
          <p className="ml-auto text-xs text-muted-foreground">
            <span className="tabular font-medium text-foreground">{needingOrder}</span> {needingOrder === 1 ? "item needs" : "items need"} ordering
          </p>
        ) : null}
      </div>

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={ShoppingCart} title="Nothing to reorder" description="Every item is above its reorder point and covered by what is on order." />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Item</th>
                <th className="px-3 py-3 font-medium">Why</th>
                <th className="px-3 py-3 text-right font-medium">On hand</th>
                <th className="px-3 py-3 text-right font-medium">On order</th>
                <th className="px-3 py-3 text-right font-medium">Forecast</th>
                <th className="px-3 py-3 text-right font-medium">Reorder at</th>
                <th className="px-3 py-3 text-right font-medium">Buy</th>
                <th className="px-5 py-3 text-right font-medium">
                  <span className="sr-only">Order</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={`${row.item.id}:${row.branchId}`}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{row.item.name}</p>
                    <p className="text-2xs text-subtle-foreground">
                      <span className="tabular">{row.item.sku}</span> · {branchName(row.branchId)}
                      {row.item.preferredVendorName ? ` · ${row.item.preferredVendorName}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <ReorderReasonBadge reason={row.reason} />
                  </td>
                  <td className="tabular px-3 py-3 text-right">
                    {formatQuantity(row.onHand)} {row.item.uom}
                  </td>
                  <td className="tabular px-3 py-3 text-right">{formatQuantity(row.onOrder)}</td>
                  <td className="tabular px-3 py-3 text-right" title="Parts the fleet forecast is short of, over the horizon">
                    {row.forecastShortfall > 0 ? formatQuantity(row.forecastShortfall) : "—"}
                  </td>
                  <td className="tabular px-3 py-3 text-right text-muted-foreground">{row.reorderPoint === null ? "—" : formatQuantity(row.reorderPoint)}</td>
                  <td className="tabular px-3 py-3 text-right font-medium">
                    {row.needsOrder ? `${formatQuantity(row.suggestedPurchaseQuantity)} ${row.item.purchaseUom}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.needsOrder ? (
                      <ShopOrderDialog
                        prefill={{
                          branchId: row.branchId,
                          vendorId: row.item.preferredVendorId,
                          lines: [{ itemId: row.item.id, quantity: row.suggestedPurchaseQuantity }],
                        }}
                        trigger={
                          <Button variant="secondary" size="sm" aria-label={`Order ${row.item.name}`}>
                            <ShoppingCart />
                            Order
                          </Button>
                        }
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
