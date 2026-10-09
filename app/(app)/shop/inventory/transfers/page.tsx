"use client";

import * as React from "react";
import { ArrowLeftRight, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { DeniedAction } from "@/components/auth/denied-action";
import { useBranchName } from "@/components/inventory/branch-field";
import { TransferDialog } from "@/components/inventory/transfer-dialog";
import { useInventoryActions, useStockTransferPage } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";
import { formatDate, formatPesos, formatQuantity } from "@/lib/utils";

/** Transfers between branches: one document per transfer, undone only by reversing it. */
export default function TransfersPage() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const { data, error, isSuccess, refetch } = useStockTransferPage({ page, per_page: pageSize });
  const { reverseTransfer } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const branchName = useBranchName();
  const [reverseError, setReverseError] = React.useState<string | null>(null);

  React.useEffect(() => setPage(1), [pageSize]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader
        title="Transfers"
        description="Stock moved between branches. Each transfer is one document with both moves; value travels with the goods, at the source's average cost."
        actions={<TransferDialog />}
      />

      {reverseError ? (
        <p role="alert" className="mb-4 rounded-lg border border-critical/25 bg-critical/[0.06] px-4 py-3 text-xs text-critical">
          {reverseError}
        </p>
      ) : null}

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={ArrowLeftRight} title="No transfers yet" description="Move stock from one branch to another when a shelf runs short." action={<TransferDialog />} />
        </div>
      ) : (
        <div className="space-y-4">
          {data.data.map((transfer) => (
            <section key={transfer.id} className="card-raised" aria-label={transfer.reference}>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="tabular">{transfer.reference}</span>
                    {transfer.reversesTransferId ? <Badge tone="outline">Reversal</Badge> : null}
                    {transfer.reversedByTransferId ? <Badge tone="neutral">Reversed</Badge> : null}
                  </p>
                  <p className="text-2xs text-subtle-foreground">
                    {branchName(transfer.fromBranchId)} → {branchName(transfer.toBranchId)} · {formatDate(transfer.transferredOn)} · {transfer.createdByName}
                    {transfer.notes ? ` · ${transfer.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-sm font-semibold">{formatPesos(transfer.totalValue)}</span>
                  {transfer.canReverse ? (
                    canAsStaff("inventory:manage") ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!window.confirm(`Reverse ${transfer.reference}? A new transfer moves the same goods back.`)) return;
                          setReverseError(null);
                          const result = await reverseTransfer(transfer.id);
                          if (!result.ok) setReverseError(`${transfer.reference}: ${result.error}`);
                        }}
                      >
                        <Undo2 />
                        Reverse
                      </Button>
                    ) : (
                      <DeniedAction reason={staffReason("inventory:manage")}>
                        <Button variant="ghost" size="sm">
                          <Undo2 />
                          Reverse
                        </Button>
                      </DeniedAction>
                    )
                  ) : null}
                </div>
              </header>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-border">
                  {transfer.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-5 py-2">
                        {line.item.name}
                        <span className="tabular ml-2 text-2xs text-subtle-foreground">{line.item.sku}</span>
                      </td>
                      <td className="tabular px-3 py-2 text-right">
                        {formatQuantity(line.quantity)} {line.item.uom}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-muted-foreground">{formatPesos(line.unitCost)} each</td>
                      <td className="tabular px-5 py-2 text-right">{formatPesos(line.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
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
