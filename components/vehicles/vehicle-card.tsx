"use client";

import Link from "next/link";
import { Clock, Gauge, MapPin, User } from "lucide-react";
import { Meter } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PmsStatusBadge, VehicleStatusBadge } from "@/components/status";
import { isOdometerStale, odometerAgeDays } from "@/lib/pms";
import type { VehicleHealth } from "@/types";
import { formatDayDelta, formatKm, formatRelative } from "@/lib/utils";

export function VehicleCard({ entry }: { entry: VehicleHealth }) {
  const { vehicle, nextItem, status } = entry;
  const stale = isOdometerStale(vehicle);

  return (
    <Link
      href={`/vehicles/${vehicle.id}`}
      className="card-raised group flex flex-col p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-sm font-semibold tracking-tight">
            {vehicle.plateNumber}
          </p>
          <p className="mt-0.5 truncate text-xs text-subtle-foreground">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <PmsStatusBadge status={status} />
          {stale ? (
            <Badge tone="warning">
              <Clock />
              Stale reading
            </Badge>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-2xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Gauge className="size-3.5 shrink-0 text-subtle-foreground" />
          <dt className="sr-only">Odometer</dt>
          <dd className="tabular truncate">
            {formatKm(vehicle.odometer)}
            <span className="ml-1 text-subtle-foreground">
              · {formatRelative(vehicle.odometerReadAt)}
            </span>
          </dd>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-3.5 shrink-0 text-subtle-foreground" />
          <dt className="sr-only">Location</dt>
          <dd className="truncate">{vehicle.location}</dd>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
          <User className="size-3.5 shrink-0 text-subtle-foreground" />
          <dt className="sr-only">Assigned to</dt>
          <dd className="truncate">{vehicle.assignedTo}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-border pt-4">
        {nextItem ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-xs font-medium">{nextItem.task.name}</p>
              {stale ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="tabular shrink-0 text-2xs text-subtle-foreground">
                      {formatDayDelta(nextItem.daysRemaining)}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    Projection based on a reading {odometerAgeDays(vehicle)} days
                    old.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="tabular shrink-0 text-2xs text-muted-foreground">
                  {formatDayDelta(nextItem.daysRemaining)}
                </p>
              )}
            </div>
            <Meter
              className="mt-2"
              value={nextItem.progress}
              tone={
                nextItem.status === "overdue"
                  ? "critical"
                  : nextItem.status === "due_soon"
                    ? "warning"
                    : "ok"
              }
              label={`${nextItem.task.name} interval progress`}
            />
            <p className="tabular mt-2 text-2xs text-subtle-foreground">
              {nextItem.kmRemaining <= 0
                ? `${formatKm(Math.abs(nextItem.kmRemaining))} past the limit`
                : `${formatKm(nextItem.kmRemaining)} to go`}
              {" · governed by "}
              {nextItem.governedBy}
            </p>
          </>
        ) : (
          <p className="text-xs text-subtle-foreground">No tracked intervals.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <VehicleStatusBadge status={vehicle.status} />
        <span className="tabular text-2xs text-subtle-foreground">
          Health {entry.healthScore}
        </span>
      </div>
    </Link>
  );
}
