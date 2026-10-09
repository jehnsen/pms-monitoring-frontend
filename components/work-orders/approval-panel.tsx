"use client";

import * as React from "react";
import { ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { LineApprovalStatusBadge } from "@/components/status";
import { useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { WorkOrder } from "@/types";

const PARTS_SOURCE_LABEL = {
  own_stock: "Own stock",
  supplier_provided: "Supplier provided",
} as const;

/**
 * Per-line approve/decline/defer — the actual decision-making UI. Approval
 * always evaluates against the order's total pending value, not the single
 * line, so who can approve here can change as sibling lines get decided.
 * The pending value and whether the caller's band covers it are the API's
 * (`approval.pending_value_cents`, `approval.can_approve`); the decision
 * itself is re-checked when it is posted.
 */
export function ApprovalPanel({ order }: { order: WorkOrder }) {
  const { decideLines } = useFleetActions();
  const { can, reason } = useCan();

  const [decliningLineId, setDecliningLineId] = React.useState<string | null>(null);
  const [declineReason, setDeclineReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  if (order.lines.length === 0) return null;

  const orderPendingValue = order.approval.pendingValue;
  const canApproveOrder = order.approval.canApprove;
  const canDecide = can("workorder:approve") && order.status === "pending_approval";

  async function decide(lineId: string, decision: "approved" | "declined" | "deferred", note?: string) {
    setPending(true);
    setError(null);
    const result = await decideLines(order.id, [{ lineId, decision, note: note ?? null }]);
    setPending(false);
    if (!result.ok) {
      setError(result.fields ? Object.values(result.fields)[0]?.[0] ?? result.error : result.error);
      return false;
    }
    return true;
  }

  function startDecline(lineId: string) {
    setDecliningLineId(lineId);
    setDeclineReason("");
  }

  async function confirmDecline(lineId: string) {
    if (!declineReason.trim()) return;
    if (await decide(lineId, "declined", declineReason.trim())) {
      setDecliningLineId(null);
      setDeclineReason("");
    }
  }

  return (
    <section className="card-raised">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Approval</h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            Every line is a separate purchasing decision — approving one doesn&apos;t
            approve the rest.
          </p>
        </div>
        {orderPendingValue > 0 ? (
          <Badge tone="warning">
            {formatCurrency(orderPendingValue)} pending
          </Badge>
        ) : null}
      </header>

      {error ? <p role="alert" className="border-t border-border bg-critical/[0.06] px-5 py-2 text-xs text-critical">{error}</p> : null}

      <div className="divide-y divide-border border-t border-border">
        {order.lines.map((line) => {
          // The stored extended amounts — the price actually quoted — rather
          // than re-multiplying today's rates.
          const total = line.lineCost;
          const declining = decliningLineId === line.id;

          return (
            <div key={line.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{line.description}</p>
                    {line.urgency === "safety_critical" ? (
                      <Badge tone="outline">
                        <ShieldAlert />
                        Safety critical
                      </Badge>
                    ) : null}
                  </div>
                  {/* The arithmetic, not just the answer: an approver deciding
                      on a line should see what makes it that number, so a
                      wrong quantity or rate is visible before it is authorised
                      rather than after the invoice. */}
                  <p className="mt-0.5 text-2xs text-subtle-foreground">
                    {PARTS_SOURCE_LABEL[line.partsSource]}
                    {line.quantity > 0 && line.unitPartRate > 0 ? (
                      <>
                        {" · "}
                        {line.quantity} × {formatCurrency(line.unitPartRate)} parts
                      </>
                    ) : null}
                    {line.labourHours > 0 ? (
                      <>
                        {" · "}
                        {line.labourHours}h × {formatCurrency(line.labourRate)} labour
                      </>
                    ) : null}
                    {" · "}
                    <span className="font-medium text-muted-foreground">
                      {formatCurrency(total)}
                    </span>
                  </p>
                </div>
                <LineApprovalStatusBadge status={line.approvalStatus} />
              </div>

              {line.approvalStatus === "pending" ? (
                order.status !== "pending_approval" ? (
                  <p className="mt-2 text-2xs text-subtle-foreground">Not yet sent for approval.</p>
                ) : canDecide ? (
                  declining ? (
                    <div className="mt-3 space-y-2 rounded-md border border-critical/25 bg-critical/[0.06] p-3">
                      {line.urgency === "safety_critical" ? (
                        <p className="text-2xs text-critical">
                          This line is safety-critical. The reason is recorded
                          permanently on the vehicle&apos;s liability record.
                        </p>
                      ) : null}
                      <Textarea
                        aria-label="Decline reason"
                        value={declineReason}
                        placeholder="Why is this being declined?"
                        onChange={(event) => setDeclineReason(event.target.value)}
                        className="min-h-16 text-xs"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDecliningLineId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={!declineReason.trim() || pending}
                          onClick={() => void confirmDecline(line.id)}
                        >
                          Confirm decline
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!canApproveOrder || pending}
                        title={
                          canApproveOrder
                            ? undefined
                            : "This order's pending value needs a higher approval band."
                        }
                        onClick={() => void decide(line.id, "approved")}
                      >
                        <ThumbsUp />
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startDecline(line.id)}
                      >
                        <ThumbsDown />
                        Decline
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => void decide(line.id, "deferred")}
                      >
                        Defer
                      </Button>
                      {!canApproveOrder ? (
                        <span className="text-2xs text-subtle-foreground">
                          This order&apos;s pending value needs a higher approval band.
                        </span>
                      ) : null}
                    </div>
                  )
                ) : (
                  <p className="mt-2 text-2xs text-subtle-foreground">
                    {reason("workorder:approve")}
                  </p>
                )
              ) : (
                <div className="mt-2 text-2xs text-subtle-foreground">
                  {line.approvalStatus === "declined" ? (
                    <p className="text-critical">
                      Declined by {line.approvedBy} on{" "}
                      {line.approvedAt ? formatDate(line.approvedAt) : "—"}
                      {line.declineReason ? ` — ${line.declineReason}` : ""}
                    </p>
                  ) : (
                    <p>
                      {line.approvalStatus === "deferred" ? "Deferred" : "Approved"} by{" "}
                      {line.approvedBy}
                      {line.approvedAt ? ` on ${formatDate(line.approvedAt)}` : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
