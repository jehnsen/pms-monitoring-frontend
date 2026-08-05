"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Meter } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { PmsStatusBadge } from "@/components/status";
import { urgentItems } from "@/lib/analytics";
import type { VehicleHealth } from "@/types";
import { formatDayDelta, formatKm } from "@/lib/utils";

/**
 * The queue a fleet manager works down: every breached or nearly-breached
 * interval across the fleet, most urgent first.
 */
export function AttentionList({
  health,
  limit = 7,
}: {
  health: VehicleHealth[];
  limit?: number;
}) {
  const items = urgentItems(health);
  const shown = items.slice(0, limit);

  return (
    <section className="card-raised flex flex-col">
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Needs attention</h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            Intervals already breached or closing in.
          </p>
        </div>
        <Link
          href="/schedule"
          className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-brand transition-colors hover:underline"
        >
          View all {items.length}
          <ArrowRight className="size-3.5" />
        </Link>
      </header>

      {shown.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing is due"
          description="Every tracked interval across the fleet is inside its limit."
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {shown.map(({ vehicle, item }) => (
            <li key={`${vehicle.id}-${item.task.id}`}>
              <Link
                href={`/vehicles/${vehicle.id}`}
                className="block px-5 py-3 transition-colors hover:bg-surface-2/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.task.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-subtle-foreground">
                      {vehicle.plateNumber} · {vehicle.make} {vehicle.model}
                    </p>
                  </div>
                  <PmsStatusBadge status={item.status} />
                </div>

                <div className="mt-2.5 flex items-center gap-3">
                  <Meter
                    value={item.progress}
                    tone={item.status === "overdue" ? "critical" : "warning"}
                    label={`${item.task.name} interval progress`}
                    className="flex-1"
                  />
                  <p className="tabular shrink-0 text-2xs text-muted-foreground">
                    {item.kmRemaining <= 0
                      ? `${formatKm(Math.abs(item.kmRemaining))} past`
                      : `${formatKm(item.kmRemaining)} left`}
                    <span className="mx-1.5 text-border-strong">·</span>
                    {formatDayDelta(item.daysRemaining)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
