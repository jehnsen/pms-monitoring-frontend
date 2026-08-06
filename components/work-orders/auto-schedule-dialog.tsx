"use client";

import * as React from "react";
import { addDays, formatISO } from "date-fns";
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
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { formatCurrency, formatDate, formatDayDelta } from "@/lib/utils";
import type { PmsItem, Priority, Vehicle } from "@/types";

const LABOR_RATE_PER_HOUR = 650;
/** Bay throughput assumption — jobs are spread rather than dumped on one day. */
const JOBS_PER_DAY = 3;

interface Proposal {
  vehicle: Vehicle;
  item: PmsItem;
  scheduledFor: string;
  priority: Priority;
}

/**
 * Bulk-schedules everything currently overdue.
 *
 * Two things keep this from being a blunt instrument: intervals that already
 * have an open job are skipped, so running it twice cannot double-book; and the
 * proposed dates are spread across the coming days instead of landing every job
 * on tomorrow, which no workshop could absorb.
 */
export function AutoScheduleDialog() {
  const { health, workOrders, approvalSettings } = useFleet();
  const { createWorkOrder } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [done, setDone] = React.useState(0);

  const proposals = React.useMemo<Proposal[]>(() => {
    // An interval is already handled if a live order covers it for that vehicle.
    const covered = new Set(
      workOrders
        .filter((o) => o.status !== "closed" && o.status !== "cancelled")
        .flatMap((o) => o.taskIds.map((taskId) => `${o.vehicleId}:${taskId}`))
    );

    const pending = health
      .flatMap((entry) =>
        entry.items
          .filter((item) => item.status === "overdue")
          .map((item) => ({ vehicle: entry.vehicle, item }))
      )
      .filter(
        ({ vehicle, item }) => !covered.has(`${vehicle.id}:${item.task.id}`)
      )
      // Worst first, so the most overdue gets the earliest slot.
      .sort((a, b) => a.item.daysRemaining - b.item.daysRemaining);

    return pending.map(({ vehicle, item }, index) => ({
      vehicle,
      item,
      scheduledFor: formatISO(
        addDays(new Date(), 1 + Math.floor(index / JOBS_PER_DAY)),
        { representation: "date" }
      ),
      priority: item.task.critical ? "critical" : "high",
    }));
  }, [health, workOrders]);

  const estimate = proposals.reduce(
    (total, proposal) =>
      total +
      proposal.item.task.estimatedCost +
      proposal.item.task.estimatedHours * LABOR_RATE_PER_HOUR,
    0
  );

  const trigger = (
    <Button variant="secondary">
      <CalendarPlus />
      Auto-schedule overdue
    </Button>
  );

  if (!can("workorder:create")) {
    return <DeniedAction reason={reason("workorder:create")}>{trigger}</DeniedAction>;
  }

  function commit() {
    for (const proposal of proposals) {
      createWorkOrder(
        {
          vehicleId: proposal.vehicle.id,
          title: proposal.item.task.name,
          type: "preventive",
          priority: proposal.priority,
          openedOn: formatISO(new Date(), { representation: "date" }),
          scheduledFor: proposal.scheduledFor,
          completedOn: null,
          odometerAtService: proposal.vehicle.odometer,
          technician: "Unassigned",
          vendor: "In-house Fleet Bay 1",
          laborCost: proposal.item.task.estimatedHours * LABOR_RATE_PER_HOUR,
          partsCost: proposal.item.task.estimatedCost,
          parts: [],
          findings: "",
          taskIds: [proposal.item.task.id],
          notes: `Raised automatically from the overdue queue on ${formatDate(
            formatISO(new Date(), { representation: "date" })
          )}.`,
        },
        [
          {
            description: proposal.item.task.name,
            category: proposal.item.task.category,
            partCost: proposal.item.task.estimatedCost,
            labourCost: proposal.item.task.estimatedHours * LABOR_RATE_PER_HOUR,
            urgency: proposal.item.task.critical ? "safety_critical" : "recommended",
            partsSource: approvalSettings.defaultPartsSource,
            photoUrls: [],
          },
        ],
        approvalSettings
      );
    }
    setDone(proposals.length);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDone(0);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Auto-schedule overdue maintenance</DialogTitle>
          <DialogDescription>
            Raises a preventive work order for every breached interval that
            isn&apos;t already booked. Cheap ones auto-approve on the spot;
            the rest enter the approval queue.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {done > 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={`${done} work ${done === 1 ? "order" : "orders"} raised`}
              description="Auto-approved ones are ready to schedule now; the rest are waiting on purchasing approval."
            />
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
                  <span className="font-medium text-foreground">
                    {proposals.length} work orders
                  </span>{" "}
                  will be raised across{" "}
                  {Math.ceil(proposals.length / JOBS_PER_DAY)} days.
                </p>
                <p className="tabular text-xs font-medium">
                  {formatCurrency(estimate)} estimated
                </p>
              </div>

              <ul className="max-h-[320px] divide-y divide-border overflow-y-auto rounded-md border border-border">
                {proposals.map((proposal) => (
                  <li
                    key={`${proposal.vehicle.id}-${proposal.item.task.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {proposal.item.task.name}
                      </span>
                      <span className="block truncate text-2xs text-subtle-foreground">
                        {proposal.vehicle.plateNumber} ·{" "}
                        {formatDayDelta(proposal.item.daysRemaining)}
                      </span>
                    </span>
                    {proposal.item.task.critical ? (
                      <Badge tone="critical">Safety critical</Badge>
                    ) : null}
                    <span className="tabular shrink-0 text-2xs text-muted-foreground">
                      {formatDate(proposal.scheduledFor)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {done > 0 ? "Close" : "Cancel"}
          </Button>
          {done === 0 && proposals.length > 0 ? (
            <Button variant="primary" onClick={commit}>
              Raise {proposals.length} work{" "}
              {proposals.length === 1 ? "order" : "orders"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
