"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FileText,
  Play,
  ReceiptText,
  Send,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
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
import { ApprovalPanel } from "@/components/work-orders/approval-panel";
import { ApprovalWaitBanner } from "@/components/work-orders/approval-wait-banner";
import { ScheduleDialog } from "@/components/work-orders/schedule-dialog";
import { CompleteWorkOrderDialog } from "@/components/work-orders/complete-work-order-dialog";
import { DocumentList } from "@/components/documents/document-list";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { DeniedAction } from "@/components/auth/denied-action";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { isProviderRole } from "@/lib/tenancy";
import { approvedValue, declinedValue, pendingValue } from "@/lib/approvals";
import { resolvePartsCost, workOrderCost } from "@/lib/pms";
import { TASK_BY_ID } from "@/lib/service-tasks";
import { formatCurrency, formatDate, formatKm, titleCase } from "@/lib/utils";
import type { ApprovalAction, WorkOrderEvent, ApprovalLogEntry } from "@/types";

type TimelineRow =
  | { kind: "status"; at: string; event: WorkOrderEvent }
  | { kind: "approval"; at: string; entry: ApprovalLogEntry };

const APPROVAL_ACTION_META: Record<
  ApprovalAction,
  { label: string; icon: typeof ThumbsUp; tone: "ok" | "critical" | "neutral" | "warning" }
> = {
  sent_for_approval: { label: "Quotation sent", icon: Send, tone: "neutral" },
  auto_approved: { label: "Auto-approved", icon: ThumbsUp, tone: "ok" },
  approved: { label: "Approved", icon: ThumbsUp, tone: "ok" },
  declined: { label: "Declined", icon: ThumbsDown, tone: "critical" },
  deferred: { label: "Deferred", icon: CircleDashed, tone: "neutral" },
  escalated: { label: "Escalated", icon: ThumbsUp, tone: "warning" },
  variance_approved: { label: "Variance re-approved", icon: ReceiptText, tone: "warning" },
};

export default function WorkOrderDetailPage({
  params,
}: {
  params: { orderId: string };
}) {
  const { ready, workOrders, vehiclesById, documents, approvalSettings } = useFleet();
  const { updateWorkOrder, sendForApproval } = useFleetActions();
  const { can, reason, role } = useCan();
  const [sendError, setSendError] = useState<string | null>(null);
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
  const closed = order.status === "closed" || order.status === "cancelled";
  const partsCost = resolvePartsCost(order);

  const canSchedule = order.status === "approved" || order.status === "partially_approved";

  const timeline: TimelineRow[] = [
    ...order.history.map((event): TimelineRow => ({ kind: "status", at: event.at, event })),
    ...order.approvalLog.map((entry): TimelineRow => ({ kind: "approval", at: entry.at, entry })),
  ].sort((a, b) => a.at.localeCompare(b.at));

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
            {/* The provider's half of the approval loop: a draft is the shop's
                own quotation until it is sent, at which point the client's
                clock starts. */}
            {order.status === "draft" ? (
              can("workorder:update") ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    const result = sendForApproval(order.id);
                    setSendError(result.ok ? null : result.error);
                  }}
                >
                  <Send />
                  Send for approval
                </Button>
              ) : (
                <DeniedAction reason={reason("workorder:update")}>
                  <Button variant="primary">
                    <Send />
                    Send for approval
                  </Button>
                </DeniedAction>
              )
            ) : null}

            {canSchedule && can("workorder:update") ? <ScheduleDialog order={order} /> : null}

            {order.status === "scheduled" && can("workorder:update") ? (
              <Button
                variant="secondary"
                onClick={() => updateWorkOrder(order.id, { status: "in_progress" })}
              >
                <Play />
                Start job
              </Button>
            ) : null}

            {order.status === "in_progress" ? (
              can("workorder:complete") ? (
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
              )
            ) : null}
          </>
        }
      />

      {sendError ? (
        <p className="mb-5 rounded-lg border border-critical/25 bg-critical/[0.06] px-4 py-3 text-xs text-critical">
          {sendError}
        </p>
      ) : null}

      {/* Provider-side only: the client already sees this as their own queue.
          What the shop needs is the clock, because it is the shop that has to
          answer for the delay. */}
      {isProviderRole(role) &&
      order.status === "pending_approval" &&
      order.pendingApprovalEnteredAt ? (
        <ApprovalWaitBanner
          since={order.pendingApprovalEnteredAt}
          slaHours={approvalSettings.slaHours}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ApprovalPanel order={order} />

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

            {order.lines.length > 0 ? (
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3.5 text-2xs">
                <div>
                  <dt className="text-subtle-foreground">Approved</dt>
                  <dd className="tabular mt-0.5 font-medium text-ok">
                    {formatCurrency(approvedValue(order.lines))}
                  </dd>
                </div>
                <div>
                  <dt className="text-subtle-foreground">Pending</dt>
                  <dd className="tabular mt-0.5 font-medium">
                    {formatCurrency(pendingValue(order.lines))}
                  </dd>
                </div>
                <div>
                  <dt className="text-subtle-foreground">Declined</dt>
                  <dd className="tabular mt-0.5 font-medium text-critical">
                    {formatCurrency(declinedValue(order.lines))}
                  </dd>
                </div>
              </dl>
            ) : null}
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
              Every status change and approval decision, oldest first.
            </p>
            <ol className="mt-4 space-y-3">
              {timeline.map((row, index) => {
                const isLast = index === timeline.length - 1;

                if (row.kind === "status") {
                  const { event } = row;
                  return (
                    <li key={`status-${event.id}`} className="flex gap-3">
                      <span className="relative flex flex-col items-center">
                        {event.status === "cancelled" ? (
                          <XCircle className="size-3.5 text-critical" />
                        ) : (
                          <span className="mt-1 size-2 shrink-0 rounded-full bg-brand" />
                        )}
                        {!isLast ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                      </span>
                      <span className="pb-1">
                        <span
                          className={
                            event.status === "cancelled"
                              ? "block text-xs font-medium text-critical"
                              : "block text-xs font-medium"
                          }
                        >
                          {WORK_ORDER_STATUS_LABEL[event.status]}
                        </span>
                        <span className="tabular block text-2xs text-subtle-foreground">
                          {formatDate(event.at)} · {event.actor}
                        </span>
                      </span>
                    </li>
                  );
                }

                const { entry } = row;
                const meta = APPROVAL_ACTION_META[entry.action];
                const Icon = meta.icon;
                const line = order.lines.find((l) => l.id === entry.lineId);

                return (
                  <li key={`approval-${entry.id}`} className="flex gap-3">
                    <span className="relative flex flex-col items-center">
                      <Icon
                        className={`size-3.5 ${
                          meta.tone === "critical"
                            ? "text-critical"
                            : meta.tone === "ok"
                              ? "text-ok"
                              : meta.tone === "warning"
                                ? "text-warning"
                                : "text-subtle-foreground"
                        }`}
                      />
                      {!isLast ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                    </span>
                    <span className="pb-1">
                      <span className="block text-xs font-medium">
                        {meta.label}
                        {line ? ` — ${line.description}` : ""}
                      </span>
                      <span className="tabular block text-2xs text-subtle-foreground">
                        {formatDate(entry.at)} · {entry.actorName}
                      </span>
                      {entry.note ? (
                        <span className="mt-0.5 block text-2xs text-subtle-foreground">
                          {entry.note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
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
