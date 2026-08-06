"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UpcomingLoadChart } from "@/components/charts/upcoming-load-chart";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { AutoScheduleDialog } from "@/components/work-orders/auto-schedule-dialog";
import { Meter } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PmsStatusBadge } from "@/components/status";
import { useFleet } from "@/lib/store";
import { serviceDemand, upcomingLoad } from "@/lib/analytics";
import { compareUrgency } from "@/lib/pms";
import { formatCurrency, formatDate, formatDayDelta, formatKm } from "@/lib/utils";
import type { PmsItem, PmsStatus, Vehicle } from "@/types";

interface Row {
  vehicle: Vehicle;
  item: PmsItem;
}

/** Forward horizon buckets, in the order a planner works through them. */
const GROUPS: { label: string; description: string; test: (row: Row) => boolean }[] =
  [
    {
      label: "Overdue",
      description: "Past a limit. These should be booked in today.",
      test: (row) => row.item.status === "overdue",
    },
    {
      label: "Next 7 days",
      description: "Falling due inside the week.",
      test: (row) => row.item.status !== "overdue" && row.item.daysRemaining <= 7,
    },
    {
      label: "Next 30 days",
      description: "Enough lead time to order parts.",
      test: (row) =>
        row.item.status !== "overdue" &&
        row.item.daysRemaining > 7 &&
        row.item.daysRemaining <= 30,
    },
    {
      label: "Next 90 days",
      description: "On the horizon; useful for budgeting.",
      test: (row) =>
        row.item.status !== "overdue" &&
        row.item.daysRemaining > 30 &&
        row.item.daysRemaining <= 90,
    },
  ];

function ScheduleView() {
  const { ready, health } = useFleet();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<PmsStatus | "all">(
    (searchParams.get("status") as PmsStatus | null) ?? "all"
  );

  const rows = useMemo(
    () =>
      health
        .flatMap((entry) =>
          entry.items.map((item) => ({ vehicle: entry.vehicle, item }))
        )
        .filter((row) => (status === "all" ? true : row.item.status === status))
        .sort((a, b) => compareUrgency(a.item, b.item)),
    [health, status]
  );

  if (!ready) return <Skeleton className="h-96" />;

  const groups = GROUPS.map((group) => ({
    ...group,
    rows: rows.filter(group.test),
  })).filter((group) => group.rows.length > 0);

  // Count what is actually listed. `rows` holds every tracked interval for
  // every vehicle — the whole catalogue — most of which falls outside the
  // 90-day horizon these groups cover.
  const listed = groups.reduce((total, group) => total + group.rows.length, 0);
  const beyondHorizon = rows.length - listed;
  const demand = serviceDemand(health);

  return (
    <>
      <UpcomingLoadChart data={upcomingLoad(health)} className="mb-5" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as PmsStatus | "all")}
        >
          <SelectTrigger className="w-[184px]" aria-label="Filter by PMS status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service items</SelectItem>
            <SelectItem value="overdue">Overdue only</SelectItem>
            <SelectItem value="due_soon">Due soon only</SelectItem>
            <SelectItem value="ok">On schedule only</SelectItem>
          </SelectContent>
        </Select>
        {/* Same selector the dashboard tiles read, so the two screens cannot
            report different figures for the same thing. */}
        <p className="text-xs text-subtle-foreground">
          <span className="font-medium text-foreground">
            {demand.overdue.count} overdue
          </span>{" "}
          ({formatCurrency(demand.overdue.estimatedCost)} est.) ·{" "}
          <span className="font-medium text-foreground">
            {demand.dueSoon.count} due soon
          </span>{" "}
          ({formatCurrency(demand.dueSoon.estimatedCost)} est.) · {listed}{" "}
          {listed === 1 ? "item" : "items"} listed within 90 days
          {beyondHorizon > 0 ? `, ${beyondHorizon} further ahead` : ""}.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarCheck}
            title="Nothing falls due in this window"
            description="Try a different status filter, or check back as odometer readings come in."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const groupCost = group.rows.reduce(
              (total, row) => total + row.item.task.estimatedCost,
              0
            );

            return (
              <section key={group.label} className="card-raised">
                <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                      {group.label}
                      <span className="tabular rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {group.rows.length}
                      </span>
                    </h3>
                    <p className="mt-0.5 text-xs text-subtle-foreground">
                      {group.description}
                    </p>
                  </div>
                  <p className="tabular text-xs text-muted-foreground">
                    {formatCurrency(groupCost)} estimated
                  </p>
                </header>

                <ul className="divide-y divide-border border-t border-border">
                  {group.rows.map((row) => (
                    <li
                      key={`${row.vehicle.id}-${row.item.task.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 transition-colors hover:bg-surface-2/50"
                    >
                      <div className="min-w-[180px] flex-1">
                        <p className="truncate text-sm font-medium">
                          {row.item.task.name}
                        </p>
                        <Link
                          href={`/vehicles/${row.vehicle.id}`}
                          className="mt-0.5 inline-block truncate text-xs text-subtle-foreground transition-colors hover:text-brand"
                        >
                          {row.vehicle.plateNumber} · {row.vehicle.make}{" "}
                          {row.vehicle.model}
                        </Link>
                      </div>

                      <div className="w-40 shrink-0">
                        <Meter
                          value={row.item.progress}
                          tone={
                            row.item.status === "overdue"
                              ? "critical"
                              : row.item.status === "due_soon"
                                ? "warning"
                                : "ok"
                          }
                          label={`${row.item.task.name} interval progress`}
                        />
                        <p className="tabular mt-1.5 text-2xs text-subtle-foreground">
                          {row.item.kmRemaining <= 0
                            ? `${formatKm(Math.abs(row.item.kmRemaining))} past`
                            : `${formatKm(row.item.kmRemaining)} left`}
                        </p>
                      </div>

                      <div className="w-36 shrink-0">
                        <p className="tabular text-xs font-medium">
                          {formatDate(row.item.dueDate)}
                        </p>
                        <p className="tabular mt-0.5 text-2xs text-subtle-foreground">
                          {formatDayDelta(row.item.daysRemaining)}
                        </p>
                      </div>

                      <PmsStatusBadge status={row.item.status} />

                      <NewWorkOrderDialog
                        vehicleId={row.vehicle.id}
                        taskId={row.item.task.id}
                        trigger={
                          <Button
                            size="sm"
                            variant={
                              row.item.status === "overdue" ? "primary" : "secondary"
                            }
                          >
                            Book in
                          </Button>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function SchedulePage() {
  return (
    <>
      <PageHeader
        title="Service schedule"
        description="Everything falling due across the fleet, grouped by how much lead time is left."
        actions={
          <>
            <AutoScheduleDialog />
            <NewWorkOrderDialog />
          </>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <ScheduleView />
      </Suspense>
    </>
  );
}
