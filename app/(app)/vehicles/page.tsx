"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Car, LayoutGrid, List, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { VehicleTable } from "@/components/vehicles/vehicle-table";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFleet } from "@/lib/store";
import { isOdometerStale } from "@/lib/pms";
import { cn } from "@/lib/utils";
import type { PmsStatus } from "@/types";

type PmsFilter = PmsStatus | "all" | "stale";

function VehiclesView() {
  const { ready, health } = useFleet();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [pms, setPms] = useState<PmsFilter>(
    (searchParams.get("pms") as PmsFilter | null) ?? "all"
  );
  const [department, setDepartment] = useState("all");
  const [layout, setLayout] = useState<"grid" | "table">("grid");

  const departments = useMemo(
    () => [...new Set(health.map((entry) => entry.vehicle.department))].sort(),
    [health]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return health
      .filter((entry) => {
        if (pms === "stale" && !isOdometerStale(entry.vehicle)) return false;
        if (pms !== "all" && pms !== "stale" && entry.status !== pms) return false;
        if (department !== "all" && entry.vehicle.department !== department)
          return false;
        if (!q) return true;
        const v = entry.vehicle;
        return `${v.plateNumber} ${v.make} ${v.model} ${v.assignedTo} ${v.location}`
          .toLowerCase()
          .includes(q);
      })
      // Worst first — the list should open on the vehicles that need work.
      .sort((a, b) => a.healthScore - b.healthScore);
  }, [health, query, pms, department]);

  if (!ready) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-64" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* One filter row above everything it scopes. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plate, model, driver, or site…"
            className="pl-9"
            aria-label="Search vehicles"
          />
        </div>

        <Select
          value={pms}
          onValueChange={(value) => setPms(value as PmsFilter)}
        >
          <SelectTrigger className="w-[168px]" aria-label="Filter by PMS status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All PMS states</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="due_soon">Due soon</SelectItem>
            <SelectItem value="ok">On schedule</SelectItem>
            <SelectItem value="stale">Stale odometer</SelectItem>
          </SelectContent>
        </Select>

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[184px]" aria-label="Filter by department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5">
          {(
            [
              { value: "grid", icon: LayoutGrid, label: "Card view" },
              { value: "table", icon: List, label: "Table view" },
            ] as const
          ).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setLayout(value)}
              aria-pressed={layout === value}
              title={label}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded transition-colors",
                layout === value
                  ? "bg-surface text-foreground shadow-xs"
                  : "text-subtle-foreground hover:text-muted-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-subtle-foreground">
        Showing {filtered.length} of {health.length} vehicles, least healthy first.
      </p>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Car}
            title="No vehicles match those filters"
            description="Try widening the PMS state or clearing the search."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setPms("all");
                  setDepartment("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : layout === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <VehicleCard key={entry.vehicle.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="card-raised">
          <VehicleTable entries={filtered} />
        </div>
      )}
    </>
  );
}

export default function VehiclesPage() {
  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Every unit in the fleet with its current odometer, operational state, and nearest service interval."
        actions={<NewWorkOrderDialog />}
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <VehiclesView />
      </Suspense>
    </>
  );
}
