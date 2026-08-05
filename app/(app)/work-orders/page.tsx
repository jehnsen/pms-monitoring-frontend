"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WorkOrderTable } from "@/components/work-orders/work-order-table";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFleet } from "@/lib/store";
import { workOrderCost } from "@/lib/pms";
import { formatCurrency } from "@/lib/utils";
import type { WorkOrderType } from "@/types";

type Bucket = "active" | "completed" | "cancelled" | "all";

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export default function WorkOrdersPage() {
  const { ready, workOrders, vehicles } = useFleet();
  const [bucket, setBucket] = useState<Bucket>("active");
  const [type, setType] = useState<WorkOrderType | "all">("all");
  const [query, setQuery] = useState("");

  const vehiclesById = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v])),
    [vehicles]
  );

  const counts = useMemo(() => {
    const active = workOrders.filter(
      (o) => o.status !== "completed" && o.status !== "cancelled"
    ).length;
    return {
      active,
      completed: workOrders.filter((o) => o.status === "completed").length,
      cancelled: workOrders.filter((o) => o.status === "cancelled").length,
      all: workOrders.length,
    };
  }, [workOrders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return workOrders
      .filter((order) => {
        if (bucket === "active")
          if (order.status === "completed" || order.status === "cancelled")
            return false;
        if (bucket === "completed" && order.status !== "completed") return false;
        if (bucket === "cancelled" && order.status !== "cancelled") return false;
        if (type !== "all" && order.type !== type) return false;
        if (!q) return true;

        const vehicle = vehiclesById.get(order.vehicleId);
        return `${order.reference} ${order.title} ${order.technician} ${order.vendor} ${vehicle?.plateNumber ?? ""}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        bucket === "completed"
          ? (b.completedOn ?? "").localeCompare(a.completedOn ?? "")
          : a.scheduledFor.localeCompare(b.scheduledFor)
      );
  }, [workOrders, bucket, type, query, vehiclesById]);

  const filteredValue = filtered.reduce(
    (total, order) => total + workOrderCost(order),
    0
  );

  return (
    <>
      <PageHeader
        title="Work orders"
        description="Every preventive, corrective, and inspection job raised against the fleet."
        actions={<NewWorkOrderDialog />}
      />

      {!ready ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Tabs value={bucket} onValueChange={(value) => setBucket(value as Bucket)}>
              <TabsList>
                {BUCKETS.map((entry) => (
                  <TabsTrigger key={entry.value} value={entry.value}>
                    {entry.label}
                    <span className="tabular ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">
                      {counts[entry.value]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reference, job, or plate…"
                className="pl-9"
                aria-label="Search work orders"
              />
            </div>

            <Select
              value={type}
              onValueChange={(value) => setType(value as WorkOrderType | "all")}
            >
              <SelectTrigger className="w-[168px]" aria-label="Filter by job type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All job types</SelectItem>
                <SelectItem value="preventive">Preventive</SelectItem>
                <SelectItem value="corrective">Corrective</SelectItem>
                <SelectItem value="inspection">Inspection</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="mb-4 text-xs text-subtle-foreground">
            {filtered.length} {filtered.length === 1 ? "order" : "orders"} ·{" "}
            {formatCurrency(filteredValue)} total value
          </p>

          <div className="card-raised">
            <WorkOrderTable
              orders={filtered}
              vehiclesById={vehiclesById}
              emptyTitle="No work orders here"
              emptyDescription="Nothing matches this combination of filters."
            />
          </div>
        </>
      )}
    </>
  );
}
