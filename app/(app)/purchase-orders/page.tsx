"use client";

import { useState } from "react";
import { FileSpreadsheet, Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DeniedAction } from "@/components/auth/denied-action";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PurchaseOrderStatusBadge } from "@/components/status";
import { PurchaseOrderExportMenu } from "@/components/purchase-orders/purchase-order-export-menu";
import { PurchaseOrderPrintDocument } from "@/components/purchase-orders/purchase-order-print";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { exportPurchaseOrdersToExcel, purchaseOrderTotal } from "@/lib/po-export";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";

export default function PurchaseOrdersPage() {
  const { ready, purchaseOrders, tenant } = useFleet();
  const { updatePurchaseOrderStatus } = useFleetActions();
  const { can, reason } = useCan();
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  // The one order currently rendered into `.po-print-root` — see
  // PurchaseOrderExportMenu for why only one may exist at a time.
  const [printing, setPrinting] = useState<PurchaseOrder | null>(null);

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Purchase orders"
          description="Formal POs raised from the demand forecast and from approved work."
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  const orders = [...purchaseOrders].sort((a, b) => b.createdOn.localeCompare(a.createdOn));

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Formal POs raised from the demand forecast and from approved work."
        actions={
          orders.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => void exportPurchaseOrdersToExcel(orders)}
            >
              <FileSpreadsheet />
              Export all to Excel
            </Button>
          ) : undefined
        }
      />

      {orders.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Receipt}
            title="No purchase orders yet"
            description="Generate one from the Demand Forecast page, grouped automatically by preferred vendor."
            className="py-16"
          />
        </div>
      ) : (
        <div className="card-raised">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Reference", "Vendor", "Status", "Lines", "Total", "Created", "", ""].map(
                    (heading, index) => (
                      <th
                        key={heading || index}
                        scope="col"
                        className={`whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground ${
                          heading === "Total" ? "text-right" : ""
                        }`}
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(order)}
                        className="text-xs font-medium transition-colors hover:text-brand"
                      >
                        {order.reference}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {order.vendor}
                    </td>
                    <td className="px-4 py-3">
                      <PurchaseOrderStatusBadge status={order.status} />
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {order.lines.length} {order.lines.length === 1 ? "line" : "lines"}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                      {formatCurrency(purchaseOrderTotal(order))}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(order.createdOn)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      <PurchaseOrderExportMenu order={order} onPrint={setPrinting} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {order.status === "draft" || order.status === "sent" ? (
                        can("po:issue") ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              updatePurchaseOrderStatus(
                                order.id,
                                order.status === "draft" ? "sent" : "received"
                              )
                            }
                          >
                            {order.status === "draft" ? "Mark as sent" : "Mark as received"}
                          </Button>
                        ) : (
                          <DeniedAction reason={reason("po:issue")}>
                            <Button variant="secondary" size="sm">
                              {order.status === "draft" ? "Mark as sent" : "Mark as received"}
                            </Button>
                          </DeniedAction>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(next) => !next && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.reference}</DialogTitle>
            <DialogDescription>
              {viewing?.vendor} — {viewing ? formatCurrency(purchaseOrderTotal(viewing)) : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="divide-y divide-border rounded-md border border-border">
              {viewing?.lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{line.description}</span>
                    <span className="tabular block text-2xs text-subtle-foreground">
                      {line.quantity} × {formatCurrency(line.unitCost)}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-xs font-medium">
                    {formatCurrency(line.quantity * line.unitCost)}
                  </span>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            {viewing ? (
              <PurchaseOrderExportMenu order={viewing} onPrint={setPrinting} />
            ) : null}
            <Button variant="secondary" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Off-screen until a print is requested; see PurchaseOrderExportMenu. */}
      {printing ? <PurchaseOrderPrintDocument order={printing} tenant={tenant} /> : null}
    </>
  );
}
