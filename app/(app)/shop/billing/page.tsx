"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DeniedAction } from "@/components/auth/denied-action";
import { useBillingActions, useBillingQueue } from "@/lib/receivables";
import { useCan } from "@/lib/rbac";
import { useFleetClients } from "@/lib/store";
import { formatDate, formatPesos, manilaDateOf } from "@/lib/utils";
import type { WorkOrder } from "@/types";

/**
 * The billing queue: closed jobs no invoice carries yet, oldest finished
 * first (`GET /billing/queue`). Pick one account's jobs and invoice them
 * together: the API raises a draft that bills each approved line at the
 * amount the customer approved. A job settled before invoicing existed is
 * never listed.
 */
export default function BillingQueuePage() {
  const router = useRouter();
  const [account, setAccount] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const { data, error, isSuccess, refetch } = useBillingQueue({ page, per_page: pageSize, ...(account !== "all" ? { customer_account_id: account } : {}) });
  const { fleetClients, clientName } = useFleetClients();
  const { invoiceJobs } = useBillingActions();
  const { canAsStaff, staffReason, can, reason, side } = useCan();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [account, pageSize]);

  const groups = React.useMemo(() => {
    const map = new Map<string, WorkOrder[]>();
    for (const order of data?.data ?? []) {
      const list = map.get(order.fleetClientId) ?? [];
      list.push(order);
      map.set(order.fleetClientId, list);
    }
    return [...map.entries()];
  }, [data]);

  if (side === "staff" && !can("billing:view")) {
    return (
      <div className="card">
        <EmptyState icon={Banknote} title="Billing isn't open to this role" description={reason("billing:view")} />
      </div>
    );
  }
  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  const selectedOrders = (data?.data ?? []).filter((o) => selected.includes(o.id));
  const selectedAccount = selectedOrders[0]?.fleetClientId ?? null;

  function toggle(order: WorkOrder) {
    setMessage(null);
    setSelected((current) => {
      if (current.includes(order.id)) return current.filter((id) => id !== order.id);
      // One invoice bills one account in one branch: picking another account starts over.
      const keep = (data?.data ?? []).filter((o) => current.includes(o.id) && o.fleetClientId === order.fleetClientId && o.branchId === order.branchId).map((o) => o.id);
      return [...keep, order.id];
    });
  }

  async function invoiceSelected() {
    setPending(true);
    setMessage(null);
    const result = await invoiceJobs(selected);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    router.push(`/invoices/${result.data.id}`);
  }

  const invoiceButton = (
    <Button variant="primary" disabled={selected.length === 0 || pending} onClick={() => void invoiceSelected()}>
      <FileText />
      {pending ? "Raising…" : selected.length > 0 ? `Invoice ${selected.length} ${selected.length === 1 ? "job" : "jobs"}` : "Invoice selected"}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Billing queue"
        description="Finished jobs that no invoice carries yet. Select an account's jobs to raise one invoice for them; it opens as a draft you can check before issuing."
        actions={canAsStaff("billing:manage") ? invoiceButton : <DeniedAction reason={staffReason("billing:manage")}>{invoiceButton}</DeniedAction>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger aria-label="Account" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every account</SelectItem>
            {fleetClients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedAccount ? (
          <p className="text-xs text-muted-foreground">
            {selected.length} selected for {clientName(selectedAccount)}
          </p>
        ) : null}
      </div>

      {message ? (
        <p role="alert" className="mb-4 rounded-lg border border-critical/25 bg-critical/10 px-4 py-2 text-xs text-critical">
          {message}
        </p>
      ) : null}

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState icon={Banknote} title="Nothing waiting to be billed" description="Every finished job is on an invoice." />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([accountId, orders]) => (
            <section key={accountId} className="card-raised" aria-label={clientName(accountId)}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold">{clientName(accountId)}</h2>
                <p className="text-2xs text-subtle-foreground">
                  {orders.length} {orders.length === 1 ? "job" : "jobs"} · {formatPesos(orders.reduce((sum, o) => sum + o.approvedTotals.grandTotal, 0))} approved
                </p>
              </header>
              <table className="w-full text-left text-xs">
                <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
                  <tr>
                    <th className="w-10 px-5 py-2">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Finished</th>
                    <th className="px-3 py-2 font-medium">Vehicle handed back</th>
                    <th className="px-5 py-2 text-right font-medium">Approved total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-5 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${order.displayReference}`}
                         
                          checked={selected.includes(order.id)}
                          onChange={() => toggle(order)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/work-orders/${order.id}`} className="tabular font-medium hover:text-brand">
                          {order.displayReference}
                        </Link>
                        <span className="ml-2 text-muted-foreground">{order.title}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{order.completedOn ? formatDate(order.completedOn) : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{order.releasedAt ? formatDate(manilaDateOf(order.releasedAt)) : "Still at the shop"}</td>
                      <td className="tabular px-5 py-2 text-right">{formatPesos(order.approvedTotals.grandTotal)}</td>
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
