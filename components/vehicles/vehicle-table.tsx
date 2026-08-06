"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Meter } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PmsStatusBadge, VehicleStatusBadge } from "@/components/status";
import { isOdometerStale, odometerAgeDays } from "@/lib/pms";
import type { VehicleHealth } from "@/types";
import { formatDayDelta, formatKm } from "@/lib/utils";

const HEADINGS = [
  "Vehicle",
  "Status",
  "Odometer",
  "PMS",
  "Next service due",
  "Health",
  "",
];

export function VehicleTable({ entries }: { entries: VehicleHealth[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {HEADINGS.map((heading, index) => (
              <th
                key={heading || index}
                scope="col"
                className="whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => {
            const { vehicle, nextItem } = entry;
            const stale = isOdometerStale(vehicle);
            return (
              <tr
                key={vehicle.id}
                className="group transition-colors hover:bg-surface-2/50"
              >
                <td className="px-4 py-3">
                  <Link href={`/vehicles/${vehicle.id}`} className="block rounded">
                    <span className="tabular block text-xs font-medium group-hover:text-brand">
                      {vehicle.plateNumber}
                    </span>
                    <span className="block text-2xs text-subtle-foreground">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </span>
                  </Link>
                </td>

                <td className="px-4 py-3">
                  <VehicleStatusBadge status={vehicle.status} />
                </td>

                <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatKm(vehicle.odometer)}
                </td>

                <td className="px-4 py-3">
                  <PmsStatusBadge status={entry.status} />
                </td>

                <td className="min-w-[240px] px-4 py-3">
                  {nextItem ? (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-xs">{nextItem.task.name}</span>
                        {stale ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="tabular shrink-0 text-2xs text-subtle-foreground">
                                {formatDayDelta(nextItem.daysRemaining)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Projection based on a reading{" "}
                              {odometerAgeDays(vehicle)} days old.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="tabular shrink-0 text-2xs text-subtle-foreground">
                            {formatDayDelta(nextItem.daysRemaining)}
                          </span>
                        )}
                      </div>
                      <Meter
                        className="mt-1.5"
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
                    </>
                  ) : (
                    <span className="text-xs text-subtle-foreground">—</span>
                  )}
                </td>

                <td className="tabular px-4 py-3 text-xs font-medium">
                  {entry.healthScore}
                </td>

                <td className="px-2 py-3">
                  <Link
                    href={`/vehicles/${vehicle.id}`}
                    aria-label={`Open ${vehicle.plateNumber}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
