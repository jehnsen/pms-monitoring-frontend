"use client";

import * as React from "react";
import Link from "next/link";
import { Banknote, FileText, PiggyBank, Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton, StatSkeletonRow } from "@/components/ui/skeleton";
import { AGING_BUCKETS, PAYMENT_METHODS } from "@/lib/api/billing";
import { useAging, useRevenue } from "@/lib/receivables";
import { useCan } from "@/lib/rbac";
import { formatDate, formatPesos, manilaDateDaysAgo } from "@/lib/utils";

/**
 * Receivables (staff): accounts-receivable aging as of a date, by days past
 * due, and revenue two ways over a range: invoiced (accrual) and received
 * (cash). Every figure is the API's (`/receivables/aging`, `/receivables/revenue`).
 */
export default function ReceivablesPage() {
  const { can, reason, side } = useCan();
  const [asOf, setAsOf] = React.useState(() => manilaDateDaysAgo(0));
  const [range, setRange] = React.useState(() => ({ from: manilaDateDaysAgo(30), to: manilaDateDaysAgo(0) }));
  const aging = useAging(asOf || null);
  const revenue = useRevenue(range);

  if (side !== "staff" || !can("billing:view")) {
    return (
      <div className="card">
        <EmptyState icon={PiggyBank} title="Receivables aren't open to this role" description={side !== "staff" ? "Only the service centre sees its receivables." : reason("billing:view")} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Receivables"
        description="What customers owe, by how late it is, and what the shop has invoiced against what it has actually received."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="revenue-from" className="text-2xs">
            Revenue from
          </Label>
          <Input id="revenue-from" type="date" className="h-9 w-40" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="revenue-to" className="text-2xs">
            to
          </Label>
          <Input id="revenue-to" type="date" className="h-9 w-40" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>
      </div>

      {revenue.error ? (
        <QueryError error={revenue.error} onRetry={() => void revenue.refetch()} />
      ) : !revenue.data ? (
        <StatSkeletonRow />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Invoiced (accrual)"
            value={formatPesos(revenue.data.accrual.total)}
            hint={`${revenue.data.accrual.invoices} ${revenue.data.accrual.invoices === 1 ? "invoice" : "invoices"} issued`}
            icon={FileText}
            tone="brand"
          />
          <StatTile label="Net sales" value={formatPesos(revenue.data.accrual.netSales)} hint={`${formatPesos(revenue.data.accrual.vat)} VAT on top`} icon={Receipt} tone="brand" />
          <StatTile
            label="Received (cash)"
            value={formatPesos(revenue.data.cash.received)}
            hint={`${revenue.data.cash.payments} ${revenue.data.cash.payments === 1 ? "payment" : "payments"} still standing`}
            icon={Banknote}
            tone="ok"
          />
          <StatTile
            label="Payment methods used"
            value={revenue.data.cash.byMethod.length === 0 ? "—" : `${revenue.data.cash.byMethod.length}`}
            hint={
              revenue.data.cash.byMethod.map((m) => `${PAYMENT_METHODS.find((p) => p.value === m.method)?.label ?? m.method} ${formatPesos(m.received)}`).join(" · ") ||
              "Nothing received in the range"
            }
            icon={PiggyBank}
            tone="brand"
          />
        </div>
      )}

      <div className="mb-3 mt-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Aging</h2>
          <p className="text-xs text-subtle-foreground">Open balances by days past their due date, as of the date chosen.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="aging-as-of" className="text-2xs">
            As of
          </Label>
          <Input id="aging-as-of" type="date" className="h-9 w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
      </div>

      {aging.error ? (
        <QueryError error={aging.error} onRetry={() => void aging.refetch()} />
      ) : !aging.data ? (
        <Skeleton className="h-48" />
      ) : aging.data.accounts.length === 0 ? (
        <div className="card">
          <EmptyState icon={PiggyBank} title="Nothing outstanding" description={`No open balance as of ${formatDate(aging.data.asOf)}.`} />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Account</th>
                {AGING_BUCKETS.map((bucket) => (
                  <th key={bucket.key} className="px-3 py-3 text-right font-medium">
                    {bucket.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 text-right font-medium">Credit held</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {aging.data.accounts.map((row) => (
                <tr key={row.customerAccountId}>
                  <td className="px-5 py-3">
                    <Link href={`/shop/clients/${row.customerAccountId}?tab=balance`} className="font-medium hover:text-brand">
                      {row.customerName}
                    </Link>
                  </td>
                  {AGING_BUCKETS.map((bucket) => (
                    <td key={bucket.key} className={`tabular px-3 py-3 text-right ${row[bucket.key] > 0 && bucket.key !== "current" ? "font-medium text-critical" : ""}`}>
                      {row[bucket.key] > 0 ? formatPesos(row[bucket.key]) : "—"}
                    </td>
                  ))}
                  <td className="tabular px-3 py-3 text-right font-semibold">{formatPesos(row.total)}</td>
                  <td className="tabular px-5 py-3 text-right text-muted-foreground">{row.credit > 0 ? formatPesos(row.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-strong font-semibold">
              <tr>
                <td className="px-5 py-3">All accounts</td>
                {AGING_BUCKETS.map((bucket) => (
                  <td key={bucket.key} className="tabular px-3 py-3 text-right">
                    {formatPesos(aging.data.totals[bucket.key])}
                  </td>
                ))}
                <td className="tabular px-3 py-3 text-right">{formatPesos(aging.data.totals.total)}</td>
                <td className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </>
  );
}
