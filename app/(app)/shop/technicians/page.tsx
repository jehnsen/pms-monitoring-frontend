"use client";

import Link from "next/link";
import { startOfMonth } from "date-fns";
import { UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useFleet } from "@/lib/store";
import { TECHNICIANS } from "@/lib/technicians";
import { bayName } from "@/lib/bays";
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import { elapsedMinutes, formatDuration, technicianLoad } from "@/lib/shop";
import { cn } from "@/lib/utils";

const HEADINGS = [
  "Technician",
  "Home bay",
  "Working on",
  "Closed this month",
  "Avg actual",
  "Avg estimate",
  "Variance",
];

export default function ShopTechniciansPage() {
  const { ready, workOrders, vehiclesById } = useFleet();

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Technicians"
          description="Who is on what, and how the floor's time compares to the catalogue."
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  const now = new Date();
  const loads = technicianLoad(
    TECHNICIANS.map((tech) => tech.name),
    workOrders,
    startOfMonth(now),
    now
  );

  return (
    <>
      <PageHeader
        title="Technicians"
        description="Who is on what, and how the floor's time compares to the catalogue's own estimate."
      />

      <div className="card-raised">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {HEADINGS.map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground",
                      (heading === "Avg actual" ||
                        heading === "Avg estimate" ||
                        heading === "Variance") &&
                        "text-right"
                    )}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loads.map((load) => {
                const tech = TECHNICIANS.find((t) => t.name === load.name);
                const current = load.current;
                const vehicle = current
                  ? vehiclesById.get(current.vehicleId)
                  : undefined;

                const variance =
                  load.avgActualHours !== null && load.avgEstimatedHours
                    ? Math.round(
                        ((load.avgActualHours - load.avgEstimatedHours) /
                          load.avgEstimatedHours) *
                          100
                      )
                    : null;

                return (
                  <tr key={load.name} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <span className="block text-xs font-medium">{load.name}</span>
                      <span className="block text-2xs text-subtle-foreground">
                        {tech
                          ? tech.specialty === "general"
                            ? "General"
                            : CATEGORY_LABEL[tech.specialty]
                          : "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {tech ? bayName(tech.homeBayId) : "—"}
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      {current ? (
                        <>
                          <Link
                            href={`/work-orders/${current.id}`}
                            className="block truncate text-xs font-medium transition-colors hover:text-brand"
                          >
                            {vehicle?.plateNumber ?? current.reference}
                          </Link>
                          <span className="tabular block text-2xs text-subtle-foreground">
                            {current.title} · {formatDuration(elapsedMinutes(current, now))}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-subtle-foreground">
                          Not on a job
                        </span>
                      )}
                    </td>
                    <td className="tabular px-4 py-3 text-xs text-muted-foreground">
                      {load.completedThisPeriod}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                      {load.avgActualHours === null ? "—" : `${load.avgActualHours}h`}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs text-subtle-foreground">
                      {load.avgEstimatedHours === null
                        ? "—"
                        : `${load.avgEstimatedHours}h`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {variance === null ? (
                        <span className="text-xs text-subtle-foreground">—</span>
                      ) : (
                        // Neutral tone on purpose: over the estimate is a fact
                        // about the work, not a verdict on the person.
                        <Badge tone={Math.abs(variance) > 25 ? "warning" : "neutral"}>
                          {variance > 0 ? "+" : ""}
                          {variance}%
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-2xs leading-relaxed text-subtle-foreground">
        Variance compares recorded bay time against the service catalogue&apos;s
        estimate for the same work. It is a prompt, not a score — a technician
        who consistently runs long may simply be the one handed the worst
        vehicles, and the number cannot tell you which.
      </p>
    </>
  );
}
