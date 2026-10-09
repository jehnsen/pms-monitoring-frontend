"use client";

import * as React from "react";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranchName } from "@/components/inventory/branch-field";
import { CountSheetDialog, NewCountDialog } from "@/components/inventory/count-dialogs";
import { useStockCountPage } from "@/lib/inventory";
import { formatDate, formatPesos } from "@/lib/utils";

/**
 * Stock count: a sheet per location, counted quantities, then posted as
 * adjustments with a reason. Stock never changes by overwriting a quantity.
 */
export default function CountsPage() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const { data, error, isSuccess, refetch } = useStockCountPage({ page, per_page: pageSize });
  const branchName = useBranchName();

  React.useEffect(() => setPage(1), [pageSize]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader
        title="Stock count"
        description="Count what is on the shelf against what the books hold. Posting a count turns each difference into an adjustment move that carries its reason."
        actions={<NewCountDialog />}
      />

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={ClipboardCheck} title="No counts yet" description="Draw a sheet for a location to start." action={<NewCountDialog />} />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Count</th>
                <th className="px-3 py-3 font-medium">Branch</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Counted</th>
                <th className="px-3 py-3 text-right font-medium">Variances</th>
                <th className="px-3 py-3 text-right font-medium">Net value</th>
                <th className="px-5 py-3 text-right font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map((count) => (
                <tr key={count.id}>
                  <td className="px-5 py-3">
                    <span className="tabular font-medium">{count.reference}</span>
                    <p className="text-2xs text-subtle-foreground">
                      {formatDate(count.createdOn)} · {count.createdByName}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{branchName(count.branchId)}</td>
                  <td className="px-3 py-3">
                    <Badge tone={count.status === "posted" ? "ok" : count.status === "open" ? "brand" : "outline"}>
                      {count.status === "open" ? "Counting" : count.status === "posted" ? "Posted" : "Cancelled"}
                    </Badge>
                  </td>
                  <td className="tabular px-3 py-3 text-right">
                    {count.summary.countedLines} of {count.summary.lines}
                  </td>
                  <td className="tabular px-3 py-3 text-right">{count.status === "posted" ? count.summary.varianceLines : "—"}</td>
                  <td className="tabular px-3 py-3 text-right">{count.status === "posted" ? formatPesos(count.summary.netVarianceValue) : "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <CountSheetDialog count={count} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isSuccess ? (
        <Pagination
          page={data.meta.page}
          pageCount={Math.max(1, Math.ceil(data.meta.total / data.meta.per_page))}
          pageSize={data.meta.per_page}
          totalItems={data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </>
  );
}
