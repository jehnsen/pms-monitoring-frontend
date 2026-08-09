"use client";

import { useMemo, useState } from "react";
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
import { useFleet } from "@/lib/store";
import { BAYS, bayName } from "@/lib/bays";
import {
  elapsedMinutes,
  formatDuration,
  isActiveJob,
  authorisedValue,
} from "@/lib/shop";
import { cn, formatCurrency } from "@/lib/utils";
import type { WorkOrder, WorkOrderStatus } from "@/types";

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
  const { ready, workOrders, vehiclesById, fleetClients, technicians } = useFleet();

  const [query, setQuery] = useState("");
  const [technician, setTechnician] = useState("all");
  const [bay, setBay] = useState("all");
  const [client, setClient] = useState("all");
  const [status, setStatus] = useState<WorkOrderStatus | "all">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const now = new Date();

  const clientNameFor = useMemo(() => {
    const byId = new Map(fleetClients.map((c) => [c.id, c.name]));
    return (vehicleId: string) => {
      const vehicle = vehiclesById.get(vehicleId);
      return vehicle ? (byId.get(vehicle.fleetClientId) ?? "—") : "—";
    };
  }, [fleetClients, vehiclesById]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return workOrders
      .filter((order) => {
        if (!isActiveJob(order)) return false;
        if (status !== "all" && order.status !== status) return false;
        if (technician !== "all" && order.technician !== technician) return false;
        if (bay !== "all" && (order.bayId ?? "none") !== bay) return false;
        if (client !== "all") {
          const vehicle = vehiclesById.get(order.vehicleId);
          if (!vehicle || vehicle.fleetClientId !== client) return false;
        }
        if (!q) return true;
        const vehicle = vehiclesById.get(order.vehicleId);
        return `${order.reference} ${order.title} ${vehicle?.plateNumber ?? ""} ${clientNameFor(order.vehicleId)} ${order.technician}`
          .toLowerCase()
          .includes(q);
      })
      // Started jobs first, then whatever is booked soonest — the order the
      // floor actually works in.
      .sort((a, b) => {
        const aRunning = a.status === "in_progress" ? 0 : 1;
        const bRunning = b.status === "in_progress" ? 0 : 1;
        if (aRunning !== bRunning) return aRunning - bRunning;
        return a.scheduledFor.localeCompare(b.scheduledFor);
      });
  }, [workOrders, vehiclesById, query, technician, bay, client, status, clientNameFor]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", orders: rows }];

    const map = new Map<string, WorkOrder[]>();
    for (const order of rows) {
      const key =
        groupBy === "technician" ? order.technician : bayName(order.bayId);
      const list = map.get(key) ?? [];
      list.push(order);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, orders]) => ({ key, label: key, orders }));
  }, [rows, groupBy]);

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

  const totalValue = rows.reduce((total, order) => total + authorisedValue(order), 0);

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
                <SelectItem key={tech.id} value={tech.name}>
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
            {BAYS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
            <SelectItem value="none">Out-sourced</SelectItem>
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
        {rows.length} active {rows.length === 1 ? "job" : "jobs"} ·{" "}
        {formatCurrency(totalValue)} of authorised work on the floor.
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
                      const vehicle = vehiclesById.get(order.vehicleId);
                      const minutes = elapsedMinutes(order, now);
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
                              {order.reference}
                            </Link>
                          </td>
                          <td className="max-w-[160px] truncate px-4 py-3 text-xs text-muted-foreground">
                            {clientNameFor(order.vehicleId)}
                          </td>
                          <td className="tabular whitespace-nowrap px-4 py-3 text-xs">
                            {vehicle?.plateNumber ?? "—"}
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3 text-xs">
                            {order.title}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {order.technician}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {bayName(order.bayId)}
                          </td>
                          <td className="px-4 py-3">
                            <WorkOrderStatusBadge status={order.status} />
                          </td>
                          <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {formatDuration(minutes)}
                          </td>
                          <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                            {formatCurrency(authorisedValue(order))}
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
