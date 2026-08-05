"use client";

import { ShieldAlert } from "lucide-react";
import { Meter } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PmsStatusBadge } from "@/components/status";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import type { PmsItem, Vehicle } from "@/types";
import { formatCurrency, formatDate, formatDayDelta, formatKm } from "@/lib/utils";

/**
 * The full interval sheet for one vehicle. Each row shows both limits — distance
 * and time — because which one governs changes with how hard the vehicle is
 * being worked, and that is exactly what a manager needs to see.
 */
export function PmsSchedule({
  vehicle,
  items,
}: {
  vehicle: Vehicle;
  items: PmsItem[];
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const tone =
          item.status === "overdue"
            ? "critical"
            : item.status === "due_soon"
              ? "warning"
              : "ok";

        return (
          <li key={item.task.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-medium">{item.task.name}</h4>
                  {item.task.critical ? (
                    <Badge tone="outline" title="Skipping this takes the unit off the road">
                      <ShieldAlert />
                      Safety critical
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-subtle-foreground">
                  {CATEGORY_LABEL[item.task.category]} · every{" "}
                  {formatKm(item.task.intervalKm)} or {item.task.intervalMonths}{" "}
                  months · {formatCurrency(item.task.estimatedCost)} est.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <PmsStatusBadge status={item.status} />
                <NewWorkOrderDialog
                  vehicleId={vehicle.id}
                  taskId={item.task.id}
                  trigger={
                    <Button
                      variant={item.status === "overdue" ? "primary" : "secondary"}
                      size="sm"
                    >
                      Schedule
                    </Button>
                  }
                />
              </div>
            </div>

            <Meter
              className="mt-3"
              value={item.progress}
              tone={tone}
              label={`${item.task.name} interval progress`}
            />

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-2xs sm:grid-cols-4">
              <div>
                <dt className="text-subtle-foreground">Distance limit</dt>
                <dd className="tabular mt-0.5 font-medium">
                  {formatKm(item.dueOdometer)}
                  <span className="ml-1.5 font-normal text-subtle-foreground">
                    {item.kmRemaining <= 0
                      ? `${formatKm(Math.abs(item.kmRemaining))} past`
                      : `${formatKm(item.kmRemaining)} left`}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Projected due</dt>
                <dd className="tabular mt-0.5 font-medium">
                  {formatDate(item.dueDate)}
                  <span className="ml-1.5 font-normal text-subtle-foreground">
                    {formatDayDelta(item.daysRemaining)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Governed by</dt>
                <dd className="mt-0.5 font-medium capitalize">{item.governedBy}</dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Last completed</dt>
                <dd className="tabular mt-0.5 font-medium">
                  {formatDate(item.lastDoneOn)}
                  <span className="ml-1.5 font-normal text-subtle-foreground">
                    at {formatKm(item.lastDoneOdometer)}
                  </span>
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
