"use client";

import * as React from "react";
import { Ban, PackageOpen, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DeniedAction } from "@/components/auth/denied-action";
import { useBranchName } from "@/components/inventory/branch-field";
import { ShopOrderStatusBadge } from "@/components/inventory/inventory-chrome";
import { ReasonDialog } from "@/components/inventory/reason-dialog";
import { ReceiveGoodsDialog } from "@/components/inventory/receive-goods-dialog";
import { ShopOrderDialog } from "@/components/inventory/shop-order-dialog";
import { useGoodsReceiptPage, useInventoryActions, useShopOrderPage } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";
import { formatDate, formatPesos, formatQuantity } from "@/lib/utils";
import type { ShopOrder } from "@/types/inventory";

const STATUS_FILTERS = [
  { value: "open", label: "Open (issued or part-received)" },
  { value: "draft", label: "Drafts" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "Every order" },
];

function OrderCard({ order }: { order: ShopOrder }) {
  const { issueShopOrder, cancelShopOrder } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const branchName = useBranchName();
  const [error, setError] = React.useState<string | null>(null);
  const manage = canAsStaff("inventory:manage");

  return (
    <section className="card-raised" aria-label={order.reference}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="tabular">{order.reference}</span>
            <ShopOrderStatusBadge status={order.status} />
          </p>
          <p className="text-2xs text-subtle-foreground">
            {order.vendorName} · for {branchName(order.branchId)} · raised {formatDate(order.createdOn)} by {order.createdByName}
            {order.expectedOn ? ` · expected ${formatDate(order.expectedOn)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="tabular mr-2 text-sm font-semibold">{formatPesos(order.total)}</span>
          {order.canReceive ? <ReceiveGoodsDialog order={order} /> : null}
          {order.canIssue ? (
            manage ? (
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  setError(null);
                  const result = await issueShopOrder(order.id);
                  if (!result.ok) setError(result.error);
                }}
              >
                <Send />
                Issue
              </Button>
            ) : (
              <DeniedAction reason={staffReason("inventory:manage")}>
                <Button variant="primary" size="sm">
                  <Send />
                  Issue
                </Button>
              </DeniedAction>
            )
          ) : null}
          {order.canEdit ? <ShopOrderDialog order={order} /> : null}
          {order.canCancel ? (
            manage ? (
              <ReasonDialog
                trigger={
                  <Button variant="ghost" size="sm" aria-label={`Cancel ${order.reference}`}>
                    <Ban className="text-critical" />
                  </Button>
                }
                title={`Cancel ${order.reference}`}
                description="The order stays on record as cancelled, with this reason. Nothing has been received against it."
                confirmLabel="Cancel the order"
                onConfirm={(reason) => cancelShopOrder(order.id, reason)}
              />
            ) : (
              <DeniedAction reason={staffReason("inventory:manage")}>
                <Button variant="ghost" size="sm" aria-label={`Cancel ${order.reference}`}>
                  <Ban />
                </Button>
              </DeniedAction>
            )
          ) : null}
        </div>
      </header>

      {error ? (
        <p role="alert" className="border-b border-border px-5 py-2 text-xs text-critical">
          {error}
        </p>
      ) : null}

      <table className="w-full text-left text-xs">
        <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
          <tr>
            <th className="px-5 py-2 font-medium">Line</th>
            <th className="px-3 py-2 text-right font-medium">Ordered</th>
            <th className="px-3 py-2 text-right font-medium">Received</th>
            <th className="px-3 py-2 text-right font-medium">Outstanding</th>
            <th className="px-3 py-2 text-right font-medium">Unit cost</th>
            <th className="px-5 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {order.lines.map((line) => {
            const unit = line.purchaseUom ?? line.item?.uom ?? "";
            return (
              <tr key={line.id}>
                <td className="px-5 py-2">
                  {line.description}
                  {line.item ? <span className="tabular ml-2 text-2xs text-subtle-foreground">{line.item.sku}</span> : <Badge tone="outline" className="ml-2">For a job</Badge>}
                </td>
                <td className="tabular px-3 py-2 text-right">
                  {formatQuantity(line.quantity)} {unit}
                </td>
                <td className="tabular px-3 py-2 text-right">{formatQuantity(line.receivedQuantity)}</td>
                <td className="tabular px-3 py-2 text-right">{formatQuantity(line.outstandingQuantity)}</td>
                <td className="tabular px-3 py-2 text-right">{formatPesos(line.unitCost)}</td>
                <td className="tabular px-5 py-2 text-right">{formatPesos(line.lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {order.cancellationReason ? <p className="border-t border-border px-5 py-2 text-2xs text-subtle-foreground">Cancelled: {order.cancellationReason}</p> : null}
    </section>
  );
}

/**
 * Receive PO: the shop's purchase orders and the goods receipts against them.
 * An order's status (issued, partly received, received) follows from what the
 * receipts took in; a receipt that was a mistake is voided, never edited.
 */
export default function PurchasingPage() {
  const [status, setStatus] = React.useState("open");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const { data, error, isSuccess, refetch } = useShopOrderPage({ page, per_page: pageSize, ...(status !== "all" ? { status } : {}) });
  const receipts = useGoodsReceiptPage({ per_page: 10 });
  const { voidReceipt } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();

  React.useEffect(() => setPage(1), [status, pageSize]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader
        title="Receive PO"
        description="Purchase orders the shop has placed, and the goods that have come in against them. Receive in part or in full; stock and cost update with each receipt."
        actions={<ShopOrderDialog />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={PackageOpen} title="No purchase orders here" description="Raise one for a vendor, or switch the filter." action={<ShopOrderDialog />} />
        </div>
      ) : (
        <div className="space-y-4">
          {data.data.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
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

      <h2 className="mb-3 mt-10 text-sm font-semibold">Goods receipts</h2>
      {!receipts.isSuccess ? (
        <Skeleton className="h-32" />
      ) : receipts.data.data.length === 0 ? (
        <div className="card px-5 py-6 text-xs text-muted-foreground">Nothing has been received yet.</div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Receipt</th>
                <th className="px-3 py-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Vendor</th>
                <th className="px-3 py-3 font-medium">Received</th>
                <th className="px-3 py-3 text-right font-medium">Value</th>
                <th className="px-5 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {receipts.data.data.map((receipt) => (
                <tr key={receipt.id}>
                  <td className="px-5 py-3">
                    <span className="tabular font-medium">{receipt.reference}</span>
                    {receipt.status === "voided" ? (
                      <Badge tone="critical" className="ml-2">
                        Void
                      </Badge>
                    ) : null}
                    {receipt.supplierRef ? <p className="text-2xs text-subtle-foreground">{receipt.supplierRef}</p> : null}
                    {receipt.voidReason ? <p className="text-2xs text-subtle-foreground">Void: {receipt.voidReason}</p> : null}
                  </td>
                  <td className="tabular px-3 py-3">{receipt.orderReference}</td>
                  <td className="px-3 py-3 text-muted-foreground">{receipt.vendorName}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {formatDate(receipt.receivedOn)} · {receipt.receivedByName}
                  </td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(receipt.total)}</td>
                  <td className="px-5 py-3 text-right">
                    {receipt.canVoid ? (
                      canAsStaff("inventory:manage") ? (
                        <ReasonDialog
                          trigger={
                            <Button variant="ghost" size="sm">
                              Void
                            </Button>
                          }
                          title={`Void ${receipt.reference}`}
                          description="The receipt stays on record, marked void, and every stock move it made is reversed. The order returns to what is still outstanding."
                          confirmLabel="Void receipt"
                          onConfirm={(reason) => voidReceipt(receipt.id, reason)}
                        />
                      ) : (
                        <DeniedAction reason={staffReason("inventory:manage")}>
                          <Button variant="ghost" size="sm">
                            Void
                          </Button>
                        </DeniedAction>
                      )
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
