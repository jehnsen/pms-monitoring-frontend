"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ITEM_TYPE_LABEL } from "@/components/inventory/item-form-dialog";
import { NegativeStockSetting } from "@/components/inventory/negative-stock-setting";
import { OpeningStockDialog } from "@/components/inventory/opening-stock-dialog";
import { useOnHand, useStockAlerts } from "@/lib/inventory";
import { formatPesos, formatQuantity } from "@/lib/utils";
import type { ItemType } from "@/types/inventory";

const ALL = "__all__";

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "critical" | "warning" }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-2xs uppercase tracking-wide text-subtle-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "critical" ? "text-critical" : ""}`}>{value}</p>
      {note ? <p className="mt-0.5 text-2xs text-subtle-foreground">{note}</p> : null}
    </div>
  );
}

/**
 * Stock on hand: every item in every location of the branch picked in the
 * switcher (or all the user's branches), with what it is worth. Quantity,
 * average cost, value, "low" and "negative" are the API's; so are the totals
 * above the table, which cover the whole filtered set, not just this page.
 */
export default function StockOnHandPage() {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState(ALL);
  const [lowOnly, setLowOnly] = React.useState(false);
  const [hideZero, setHideZero] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const { data, error, isSuccess, refetch } = useOnHand({
    page,
    per_page: pageSize,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(type !== ALL ? { item_type: type } : {}),
    ...(lowOnly ? { low: 1 } : {}),
    ...(hideZero ? { hide_zero: 1 } : {}),
  });
  const { alerts, critical } = useStockAlerts();

  React.useEffect(() => setPage(1), [q, type, lowOnly, hideZero, pageSize]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  const summary = data?.summary;
  const rows = data?.page.data ?? [];

  return (
    <>
      <PageHeader
        title="Stock on hand"
        description="What is on the shelf, where, and what it is worth: quantity × the moving average cost, from the ledger."
        actions={
          <>
            <NegativeStockSetting />
            <OpeningStockDialog />
          </>
        }
      />

      {alerts.length > 0 ? (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-xs">
          <AlertTriangle className="size-4 text-warning" />
          <span className="font-medium">
            {alerts.length} {alerts.length === 1 ? "item needs" : "items need"} attention
            {critical > 0 ? ` (${critical} out of stock)` : ""}
          </span>
          <span className="text-muted-foreground">{alerts[0]?.message}</span>
          <Link href="/shop/inventory/reorder" className="ml-auto font-medium text-brand hover:underline">
            See what to reorder
          </Link>
        </div>
      ) : null}

      {summary ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Stock value" value={formatPesos(summary.value)} note="On hand × average cost" />
          <Tile label="Lines" value={String(summary.lines)} note="Items × locations in view" />
          <Tile label="Low" value={String(summary.low)} note="At or under the reorder point" tone={summary.low > 0 ? "critical" : undefined} />
          <Tile label="Negative" value={String(summary.negative)} note="Balances below zero" tone={summary.negative > 0 ? "critical" : undefined} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input aria-label="Search stock" value={q} placeholder="Search SKU, name or barcode" className="pl-9" onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Item type" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every type</SelectItem>
            {(Object.entries(ITEM_TYPE_LABEL) as [ItemType, string][])
              .filter(([value]) => value !== "service_fee")
              .map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Low only
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Hide zero
        </label>
      </div>

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Boxes} title="Nothing on the shelf" description="No stock matches. Receive a purchase order, or record an opening balance to start the ledger." />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Item</th>
                <th className="px-3 py-3 font-medium">Location</th>
                <th className="px-3 py-3 font-medium">Bin</th>
                <th className="px-3 py-3 text-right font-medium">On hand</th>
                <th className="px-3 py-3 text-right font-medium">Reorder at</th>
                <th className="px-3 py-3 text-right font-medium">Avg cost</th>
                <th className="px-5 py-3 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3">
                    <Link href={`/shop/inventory/movements?item=${row.item.id}`} className="font-medium hover:underline">
                      {row.item.name}
                    </Link>
                    <p className="tabular text-2xs text-subtle-foreground">{row.item.sku}</p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{row.locationName}</td>
                  <td className="px-3 py-3 text-muted-foreground">{row.bin ?? "—"}</td>
                  <td className="tabular px-3 py-3 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      {row.isNegative ? (
                        <Badge tone="critical">
                          <AlertTriangle />
                          Negative
                        </Badge>
                      ) : row.isLow ? (
                        <Badge tone="warning">
                          <AlertTriangle />
                          Low
                        </Badge>
                      ) : null}
                      {formatQuantity(row.onHand)} {row.item.uom}
                    </span>
                  </td>
                  <td className="tabular px-3 py-3 text-right text-muted-foreground">{row.reorderPoint === null ? "—" : formatQuantity(row.reorderPoint)}</td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(row.avgCost)}</td>
                  <td className="tabular px-5 py-3 text-right font-medium">{formatPesos(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data ? (
        <Pagination
          page={data.page.meta.page}
          pageCount={Math.max(1, Math.ceil(data.page.meta.total / data.page.meta.per_page))}
          pageSize={data.page.meta.per_page}
          totalItems={data.page.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </>
  );
}
