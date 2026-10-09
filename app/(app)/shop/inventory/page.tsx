"use client";

import * as React from "react";
import { Boxes, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BranchSettingsDialog } from "@/components/inventory/branch-settings-dialog";
import { ITEM_TYPE_LABEL, ItemFormDialog } from "@/components/inventory/item-form-dialog";
import { useSelectedBranch } from "@/lib/api/branch";
import { useItemPage } from "@/lib/inventory";
import { formatPesos, formatQuantity } from "@/lib/utils";
import type { Item, ItemType } from "@/types/inventory";

const ALL = "__all__";

/**
 * The shop's items: parts, consumables, retail goods, ingredients and fees.
 * Master data is organization-wide; what is on hand and each branch's reorder
 * point and price are the API's, for the branch picked in the switcher (or
 * summed across the branches the user works in).
 */
export default function ItemsPage() {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<string>(ALL);
  const [showInactive, setShowInactive] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const selected = useSelectedBranch();

  const { data, error, isSuccess, refetch } = useItemPage({
    page,
    per_page: pageSize,
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(type !== ALL ? { item_type: type } : {}),
    ...(showInactive ? { include_inactive: 1 } : {}),
  });

  React.useEffect(() => setPage(1), [q, type, showInactive, pageSize]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  /** The figures shown: the selected branch's, else the API's totals over the branches the user works in. */
  const figures = (item: Item) => {
    const here = selected && selected !== "all" ? item.branches.find((branch) => branch.branchId === selected) : undefined;
    return here ? { onHand: here.onHand, value: here.value } : { onHand: item.totalOnHand, value: item.totalValue };
  };

  return (
    <>
      <PageHeader
        title="Items"
        description="Everything the shop keeps, uses and sells. Stock only ever changes through receipts, jobs, counts and transfers; set up what an item is here."
        actions={<ItemFormDialog />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input aria-label="Search items" value={q} placeholder="Search SKU, name or barcode" className="pl-9" onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Item type" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every type</SelectItem>
            {(Object.entries(ITEM_TYPE_LABEL) as [ItemType, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Boxes}
            title="No items yet"
            description={q || type !== ALL ? "Nothing matches that search." : "Add the parts and supplies the shop keeps on the shelf."}
            action={q || type !== ALL ? undefined : <ItemFormDialog />}
          />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Item</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 text-right font-medium">Price</th>
                <th className="px-3 py-3 text-right font-medium">On hand</th>
                <th className="px-3 py-3 text-right font-medium">Value</th>
                <th className="px-3 py-3 font-medium">Vendor</th>
                <th className="px-5 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map((item) => {
                const f = figures(item);
                const here = item.branches.find((branch) => branch.branchId === selected);
                return (
                  <tr key={item.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="tabular text-2xs text-subtle-foreground">
                        {item.sku}
                        {item.purchaseUom ? ` · bought by the ${item.purchaseUom} of ${formatQuantity(item.purchaseUomFactor)}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge tone="outline">{ITEM_TYPE_LABEL[item.itemType]}</Badge>
                        {!item.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                        {!item.isStocked ? <Badge tone="neutral">Not stocked</Badge> : null}
                      </span>
                    </td>
                    <td className="tabular px-3 py-3 text-right">{formatPesos(here?.effectivePrice ?? item.defaultPrice)}</td>
                    <td className="tabular px-3 py-3 text-right">
                      {item.isStocked ? (
                        <span>
                          {formatQuantity(f.onHand)} {item.uom}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tabular px-3 py-3 text-right">{item.isStocked ? formatPesos(f.value) : "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{item.preferredVendorName ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <BranchSettingsDialog item={item} />
                        <ItemFormDialog item={item} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {isSuccess ? (
        <Pagination
          page={data.meta.page}
          pageCount={Math.max(1, Math.ceil(data.meta.total / data.meta.per_page))}
          pageSize={data.meta.per_page}
          totalItems={data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </>
  );
}
