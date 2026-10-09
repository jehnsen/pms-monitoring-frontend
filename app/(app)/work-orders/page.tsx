"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WorkOrderTable } from "@/components/work-orders/work-order-table";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/ui/query-error";
import { useAllVehicles, useWorkOrderPage, useWorkOrderSummary, type WorkOrderQuery } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import type { WorkOrderType } from "@/types";

type Bucket = "active" | "completed" | "cancelled" | "all";

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const DEFAULT_PAGE_SIZE = 25;

export default function WorkOrdersPage() {
  const [bucket, setBucket] = useState<Bucket>("active");
  const [type, setType] = useState<WorkOrderType | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Buckets, search (reference, title, technician, vendor, plate, customer),
  // ordering, counts and the filtered value are all the API's.
  const filters: WorkOrderQuery = {
    stage: bucket === "all" ? undefined : bucket,
    type: type === "all" ? undefined : type,
    q: query.trim() || undefined,
    sort: bucket === "completed" ? "completed" : "scheduled",
  };
  const { data, error, refetch } = useWorkOrderPage({ ...filters, page, per_page: pageSize });
  const { data: summary } = useWorkOrderSummary(filters);
  const { vehiclesById } = useAllVehicles();
  const ready = Boolean(data);
  const counts = summary?.buckets ?? { active: 0, completed: 0, cancelled: 0, all: 0 };
  const total = data?.meta.total ?? 0;

  // A changed filter can leave `page` pointing past the new, shorter result
  // set — jump back to the first page rather than render an empty table with
  // rows the user knows exist.
  useEffect(() => {
    setPage(1);
  }, [bucket, type, query]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

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
            {summary?.filtered.count ?? total} {(summary?.filtered.count ?? total) === 1 ? "order" : "orders"} ·{" "}
            {formatCurrency(summary?.filtered.value ?? 0)} total value
          </p>

          <div className="card-raised">
            <WorkOrderTable
              orders={data?.data ?? []}
              vehiclesById={vehiclesById}
              emptyTitle="No work orders here"
              emptyDescription="Nothing matches this combination of filters."
            />
            <div className="px-4 pb-3">
              <Pagination
                page={page}
                pageCount={pageCount}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
