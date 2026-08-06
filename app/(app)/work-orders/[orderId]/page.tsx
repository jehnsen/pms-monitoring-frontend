"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Play,
  Stethoscope,
  Wrench,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  PriorityBadge,
  WORK_ORDER_STATUS_LABEL,
  WorkOrderStatusBadge,
} from "@/components/status";
import { CompleteWorkOrderDialog } from "@/components/work-orders/complete-work-order-dialog";
import { DocumentList } from "@/components/documents/document-list";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { DeniedAction } from "@/components/auth/denied-action";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { resolvePartsCost, workOrderCost } from "@/lib/pms";
import { TASK_BY_ID } from "@/lib/service-tasks";
import { formatCurrency, formatDate, formatKm, titleCase } from "@/lib/utils";

export default function WorkOrderDetailPage({
  params,
}: {
  params: { orderId: string };
}) {
  const { ready, workOrders, vehiclesById, documents } = useFleet();
  const { updateWorkOrder } = useFleetActions();
  const { can, reason } = useCan();
  const [closing, setClosing] = useState(false);

  if (!ready) {
    return (
      <>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-6 h-96" />
      </>
    );
  }

  const order = workOrders.find((entry) => entry.id === params.orderId);

  if (!order) {
    return (
      <div className="card">
        <EmptyState
          icon={ClipboardList}
          title="Work order not found"
          description="It may have been reset with the demo data, or the link is out of date."
          action={
            <Button asChild variant="secondary">
              <Link href="/work-orders">Back to work orders</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const vehicle = vehiclesById.get(order.vehicleId);
  const attached = documents.filter((doc) => doc.workOrderId === order.id);
  const closed = order.status === "completed" || order.status === "cancelled";
  const partsCost = resolvePartsCost(order);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Work orders", href: "/work-orders" },
          { label: order.reference },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{order.reference}</span>
            <WorkOrderStatusBadge status={order.status} size="md" />
          </span>
        }
        description={order.title}
        actions={
          <>
            {!closed && can("workorder:update") && order.status !== "in_progress" ? (
              <Button
                variant="secondary"
                onClick={() => updateWorkOrder(order.id, { status: "in_progress" })}
              >
                <Play />
                Start job
              </Button>
            ) : null}

            {closed ? null : can("workorder:complete") ? (
              <Button variant="primary" onClick={() => setClosing(true)}>
                <CheckCircle2 />
                Close &amp; record service
              </Button>
            ) : (
              <DeniedAction reason={reason("workorder:complete")}>
                <Button variant="primary">
                  <CheckCircle2 />
                  Close &amp; record service
                </Button>
              </DeniedAction>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Findings — the diagnostic half of the record. */}
          <section className="card-raised">
            <header className="flex items-center gap-2 px-5 pb-3 pt-4">
              <Stethoscope className="size-4 text-subtle-foreground" />
              <h3 className="text-sm font-semibold tracking-tight">
                Technician findings
              </h3>
            </header>
            <div className="border-t border-border px-5 py-4">
              {order.findings ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {order.findings}
                </p>
              ) : (
                <p className="text-sm text-subtle-foreground">
                  Not recorded yet — findings are captured when the job is closed.
                </p>
              )}
              {order.notes ? (
                <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-subtle-foreground">
                  <span className="font-medium text-muted-foreground">Notes: </span>
                  {order.notes}
                </p>
              ) : null}
            </div>
          </section>

          {/* Parts replaced. */}
          <section className="card-raised">
            <header className="flex items-center justify-between gap-2 px-5 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <Wrench className="size-4 text-subtle-foreground" />
                <h3 className="text-sm font-semibold tracking-tight">
                  Parts replaced
                </h3>
              </div>
              <span className="tabular text-xs text-muted-foreground">
                {order.parts.length} {order.parts.length === 1 ? "line" : "lines"}
              </span>
            </header>

            {order.parts.length === 0 ? (
              <div className="border-t border-border">
                <EmptyState
                  icon={Wrench}
                  title="No itemised parts"
                  description={
                    closed
                      ? "This record carries an aggregate parts cost only."
                      : "Parts are recorded when the technician closes the job."
                  }
                  className="py-10"
                />
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {["Part", "Part no.", "Qty", "Unit", "Line total"].map(
                        (heading, index) => (
                          <th
                            key={heading}
                            className={`whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground ${
                              index > 1 ? "text-right" : ""
                            }`}
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.parts.map((part) => (
                      <tr key={part.id}>
                        <td className="px-4 py-2.5 text-xs font-medium">
                          {part.name}
                        </td>
                        <td className="tabular px-4 py-2.5 text-xs text-muted-foreground">
                          {part.partNumber || "—"}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs">
                          {part.quantity}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs text-muted-foreground">
                          {formatCurrency(part.unitCost)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs font-medium">
                          {formatCurrency(part.quantity * part.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Attached paperwork. */}
          <section className="card-raised">
            <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-subtle-foreground" />
                <h3 className="text-sm font-semibold tracking-tight">
                  Attached documents
                </h3>
              </div>
              <UploadDocumentDialog
                vehicleId={order.vehicleId}
                workOrderId={order.id}
                size="sm"
              />
            </header>
            <div className="border-t border-border">
              <DocumentList
                documents={attached}
                emptyTitle="Nothing attached"
                emptyDescription="Invoices and service reports filed against this job appear here."
              />
            </div>
          </section>
        </div>

        {/* Summary rail. */}
        <div className="space-y-5">
          <section className="card-raised p-5">
            <h3 className="text-sm font-semibold tracking-tight">Cost</h3>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Parts</dt>
                <dd className="tabular font-medium">{formatCurrency(partsCost)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Labour</dt>
                <dd className="tabular font-medium">
                  {formatCurrency(order.laborCost)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <dt className="font-medium">Total</dt>
                <dd className="tabular text-base font-semibold">
                  {formatCurrency(workOrderCost(order))}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card-raised p-5">
            <h3 className="text-sm font-semibold tracking-tight">Job detail</h3>
            <dl className="mt-4 space-y-3 text-xs">
              <div>
                <dt className="text-subtle-foreground">Vehicle</dt>
                <dd className="mt-0.5">
                  {vehicle ? (
                    <Link
                      href={`/vehicles/${vehicle.id}`}
                      className="font-medium transition-colors hover:text-brand"
                    >
                      {vehicle.plateNumber} · {vehicle.make} {vehicle.model}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Type &amp; priority</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{titleCase(order.type)}</Badge>
                  <PriorityBadge priority={order.priority} />
                </dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Technician</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium">
                  <Avatar name={order.technician} size="sm" />
                  {order.technician}
                </dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Service provider</dt>
                <dd className="mt-0.5 font-medium">{order.vendor}</dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Odometer at service</dt>
                <dd className="tabular mt-0.5 font-medium">
                  {formatKm(order.odometerAtService)}
                </dd>
              </div>
              {order.taskIds.length ? (
                <div>
                  <dt className="text-subtle-foreground">PMS intervals reset</dt>
                  <dd className="mt-1 space-y-1">
                    {order.taskIds.map((id) => (
                      <span key={id} className="block font-medium">
                        {TASK_BY_ID.get(id)?.name ?? id}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt className="text-subtle-foreground">PMS intervals reset</dt>
                  <dd className="mt-0.5 text-subtle-foreground">
                    None — unplanned repair.
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card-raised p-5">
            <h3 className="text-sm font-semibold tracking-tight">Timeline</h3>
            <p className="mt-0.5 text-2xs text-subtle-foreground">
              Every status change, oldest first.
            </p>
            <ol className="mt-4 space-y-3">
              {order.history.map((entry, index) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="relative flex flex-col items-center">
                    {entry.status === "cancelled" ? (
                      <XCircle className="size-3.5 text-critical" />
                    ) : (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-brand" />
                    )}
                    {index < order.history.length - 1 ? (
                      <span className="mt-1 w-px flex-1 bg-border" />
                    ) : null}
                  </span>
                  <span className="pb-1">
                    <span
                      className={
                        entry.status === "cancelled"
                          ? "block text-xs font-medium text-critical"
                          : "block text-xs font-medium"
                      }
                    >
                      {WORK_ORDER_STATUS_LABEL[entry.status]}
                    </span>
                    <span className="tabular block text-2xs text-subtle-foreground">
                      {formatDate(entry.at)} · {entry.actor}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <CompleteWorkOrderDialog
        order={order}
        vehicle={vehicle}
        open={closing}
        onOpenChange={setClosing}
      />
    </>
  );
}
