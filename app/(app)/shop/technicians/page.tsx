"use client";

import Link from "next/link";
import { startOfMonth } from "date-fns";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeniedAction } from "@/components/auth/denied-action";
import { TechnicianFormDialog } from "@/components/settings/technician-form-dialog";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { BAY_BY_ID, bayName } from "@/lib/bays";
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

/** `specialty` is free text on `pms_technicians`, not the `TaskCategory` union. */
function specialtyLabel(specialty: string): string {
  if (specialty === "general") return "General";
  return CATEGORY_LABEL[specialty as keyof typeof CATEGORY_LABEL] ?? specialty;
}

export default function ShopTechniciansPage() {
  const { ready, workOrders, vehiclesById, technicians } = useFleet();
  const { deleteTechnician } = useFleetActions();
  const { can, reason } = useCan();

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Technicians"
          description="The provider's staff — roster, load, and variance."
        />
        <Skeleton className="h-64" />
        <Skeleton className="mt-5 h-96" />
      </>
    );
  }

  const now = new Date();
  // Retired staff (`active: false`) still worked jobs, but are not carried
  // forward into a fresh assignment/workload view.
  const activeTechnicians = technicians.filter((tech) => tech.active);
  const loads = technicianLoad(
    activeTechnicians.map((tech) => tech.name),
    workOrders,
    startOfMonth(now),
    now
  );

  return (
    <>
      <PageHeader
        title="Technicians"
        description="The provider's staff, shared across every fleet client — roster, load, and variance against the catalogue's own estimate."
        actions={<TechnicianFormDialog />}
      />

      <section className="card-raised">
        <header className="px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold tracking-tight">Roster</h3>
        </header>
        <div className="divide-y divide-border border-t border-border">
          {technicians.map((technician) => (
            <div
              key={technician.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium">{technician.name}</span>
                  {!technician.active ? <Badge tone="outline">Inactive</Badge> : null}
                </span>
                <p className="mt-0.5 text-2xs text-subtle-foreground">
                  {specialtyLabel(technician.specialty)}
                  {technician.homeBayId
                    ? ` · ${BAY_BY_ID.get(technician.homeBayId)?.name ?? "Unassigned bay"}`
                    : ""}
                </p>
              </div>
              <span className="inline-flex items-center gap-1">
                <TechnicianFormDialog technician={technician} />
                {can("settings:manage") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${technician.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove "${technician.name}" from the roster? Past work orders keep their record of who did the job.`
                        )
                      ) {
                        deleteTechnician(technician.id);
                      }
                    }}
                  >
                    <Trash2 className="text-critical" />
                  </Button>
                ) : (
                  <DeniedAction reason={reason("settings:manage")}>
                    <Button variant="ghost" size="sm" aria-label={`Remove ${technician.name}`}>
                      <Trash2 />
                    </Button>
                  </DeniedAction>
                )}
              </span>
            </div>
          ))}
          {technicians.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-subtle-foreground">
              No technicians yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="card-raised mt-5">
        <header className="px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold tracking-tight">Load &amp; variance</h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            Who is on what, and how the floor&apos;s time compares to the
            catalogue&apos;s own estimate. Inactive technicians are not shown.
          </p>
        </header>
        <div className="overflow-x-auto border-t border-border">
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
                const tech = activeTechnicians.find((t) => t.name === load.name);
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
                        {tech ? specialtyLabel(tech.specialty) : "—"}
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
              {loads.length === 0 ? (
                <tr>
                  <td
                    colSpan={HEADINGS.length}
                    className="px-4 py-6 text-center text-xs text-subtle-foreground"
                  >
                    No active technicians to report on.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 max-w-2xl text-2xs leading-relaxed text-subtle-foreground">
        Variance compares recorded bay time against the service catalogue&apos;s
        estimate for the same work. It is a prompt, not a score — a technician
        who consistently runs long may simply be the one handed the worst
        vehicles, and the number cannot tell you which.
      </p>
    </>
  );
}
