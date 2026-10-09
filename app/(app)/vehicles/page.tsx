"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Car, LayoutGrid, List, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { VehicleTable } from "@/components/vehicles/vehicle-table";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { VehicleFormDialog } from "@/components/vehicles/vehicle-form-dialog";
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
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { useAllVehicles, useVehiclePage } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { PmsStatus } from "@/types";

type PmsFilter = PmsStatus | "all" | "stale";

function VehiclesView() {
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [pms, setPms] = useState<PmsFilter>(
    (searchParams.get("pms") as PmsFilter | null) ?? "all"
  );
  const [department, setDepartment] = useState("all");
  const [layout, setLayout] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filters, the PMS band, staleness and "least healthy first" are the API's.
  const { data, error, refetch, isPlaceholderData } = useVehiclePage({
    page,
    per_page: pageSize,
    search: query.trim() || undefined,
    pms: pms === "all" ? undefined : pms,
    department: department === "all" ? undefined : department,
    sort: "health",
  });
  // Department options come from the fleet's own records (presentational).
  const { vehicles: allVehicles } = useAllVehicles();
  const departments = useMemo(
    () => [...new Set(allVehicles.map((vehicle) => vehicle.department).filter(Boolean))].sort(),
    [allVehicles]
  );

  // A narrower filter starts again from the first page.
  useEffect(() => setPage(1), [query, pms, department, pageSize]);

  const filtered = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  if (!data) {
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
        {total} {total === 1 ? "vehicle" : "vehicles"}{allVehicles.length ? ` of ${allVehicles.length}` : ""}, least healthy first.
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
        <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", isPlaceholderData && "opacity-70")}>
          {filtered.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      ) : (
        <div className={cn("card-raised", isPlaceholderData && "opacity-70")}>
          <VehicleTable vehicles={filtered} />
        </div>
      )}

      <div className="mt-4">
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / pageSize))}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </>
  );
}

export default function VehiclesPage() {
  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Every unit in the fleet with its current odometer, operational state, and nearest service interval."
        actions={
          <>
            <VehicleFormDialog />
            <NewWorkOrderDialog />
          </>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <VehiclesView />
      </Suspense>
    </>
  );
}
