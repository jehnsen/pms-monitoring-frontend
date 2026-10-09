"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Download, FileText, PiggyBank, Wallet } from "lucide-react";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton, StatSkeletonRow } from "@/components/ui/skeleton";
import { InvoiceStatusBadge } from "@/components/billing/billing-chrome";
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog";
import { useAccountBalance, useBillingActions, useStatement } from "@/lib/receivables";
import { formatDate, formatPesos, manilaDateDaysAgo } from "@/lib/utils";

/**
 * One account's receivables: what it owes (and how much is overdue), the
 * credit it holds, where it stands against its credit limit, its open
 * invoices, and its statement of account over a date range (with the PDF).
 * Every figure is the API's (`/customer-accounts/{id}/balance|statement`).
 * Staff also get the account's "Record payment".
 */
export function BalancePanel({ accountId, accountName, staff }: { accountId: string; accountName: string; staff: boolean }) {
  const { data: balance, error, refetch } = useAccountBalance(accountId);
  const [range, setRange] = React.useState(() => ({ from: manilaDateDaysAgo(90), to: manilaDateDaysAgo(0) }));
  const statement = useStatement(accountId, range);
  const { downloadStatementPdf } = useBillingActions();
  const [pdfError, setPdfError] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!balance) return <StatSkeletonRow />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={formatPesos(balance.outstanding)}
          hint={balance.overdue > 0 ? `${formatPesos(balance.overdue)} overdue` : "Nothing overdue"}
          icon={Wallet}
          tone={balance.overdue > 0 ? "critical" : "brand"}
        />
        <StatTile label="Credit on account" value={formatPesos(balance.credit)} hint="Paid in, not yet applied to an invoice" icon={PiggyBank} tone="brand" />
        <StatTile
          label="Credit limit"
          value={balance.creditLimit === null ? "None set" : formatPesos(balance.creditLimit)}
          hint={
            balance.availableCredit === null
              ? `${balance.paymentTermsDays}-day terms`
              : balance.overLimit
                ? `${formatPesos(-balance.availableCredit)} over the limit`
                : `${formatPesos(balance.availableCredit)} available`
          }
          icon={AlertTriangle}
          tone={balance.overLimit ? "warning" : "ok"}
        />
        <StatTile
          label="Next due"
          value={balance.nextDueDate ? formatDate(balance.nextDueDate) : "—"}
          hint={staff && balance.uninvoicedJobs !== null ? `${balance.uninvoicedJobs} finished ${balance.uninvoicedJobs === 1 ? "job" : "jobs"} not yet invoiced` : `${balance.openInvoices.length} open ${balance.openInvoices.length === 1 ? "invoice" : "invoices"}`}
          icon={CalendarClock}
          tone="brand"
        />
      </div>

      {balance.overLimit ? (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-foreground" />
          <p>
            {accountName} is over its credit limit. New work is still accepted; each job raised now is logged as an override.
          </p>
        </div>
      ) : null}

      <section className="card-raised">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Open invoices</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">Issued and not yet fully paid, due soonest first.</p>
          </div>
          {staff ? <RecordPaymentDialog accountId={accountId} accountName={accountName} /> : null}
        </header>
        {balance.openInvoices.length === 0 ? (
          <EmptyState icon={FileText} title="Nothing owed" description="Every issued invoice for this account is paid." />
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-left text-xs">
              <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Invoice</th>
                  <th className="px-3 py-2 font-medium">Issued</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-5 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {balance.openInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-5 py-2">
                      <Link href={`/invoices/${invoice.id}`} className="tabular font-medium hover:text-brand">
                        {invoice.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{invoice.issueDate ? formatDate(invoice.issueDate) : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</td>
                    <td className="px-3 py-2">
                      <InvoiceStatusBadge status={invoice.status} overdueDays={invoice.daysOverdue} />
                    </td>
                    <td className="tabular px-3 py-2 text-right">{formatPesos(invoice.totals.totalDue)}</td>
                    <td className="tabular px-5 py-2 text-right font-medium">{formatPesos(invoice.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card-raised">
        <header className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Statement of account</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">Balance brought forward, every invoice, payment and void in the range, and the closing balance.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="statement-from" className="text-2xs">
                From
              </Label>
              <Input id="statement-from" type="date" className="h-8 w-40" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="statement-to" className="text-2xs">
                To
              </Label>
              <Input id="statement-to" type="date" className="h-8 w-40" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setPdfError(null);
                const result = await downloadStatementPdf(accountId, range);
                if (!result.ok) setPdfError(result.error);
              }}
            >
              <Download />
              PDF
            </Button>
          </div>
        </header>
        {pdfError ? <p className="px-5 pb-2 text-xs text-critical">{pdfError}</p> : null}
        {statement.error ? (
          <div className="px-5 pb-4">
            <QueryError error={statement.error} />
          </div>
        ) : !statement.data ? (
          <Skeleton className="mx-5 mb-4 h-32" />
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-left text-xs">
              <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Charges</th>
                  <th className="px-3 py-2 text-right font-medium">Credits</th>
                  <th className="px-5 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-5 py-2 text-muted-foreground" colSpan={5}>
                    Balance brought forward
                  </td>
                  <td className="tabular px-5 py-2 text-right">{formatPesos(statement.data.openingBalance)}</td>
                </tr>
                {statement.data.entries.map((entry) => (
                  <tr key={`${entry.kind}-${entry.documentId}`}>
                    <td className="px-5 py-2 text-muted-foreground">{formatDate(entry.date)}</td>
                    <td className="tabular px-3 py-2">{entry.reference}</td>
                    <td className="px-3 py-2">{entry.description}</td>
                    <td className="tabular px-3 py-2 text-right">{entry.charge > 0 ? formatPesos(entry.charge) : ""}</td>
                    <td className="tabular px-3 py-2 text-right">{entry.credit > 0 ? formatPesos(entry.credit) : ""}</td>
                    <td className="tabular px-5 py-2 text-right">{formatPesos(entry.balance)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-5 py-2" colSpan={5}>
                    Closing balance
                  </td>
                  <td className="tabular px-5 py-2 text-right">{formatPesos(statement.data.closingBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
