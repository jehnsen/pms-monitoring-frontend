"use client";

import * as React from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeniedAction } from "@/components/auth/denied-action";
import { TechnicianFormDialog } from "@/components/settings/technician-form-dialog";
import { QueryError } from "@/components/ui/query-error";
import { useBays, useFleetActions, useShopTechnicians, useTechnicians, useWorkOrderPage } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import { differenceInMinutes, parseISO } from "date-fns";
import type { WorkOrder } from "@/types";

/** Time on the job since its start event — wording only. */
function elapsed(order: WorkOrder, now: Date): string {
  const started = [...order.history].reverse().find((event) => event.status === "in_progress");
  if (!started) return "—";
  const minutes = Math.max(0, differenceInMinutes(now, parseISO(started.at)));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
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

/** A technician's `specialty` is free text, not the `TaskCategory` union. */
function specialtyLabel(specialty: string): string {
  if (specialty === "general") return "General";
  return CATEGORY_LABEL[specialty as keyof typeof CATEGORY_LABEL] ?? specialty;
}

export default function ShopTechniciansPage() {
  const { technicians, isSuccess: rosterReady } = useTechnicians();
  // Load, closed this period, actual vs estimated hours and variance: the API's.
  const { data: loads, error, refetch } = useShopTechnicians();
  const { data: running } = useWorkOrderPage({ status: ["in_progress"], per_page: 100 });
  const { bayName } = useBays();
  const { deleteTechnician } = useFleetActions();
  const { canAsStaff, staffReason } = useCan();
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const ready = rosterReady && Boolean(loads);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  if (!ready || !loads) {
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
  const runningById = new Map((running?.data ?? []).map((order) => [order.id, order]));

  return (
    <>
      <PageHeader
        title="Technicians"
        description="The provider's staff, shared across every fleet client — roster, load, and variance against the catalogue's own estimate."
        actions={<TechnicianFormDialog />}
      />

      {deleteError ? (
        <p role="alert" className="mb-5 rounded-lg border border-critical/25 bg-critical/[0.06] px-4 py-3 text-xs text-critical">
          {deleteError}
        </p>
      ) : null}

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
                    ? ` · ${bayName(technician.homeBayId)}`
                    : ""}
                </p>
              </div>
              <span className="inline-flex items-center gap-1">
                <TechnicianFormDialog technician={technician} />
                {canAsStaff("settings:manage") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${technician.name}`}
                    onClick={async () => {
                      if (
                        window.confirm(
                          `Remove "${technician.name}" from the roster? Past work orders keep their record of who did the job.`
                        )
                      ) {
                        setDeleteError(null);
                        const result = await deleteTechnician(technician.id);
                        if (!result.ok) setDeleteError(`${technician.name}: ${result.error}`);
                      }
                    }}
                  >
                    <Trash2 className="text-critical" />
                  </Button>
                ) : (
                  <DeniedAction reason={staffReason("settings:manage")}>
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
                const tech = activeTechnicians.find((t) => t.id === load.technicianId);
                const current = load.currentWorkOrderId ? runningById.get(load.currentWorkOrderId) : undefined;
                const variance = load.variancePct;

                return (
                  <tr key={load.technicianId} className="transition-colors hover:bg-surface-2/50">
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
                      {load.currentWorkOrderId ? (
                        <>
                          <Link
                            href={`/work-orders/${load.currentWorkOrderId}`}
                            className="block truncate text-xs font-medium transition-colors hover:text-brand"
                          >
                            {current?.vehicle?.plateNumber ?? current?.displayReference ?? "Current job"}
                          </Link>
                          <span className="tabular block text-2xs text-subtle-foreground">
                            {current ? `${current.title} · ${elapsed(current, now)}` : ""}
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
