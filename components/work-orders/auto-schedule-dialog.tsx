"use client";

import * as React from "react";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DeniedAction } from "@/components/auth/denied-action";
import { QueryError } from "@/components/ui/query-error";
import { useAutoSchedule, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { formatCurrency, formatDate, formatDayDelta } from "@/lib/utils";

/**
 * Bulk-schedules everything currently overdue.
 *
 * The proposals are the API's (`GET /analytics/auto-schedule`): intervals
 * that already have a live job are skipped, so running it twice cannot
 * double-book, and dates are spread across the coming days at the shop's
 * daily throughput. Committing recomputes them in one transaction
 * (`POST /work-orders/auto-schedule`), raising a draft per item; each is then
 * sent for approval, so cheap ones auto-approve on the spot.
 */
export function AutoScheduleDialog() {
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const { data: preview, error, refetch } = useAutoSchedule(open);
  const { autoSchedule, sendForApproval } = useFleetActions();
  const [result, setResult] = React.useState<{ created: number; sent: number } | null>(null);
  const [commitError, setCommitError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const trigger = (
    <Button variant="secondary">
      <CalendarPlus />
      Auto-schedule overdue
    </Button>
  );

  if (!can("workorder:create")) {
    return <DeniedAction reason={reason("workorder:create")}>{trigger}</DeniedAction>;
  }

  const proposals = preview?.proposals ?? [];
  const days = preview ? Math.ceil(proposals.length / Math.max(preview.jobsPerDay, 1)) : 0;

  async function commit() {
    setPending(true);
    setCommitError(null);
    const created = await autoSchedule();
    if (!created.ok) {
      setPending(false);
      setCommitError(created.error);
      return;
    }
    let sent = 0;
    for (const order of created.data.workOrders) {
      const outcome = await sendForApproval(order.id);
      if (outcome.ok) sent += 1;
    }
    setPending(false);
    setResult({ created: created.data.created, sent });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
          setCommitError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Auto-schedule overdue maintenance</DialogTitle>
          <DialogDescription>
            Raises a preventive work order for every breached interval that isn&apos;t already booked. Cheap ones
            auto-approve on the spot; the rest enter the approval queue.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {result ? (
            <EmptyState
              icon={CheckCircle2}
              title={`${result.created} work ${result.created === 1 ? "order" : "orders"} raised`}
              description={
                result.sent === result.created
                  ? "Auto-approved ones are ready to schedule now; the rest are waiting on purchasing approval."
                  : `${result.sent} sent for approval; ${result.created - result.sent} stayed as drafts — open them to send.`
              }
            />
          ) : error ? (
            <QueryError error={error} onRetry={() => void refetch()} className="rounded-md border border-border" />
          ) : !preview ? (
            <p className="py-10 text-center text-xs text-subtle-foreground">Working out what&apos;s overdue…</p>
          ) : proposals.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing to schedule"
              description="Every overdue interval already has a live work order against it."
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{proposals.length} work orders</span> will be raised
                  across {days} {days === 1 ? "day" : "days"}.
                </p>
                <p className="tabular text-xs font-medium">{formatCurrency(preview.estimate)} estimated</p>
              </div>

              <ul className="max-h-[320px] divide-y divide-border overflow-y-auto rounded-md border border-border">
                {proposals.map((proposal) => (
                  <li
                    key={`${proposal.vehicle.id}-${proposal.item.task.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{proposal.item.task.name}</span>
                      <span className="block truncate text-2xs text-subtle-foreground">
                        {proposal.vehicle.plateNumber} · {formatDayDelta(proposal.item.daysRemaining)}
                      </span>
                    </span>
                    {proposal.item.task.critical ? <Badge tone="critical">Safety critical</Badge> : null}
                    <span className="tabular shrink-0 text-2xs text-muted-foreground">{formatDate(proposal.scheduledFor)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {commitError ? <p className="mt-3 text-xs text-critical">{commitError}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && proposals.length > 0 && preview?.canCommit ? (
            <Button variant="primary" disabled={pending} onClick={() => void commit()}>
              {pending ? "Raising…" : `Raise ${proposals.length} work ${proposals.length === 1 ? "order" : "orders"}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
