"use client";

import { useMemo, useState } from "react";
import { differenceInMinutes, parseISO } from "date-fns";
import Link from "next/link";
import { ClipboardList, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { WorkOrderStatusBadge } from "@/components/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/ui/query-error";
import { useAllVehicles, useBays, useFleetClients, useTechnicians, useWorkOrderPage, useWorkOrderSummary, type WorkOrderQuery } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";
import type { WorkOrder, WorkOrderStatus } from "@/types";

/** Time on the job since its start event — wording only ("2h 15m"). */
function elapsed(order: WorkOrder, now: Date): string {
  if (order.status !== "in_progress") return "—";
  const started = [...order.history].reverse().find((event) => event.status === "in_progress");
  if (!started) return "—";
  const minutes = Math.max(0, differenceInMinutes(now, parseISO(started.at)));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** What the customer authorised: the approved lines, or the job total when it has none. */
function authorised(order: WorkOrder): number {
  return order.lines.length > 0 ? order.approval.approvedValue : order.totals.subTotal;
}

type GroupBy = "none" | "technician" | "bay";

const STATUS_OPTIONS: { value: WorkOrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "partially_approved", label: "Partially approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "draft", label: "Draft" },
];

export default function ShopQueuePage() {
  const { fleetClients, clientName } = useFleetClients();
  const { technicians } = useTechnicians();
  const { bays, bayName } = useBays();
  const { vehiclesById } = useAllVehicles();

  const [query, setQuery] = useState("");
  const [technician, setTechnician] = useState("all");
  const [bay, setBay] = useState("all");
  const [client, setClient] = useState("all");
  const [status, setStatus] = useState<WorkOrderStatus | "all">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const now = new Date();

  // Active jobs, filtered and in floor order (running first, then soonest
  // booked) by the API: `GET /work-orders?stage=active&sort=queue`.
  const filters: WorkOrderQuery = {
    stage: "active",
    sort: "queue",
    q: query.trim() || undefined,
    technician_id: technician === "all" ? undefined : technician,
    bay_id: bay === "all" ? undefined : bay,
    customer_account_id: client === "all" ? undefined : client,
    status: status === "all" ? undefined : [status],
  };
  const { data, error, refetch } = useWorkOrderPage({ ...filters, per_page: 100 });
  const { data: summary } = useWorkOrderSummary(filters);
  const rows = useMemo(() => data?.data ?? [], [data]);
  const ready = Boolean(data);
  const clientNameFor = (order: WorkOrder) => order.customerName ?? clientName(order.fleetClientId);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", orders: rows }];

    const map = new Map<string, WorkOrder[]>();
    for (const order of rows) {
      const key = groupBy === "technician" ? order.technician || "Unassigned" : bayName(order.bayId);
      const list = map.get(key) ?? [];
      list.push(order);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, orders]) => ({ key, label: key, orders }));
  }, [rows, groupBy, bayName]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Job queue"
          description="Every active job on the floor, across all clients."
        />
        <Skeleton className="h-96" />
      </>
    );
  }


  return (
    <>
      <PageHeader
        title="Job queue"
        description="Every active job on the floor, across all clients."
      />

      {/* One filter row above everything it scopes. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reference, plate, job, or client…"
            className="pl-9"
            aria-label="Search the job queue"
          />
        </div>

        <Select value={client} onValueChange={setClient}>
          <SelectTrigger className="w-[176px]" aria-label="Filter by client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {fleetClients.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={technician} onValueChange={setTechnician}>
          <SelectTrigger className="w-[168px]" aria-label="Filter by technician">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All technicians</SelectItem>
            {technicians
              .filter((tech) => tech.active)
              .map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>
                  {tech.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={bay} onValueChange={setBay}>
          <SelectTrigger className="w-[140px]" aria-label="Filter by bay">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bays</SelectItem>
            {bays.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as WorkOrderStatus | "all")}
        >
          <SelectTrigger className="w-[172px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5">
          {(
            [
              { value: "none", label: "Flat" },
              { value: "technician", label: "By tech" },
              { value: "bay", label: "By bay" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              onClick={() => setGroupBy(option.value)}
              aria-pressed={groupBy === option.value}
              className={cn(
                "rounded px-2.5 py-1.5 text-xs transition-colors",
                groupBy === option.value
                  ? "bg-surface font-medium text-foreground shadow-xs"
                  : "text-subtle-foreground hover:text-muted-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-subtle-foreground">
        {data?.meta.total ?? rows.length} active {(data?.meta.total ?? rows.length) === 1 ? "job" : "jobs"} ·{" "}
        {formatCurrency(summary?.filtered.value ?? 0)} of work in the queue.
      </p>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title="No jobs match those filters"
            description="Try clearing the search or widening the status."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setClient("all");
                  setTechnician("all");
                  setBay("all");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} className="card-raised">
              {group.label ? (
                <header className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-4">
                  <h3 className="text-sm font-semibold tracking-tight">
                    {group.label}
                  </h3>
                  <span className="tabular text-2xs text-subtle-foreground">
                    {group.orders.length}{" "}
                    {group.orders.length === 1 ? "job" : "jobs"}
                  </span>
                </header>
              ) : null}

              <div className={cn("overflow-x-auto", group.label && "border-t border-border")}>
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {[
                        "Reference",
                        "Client",
                        "Vehicle",
                        "Job",
                        "Technician",
                        "Bay",
                        "Status",
                        "Elapsed",
                        "Value",
                      ].map((heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className={cn(
                            "whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground",
                            heading === "Value" && "text-right"
                          )}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.orders.map((order) => {
                      const vehicle = order.vehicle ?? vehiclesById.get(order.vehicleId);
                      return (
                        <tr
                          key={order.id}
                          className="transition-colors hover:bg-surface-2/50"
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            <Link
                              href={`/work-orders/${order.id}`}
                              className="text-xs font-medium transition-colors hover:text-brand"
                            >
                              {order.displayReference}
                            </Link>
                          </td>
                          <td className="max-w-[160px] truncate px-4 py-3 text-xs text-muted-foreground">
                            {clientNameFor(order)}
                          </td>
                          <td className="tabular whitespace-nowrap px-4 py-3 text-xs">
                            {vehicle?.plateNumber ?? "—"}
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3 text-xs">
                            {order.title}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {order.technician || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {bayName(order.bayId)}
                          </td>
                          <td className="px-4 py-3">
                            <WorkOrderStatusBadge status={order.status} />
                          </td>
                          <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {elapsed(order, now)}
                          </td>
                          <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                            {formatCurrency(authorised(order))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
