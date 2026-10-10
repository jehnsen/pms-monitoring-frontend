"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Gauge, HeartPulse, Plus, Wallet, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatDay } from "@/components/detailing/booking-status";
import { HealthScore, ServiceBadge, ServiceMeter, ToolStatusBadge, formatHours } from "@/components/equipment/equipment-chips";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useEquipmentBoard } from "@/lib/equipment";
import { useCan } from "@/lib/rbac";
import { cn, formatPesos } from "@/lib/utils";

type Filter = "all" | "attention" | "untracked";

/**
 * The health board: every tool on the detailing floor with where it
 * stands in its service interval, when the next service is forecast, how much
 * of its rated life is spent and its health score. All of it is the API's,
 * derived from completed jobs and the usage log each time the page loads.
 */
export default function EquipmentBoardPage() {
  const { data, error, isSuccess, refetch } = useEquipmentBoard();
  const { can, reason } = useCan();
  const manages = can("equipment:manage");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [adding, setAdding] = React.useState(false);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  const add = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      <Plus />
      Register a tool
    </Button>
  );
  const tools = (data?.tools ?? []).filter((tool) =>
    filter === "all" ? true : filter === "untracked" ? tool.report.service === null : tool.report.service?.level === "overdue" || tool.report.service?.level === "due_soon" || tool.status === "repair" || tool.status === "maintenance"
  );

  return (
    <>
      <PageHeader
        title="Equipment health board"
        description="The floor's tools: service status, forecast, life and health. Runtime comes from completed jobs and the usage log, never from a typed-in meter."
        actions={manages ? add : <DeniedAction reason={reason("equipment:manage")}>{add}</DeniedAction>}
      />

      {!isSuccess ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Tools in service" value={`${data.summary.active} of ${data.summary.total}`} icon={Gauge} hint={`${data.summary.untracked} with no service interval`} />
            <StatTile
              label="Service due"
              value={String(data.summary.overdue + data.summary.dueSoon)}
              icon={AlertTriangle}
              tone={data.summary.overdue > 0 ? "critical" : data.summary.dueSoon > 0 ? "warning" : "ok"}
              hint={`${data.summary.overdue} overdue, ${data.summary.dueSoon} due soon; ${data.summary.down} down`}
            />
            <StatTile label="Average health" value={data.summary.avgHealth === null ? "—" : `${data.summary.avgHealth} / 100`} icon={HeartPulse} hint={`${data.summary.replaceWatch} near the end of rated life`} />
            <StatTile label="Asset value" value={formatPesos(data.summary.assetValue)} icon={Wallet} hint={`${formatPesos(data.summary.maintenanceSpend)} spent on maintenance`} />
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter tools">
            {(
              [
                ["all", "All tools"],
                ["attention", "Needs attention"],
                ["untracked", "Not tracked"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn("rounded-full border px-3 py-1 text-xs transition-colors", filter === value ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2")}
              >
                {label}
              </button>
            ))}
          </div>

          {tools.length === 0 ? (
            <div className="card">
              <EmptyState icon={Wrench} title={data.tools.length === 0 ? "No tools registered yet" : "Nothing here"} description={data.tools.length === 0 ? "Register the floor's first tool to start monitoring it." : "No tool matches this filter."} />
            </div>
          ) : (
            <section className="card-raised overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Tool</th>
                    <th scope="col" className="px-3 py-3 font-medium">Status</th>
                    <th scope="col" className="px-3 py-3 font-medium">Service</th>
                    <th scope="col" className="px-3 py-3 font-medium">Interval used</th>
                    <th scope="col" className="px-3 py-3 font-medium">Next service</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Runtime</th>
                    <th scope="col" className="px-5 py-3 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tools.map((tool) => (
                    <tr key={tool.id} className="hover:bg-surface-2/60">
                      <td className="px-5 py-3">
                        <Link href={`/shop/equipment/${tool.id}`} className="font-medium text-brand hover:underline">
                          {tool.name}
                        </Link>
                        <p className="text-2xs text-subtle-foreground">{[tool.categoryLabel, tool.brand].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="px-3 py-3">
                        <ToolStatusBadge tool={tool} />
                      </td>
                      <td className="px-3 py-3">
                        <ServiceBadge service={tool.report.service} />
                      </td>
                      <td className="px-3 py-3">
                        <ServiceMeter service={tool.report.service} />
                      </td>
                      <td className="px-3 py-3">
                        {tool.report.forecast ? (tool.report.forecast.days <= 0 ? "Now" : formatDay(tool.report.forecast.dueOn)) : <span className="text-subtle-foreground">{tool.report.service ? "Idle: no forecast" : "—"}</span>}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        {tool.countUnit === "cups" ? `${tool.report.lifetime.cycles.toLocaleString("en-PH")} cups` : formatHours(tool.report.lifetime.hours)}
                        {tool.report.life ? <p className="text-2xs text-subtle-foreground">{tool.report.life.levelLabel}</p> : null}
                      </td>
                      <td className="px-5 py-3">
                        <HealthScore health={tool.report.health} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {adding ? <EquipmentFormDialog tool={null} onClose={() => setAdding(false)} /> : null}
    </>
  );
}
