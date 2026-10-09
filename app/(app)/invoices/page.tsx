"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, Download, FileText, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeniedAction } from "@/components/auth/denied-action";
import { ReasonDialog } from "@/components/inventory/reason-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BalancePanel } from "@/components/billing/balance-panel";
import { InvoiceStatusBadge } from "@/components/billing/billing-chrome";
import { useSession } from "@/lib/auth";
import { useBillingActions, useInvoicePage, usePaymentPage } from "@/lib/receivables";
import { useCan } from "@/lib/rbac";
import { useFleetClients } from "@/lib/store";
import { formatDate, formatPesos } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "Every invoice" },
  { value: "open", label: "Open (issued, not fully paid)" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Drafts" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function InvoiceList() {
  const { side } = useCan();
  const [status, setStatus] = React.useState("all");
  const [account, setAccount] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const { fleetClients } = useFleetClients({ enabled: side === "staff" });
  const { data, error, isSuccess, refetch } = useInvoicePage({
    page,
    per_page: pageSize,
    ...(status !== "all" ? { status } : {}),
    ...(account !== "all" ? { customer_account_id: account } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  });

  React.useEffect(() => setPage(1), [status, account, q, pageSize]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status" className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.filter((f) => side === "staff" || f.value !== "draft").map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {side === "staff" ? (
          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger aria-label="Account" className="w-56">
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
        ) : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input aria-label="Search invoices" placeholder="Number or customer" className="w-60 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={FileText} title="No invoices here" description={side === "staff" ? "Raise one from the billing queue, or switch the filter." : "Nothing has been invoiced to this account yet."} />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Invoice</th>
                {side === "staff" ? <th className="px-3 py-3 font-medium">Customer</th> : null}
                <th className="px-3 py-3 font-medium">Issued</th>
                <th className="px-3 py-3 font-medium">Due</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-5 py-3">
                    <Link href={`/invoices/${invoice.id}`} className="tabular font-medium hover:text-brand">
                      {invoice.number ?? "Draft"}
                    </Link>
                    {invoice.source === "manual" ? (
                      <Badge tone="outline" className="ml-2">
                        Typed in
                      </Badge>
                    ) : (
                      <span className="ml-2 text-2xs text-subtle-foreground">
                        {invoice.workOrders.length} {invoice.workOrders.length === 1 ? "job" : "jobs"}
                      </span>
                    )}
                  </td>
                  {side === "staff" ? <td className="px-3 py-3">{invoice.customerName}</td> : null}
                  <td className="px-3 py-3 text-muted-foreground">{invoice.issueDate ? formatDate(invoice.issueDate) : "—"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</td>
                  <td className="px-3 py-3">
                    <InvoiceStatusBadge status={invoice.status} overdueDays={invoice.daysOverdue} />
                  </td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(invoice.totals.totalDue)}</td>
                  <td className="tabular px-5 py-3 text-right font-medium">{invoice.status === "void" || invoice.status === "draft" ? "—" : formatPesos(invoice.balance)}</td>
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

function PaymentList() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const { side, staffReason } = useCan();
  const { data, error, isSuccess, refetch } = usePaymentPage({ page, per_page: pageSize });
  const { downloadPaymentPdf, voidPayment } = useBillingActions();
  const [message, setMessage] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!isSuccess) return <Skeleton className="h-48" />;
  if (data.data.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={FileText} title="No payments yet" description="Payments recorded at the counter appear here with the invoices they settled." />
      </div>
    );
  }

  return (
    <>
      {message ? (
        <p role="alert" className="mb-3 text-xs text-critical">
          {message}
        </p>
      ) : null}
      <section className="card-raised overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Payment</th>
              {side === "staff" ? <th className="px-3 py-3 font-medium">Customer</th> : null}
              <th className="px-3 py-3 font-medium">Received</th>
              <th className="px-3 py-3 font-medium">Method</th>
              <th className="px-3 py-3 font-medium">Applied to</th>
              <th className="px-3 py-3 text-right font-medium">Amount</th>
              <th className="px-3 py-3 text-right font-medium">Credit left</th>
              <th className="px-5 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.data.map((payment) => (
              <tr key={payment.id}>
                <td className="px-5 py-3">
                  <span className="tabular font-medium">{payment.number}</span>
                  {payment.status === "void" ? (
                    <Badge tone="outline" className="ml-2">
                      Void
                    </Badge>
                  ) : null}
                </td>
                {side === "staff" ? <td className="px-3 py-3">{payment.customerName}</td> : null}
                <td className="px-3 py-3 text-muted-foreground">
                  {formatDate(payment.receivedOn)} · {payment.receivedByName}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {payment.methodLabel}
                  {payment.referenceNo ? ` · ${payment.referenceNo}` : ""}
                </td>
                <td className="px-3 py-3">
                  {payment.allocations.length === 0
                    ? "—"
                    : payment.allocations.map((a, index) => (
                        <React.Fragment key={a.id}>
                          {index > 0 ? ", " : ""}
                          <Link href={`/invoices/${a.invoiceId}`} className="tabular hover:text-brand">
                            {a.invoiceNumber}
                          </Link>
                        </React.Fragment>
                      ))}
                </td>
                <td className="tabular px-3 py-3 text-right">{formatPesos(payment.amount)}</td>
                <td className="tabular px-3 py-3 text-right">{payment.unallocated > 0 ? formatPesos(payment.unallocated) : "—"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Acknowledgment receipt ${payment.number}`}
                    onClick={async () => {
                      setMessage(null);
                      const result = await downloadPaymentPdf(payment.id, `${payment.number}.pdf`);
                      if (!result.ok) setMessage(result.error);
                    }}
                  >
                    <Download />
                    Receipt
                  </Button>
                  {side === "staff" && payment.status === "posted" ? (
                    payment.canVoid ? (
                      <ReasonDialog
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`Void ${payment.number}`}>
                            <Ban className="text-critical" />
                          </Button>
                        }
                        title={`Void ${payment.number}`}
                        description="The payment keeps its number and stays on record, marked void. Every invoice it paid is owed again."
                        confirmLabel="Void payment"
                        onConfirm={(reason) => voidPayment(payment.id, reason)}
                      />
                    ) : (
                      <DeniedAction reason={staffReason("billing:void")}>
                        <Button variant="ghost" size="sm" aria-label={`Void ${payment.number}`}>
                          <Ban />
                        </Button>
                      </DeniedAction>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Pagination
        page={data.meta.page}
        pageCount={Math.max(1, Math.ceil(data.meta.total / data.meta.per_page))}
        pageSize={data.meta.per_page}
        totalItems={data.meta.total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>
  );
}

/**
 * Invoices and payments. Staff see those of the branches they work in; a
 * customer sees their own account's issued invoices, its payments, and its
 * balance and statement. Every figure is the API's.
 */
export default function InvoicesPage() {
  const { side, can, reason } = useCan();
  const { session } = useSession();

  if (!can("billing:view")) {
    return (
      <div className="card">
        <EmptyState icon={FileText} title="Invoices aren't open to this role" description={reason("billing:view")} />
      </div>
    );
  }

  const ownAccount = side === "portal" ? session?.fleetClientId ?? null : null;

  return (
    <>
      <PageHeader
        title="Invoices"
        description={
          side === "staff"
            ? "Every invoice raised in your branches, from draft to paid, and the payments received against them."
            : "What has been invoiced to your account, what you have paid, and your statement of account."
        }
      />
      <Tabs defaultValue={ownAccount ? "balance" : "invoices"}>
        <TabsList>
          {ownAccount ? <TabsTrigger value="balance">Balance & statement</TabsTrigger> : null}
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        {ownAccount ? (
          <TabsContent value="balance">
            <BalancePanel accountId={ownAccount} accountName={session?.fleetClientName ?? "Your account"} staff={false} />
          </TabsContent>
        ) : null}
        <TabsContent value="invoices">
          <InvoiceList />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentList />
        </TabsContent>
      </Tabs>
    </>
  );
}
