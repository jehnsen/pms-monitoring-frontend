"use client";

import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeniedAction } from "@/components/auth/denied-action";
import { ServiceTaskFormDialog } from "@/components/settings/service-task-form-dialog";
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { formatCurrency, formatKm } from "@/lib/utils";

/**
 * The PMS interval catalogue — provider-global, like `/shop/technicians` and
 * `/shop/vendors`, but visible on both sides of the tenancy boundary (see
 * `lib/nav.ts`'s CONFIGURE section on each): a fleet client needs to see what
 * its vehicles are measured against, even though only `settings:manage`
 * (provider admin / fleet manager) can change it. RLS on `pms_service_tasks`
 * enforces the same split independently of this page.
 *
 * Warning thresholds (`DUE_SOON_KM`/`DUE_SOON_DAYS`) stay on the Settings page
 * rather than duplicating here — they're a fleet-wide display setting, not
 * part of the catalogue itself.
 */
export default function ServiceCataloguePage() {
  const { ready, serviceTasks } = useFleet();
  const { deleteServiceTask } = useFleetActions();
  const { can, reason } = useCan();

  return (
    <>
      <PageHeader
        title="Service catalogue"
        description="The PMS schedule every vehicle is measured against. Each item is due on whichever limit arrives first."
        actions={<ServiceTaskFormDialog />}
      />

      <section className="card-raised">
        {!ready ? (
          <div className="p-5">
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {[
                    "Service item",
                    "Category",
                    "Distance",
                    "Time",
                    "Bay time",
                    "Est. cost",
                    "",
                  ].map((heading, index) => (
                    <th
                      key={heading || `action-${index}`}
                      scope="col"
                      className="whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {serviceTasks.map((task) => (
                  <tr key={task.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{task.name}</span>
                        {task.critical ? (
                          <Badge tone="outline">Safety critical</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {CATEGORY_LABEL[task.category]}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs">
                      {formatKm(task.intervalKm)}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs">
                      {task.intervalMonths} months
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {task.estimatedHours} h
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs font-medium">
                      {formatCurrency(task.estimatedCost)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <ServiceTaskFormDialog task={task} />
                        {can("settings:manage") ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${task.name}`}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove "${task.name}" from the catalogue? Vehicles keep their existing service history for it, but it will no longer be evaluated.`
                                )
                              ) {
                                deleteServiceTask(task.id);
                              }
                            }}
                          >
                            <Trash2 className="text-critical" />
                          </Button>
                        ) : (
                          <DeniedAction reason={reason("settings:manage")}>
                            <Button variant="ghost" size="sm" aria-label={`Remove ${task.name}`}>
                              <Trash2 />
                            </Button>
                          </DeniedAction>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
                {serviceTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-6 text-center text-xs text-subtle-foreground"
                    >
                      No service items yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
