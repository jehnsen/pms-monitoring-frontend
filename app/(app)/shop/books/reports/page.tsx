"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Amount, BooksGate, ScopeNote, accountTypeLabel } from "@/components/books/books-chrome";
import { PAYMENT_METHODS } from "@/lib/api/billing";
import { useBalanceSheet, useDailySales, useGeneralLedger, useLedgerAccounts, useProfitAndLoss, useTrialBalance, type DateRange } from "@/lib/ledger";
import { cn, formatDate, formatPesos, manilaDateDaysAgo } from "@/lib/utils";
import type { ProfitLossLine } from "@/types/ledger";

/**
 * The accounting reports, all read from the journal: trial balance, general
 * ledger by account, profit and loss by branch and consolidated, a simple
 * balance sheet, and daily sales by branch and payment method. With no branch
 * picked (and none pinned) every report is the consolidated one.
 */
export default function BooksReportsPage() {
  return (
    <BooksGate>
      <PageHeader title="Reports" description="Read from the journal. Every figure is the books' own; nothing is recomputed in the browser." />
      <Tabs defaultValue="trial-balance">
        <TabsList>
          <TabsTrigger value="trial-balance">Trial balance</TabsTrigger>
          <TabsTrigger value="general-ledger">General ledger</TabsTrigger>
          <TabsTrigger value="profit-and-loss">Profit and loss</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance sheet</TabsTrigger>
          <TabsTrigger value="daily-sales">Daily sales</TabsTrigger>
        </TabsList>
        <TabsContent value="trial-balance">
          <TrialBalanceReport />
        </TabsContent>
        <TabsContent value="general-ledger">
          <GeneralLedgerReport />
        </TabsContent>
        <TabsContent value="profit-and-loss">
          <ProfitAndLossReport />
        </TabsContent>
        <TabsContent value="balance-sheet">
          <BalanceSheetReport />
        </TabsContent>
        <TabsContent value="daily-sales">
          <DailySalesReport />
        </TabsContent>
      </Tabs>
    </BooksGate>
  );
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-2xs">
        {label}
      </Label>
      <Input id={id} type="date" className="h-9 w-40" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RangeFields({ prefix, range, onChange }: { prefix: string; range: DateRange; onChange: (range: DateRange) => void }) {
  return (
    <>
      <DateField id={`${prefix}-from`} label="From" value={range.from} onChange={(from) => onChange({ ...range, from })} />
      <DateField id={`${prefix}-to`} label="to" value={range.to} onChange={(to) => onChange({ ...range, to })} />
    </>
  );
}

function monthRange(): DateRange {
  const today = manilaDateDaysAgo(0);
  return { from: `${today.slice(0, 8)}01`, to: today };
}

function BalancedChip({ balanced, label }: { balanced: boolean; label: string }) {
  const Icon = balanced ? CheckCircle2 : XCircle;
  return (
    <Badge tone={balanced ? "ok" : "critical"}>
      <Icon />
      {balanced ? `${label} balances` : `${label} does not balance`}
    </Badge>
  );
}

/* ------------------------------------------------------------ trial balance */

function TrialBalanceReport() {
  const [asOf, setAsOf] = React.useState(() => manilaDateDaysAgo(0));
  const { data, error, refetch } = useTrialBalance(asOf);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <DateField id="tb-as-of" label="As of" value={asOf} onChange={setAsOf} />
        {data ? <BalancedChip balanced={data.balanced} label="The trial balance" /> : null}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-64" />
      ) : data.accounts.length === 0 ? (
        <div className="card">
          <EmptyState icon={CheckCircle2} title="Nothing posted yet" description={`No entries through ${formatDate(data.asOf)}.`} />
        </div>
      ) : (
        <>
          <section className="card-raised overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-3 py-3 font-medium">Account</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 text-right font-medium">Debit</th>
                  <th className="px-5 py-3 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.accounts.map((a) => (
                  <tr key={a.accountId}>
                    <td className="tabular px-5 py-2.5 font-medium">{a.code}</td>
                    <td className="px-3 py-2.5">{a.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{accountTypeLabel(a.type)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Amount value={a.debit} />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Amount value={a.credit} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border-strong font-semibold">
                <tr>
                  <td className="px-5 py-3" colSpan={3}>
                    Total
                  </td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(data.totalDebit)}</td>
                  <td className="tabular px-5 py-3 text-right">{formatPesos(data.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
          <ScopeNote scope={data.scope} />
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- general ledger */

function GeneralLedgerReport() {
  const chart = useLedgerAccounts(manilaDateDaysAgo(0));
  const [account, setAccount] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<DateRange>(monthRange);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const picked = account ?? chart.data?.accounts.find((a) => a.code === "1100")?.id ?? chart.data?.accounts[0]?.id ?? null;
  const { data, error, refetch } = useGeneralLedger(picked, range, page, pageSize);

  React.useEffect(() => setPage(1), [picked, range, pageSize]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={picked ?? ""} onValueChange={setAccount}>
          <SelectTrigger aria-label="Account" className="w-72">
            <SelectValue placeholder="Choose an account" />
          </SelectTrigger>
          <SelectContent>
            {(chart.data?.accounts ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.code} · {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RangeFields prefix="gl" range={range} onChange={setRange} />
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <section className="card-raised overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Entry</th>
                  <th className="px-3 py-3 font-medium">Event</th>
                  <th className="px-3 py-3 font-medium">Reference</th>
                  <th className="px-3 py-3 font-medium">Branch</th>
                  <th className="px-3 py-3 text-right font-medium">Debit</th>
                  <th className="px-3 py-3 text-right font-medium">Credit</th>
                  <th className="px-5 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-surface-2 text-muted-foreground">
                  <td className="px-5 py-2.5" colSpan={7}>
                    Balance brought forward
                  </td>
                  <td className="tabular px-5 py-2.5 text-right">{formatPesos(data.openingBalance)}</td>
                </tr>
                {data.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-5 py-2.5 text-muted-foreground">{formatDate(line.entryDate)}</td>
                    <td className="tabular px-3 py-2.5 font-medium">{line.number}</td>
                    <td className="px-3 py-2.5">{line.eventLabel}</td>
                    <td className="tabular px-3 py-2.5 text-muted-foreground">{line.reference || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{line.branchName}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Amount value={line.debit} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Amount value={line.credit} />
                    </td>
                    <td className="tabular px-5 py-2.5 text-right font-medium">{formatPesos(line.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border-strong font-semibold">
                <tr>
                  <td className="px-5 py-3" colSpan={5}>
                    {data.account.code} · {data.account.name} — {formatDate(data.from)} to {formatDate(data.to)}
                  </td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(data.totalDebit)}</td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(data.totalCredit)}</td>
                  <td className="tabular px-5 py-3 text-right">{formatPesos(data.closingBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
          <Pagination page={page} pageSize={pageSize} pageCount={Math.max(1, Math.ceil(data.total / pageSize))} totalItems={data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
          <ScopeNote scope={data.scope} />
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- profit and loss */

function ProfitAndLossReport() {
  const [range, setRange] = React.useState<DateRange>(monthRange);
  const { data, error, refetch } = useProfitAndLoss(range);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <RangeFields prefix="pl" range={range} onChange={setRange} />
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <section className="card-raised overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Account</th>
                  {data.branches.map((b) => (
                    <th key={b.id} className="px-3 py-3 text-right font-medium">
                      {b.name}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right font-medium">{data.branches.length > 1 ? "Consolidated" : "Total"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <PlSection title="Revenue" lines={data.revenue} branches={data.branches} />
                <PlSection title="Cost of sales" lines={data.costOfSales} branches={data.branches} />
                <PlTotal label="Gross profit" subtotal={data.grossProfit} branches={data.branches} />
                <PlSection title="Expenses" lines={data.expenses} branches={data.branches} />
                <PlTotal label="Net profit" subtotal={data.netProfit} branches={data.branches} strong />
              </tbody>
            </table>
          </section>
          <ScopeNote scope={data.scope} />
        </>
      )}
    </div>
  );
}

function PlSection({ title, lines, branches }: { title: string; lines: ProfitLossLine[]; branches: { id: string; name: string }[] }) {
  return (
    <>
      <tr className="bg-surface-2">
        <th colSpan={branches.length + 2} className="px-5 py-2 text-2xs font-medium uppercase tracking-wide text-subtle-foreground">
          {title}
        </th>
      </tr>
      {lines.length === 0 ? (
        <tr>
          <td colSpan={branches.length + 2} className="px-5 py-2.5 text-subtle-foreground">
            Nothing in the range.
          </td>
        </tr>
      ) : (
        lines.map((line) => (
          <tr key={line.accountId}>
            <td className="px-5 py-2.5">
              <span className="tabular font-medium">{line.code}</span> · {line.name}
            </td>
            {branches.map((b) => (
              <td key={b.id} className="px-3 py-2.5 text-right">
                <Amount value={line.byBranch[b.id] ?? 0} />
              </td>
            ))}
            <td className="px-5 py-2.5 text-right">
              <Amount value={line.total} />
            </td>
          </tr>
        ))
      )}
    </>
  );
}

function PlTotal({
  label,
  subtotal,
  branches,
  strong = false,
}: {
  label: string;
  subtotal: { byBranch: Record<string, number>; total: number };
  branches: { id: string; name: string }[];
  strong?: boolean;
}) {
  return (
    <tr className={cn("border-t border-border-strong font-semibold", strong && "bg-surface-2")}>
      <td className="px-5 py-3">{label}</td>
      {branches.map((b) => (
        <td key={b.id} className={cn("tabular px-3 py-3 text-right", (subtotal.byBranch[b.id] ?? 0) < 0 && "text-critical")}>
          {formatPesos(subtotal.byBranch[b.id] ?? 0)}
        </td>
      ))}
      <td className={cn("tabular px-5 py-3 text-right", subtotal.total < 0 && "text-critical")}>{formatPesos(subtotal.total)}</td>
    </tr>
  );
}

/* ------------------------------------------------------------ balance sheet */

function BalanceSheetReport() {
  const [asOf, setAsOf] = React.useState(() => manilaDateDaysAgo(0));
  const { data, error, refetch } = useBalanceSheet(asOf);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <DateField id="bs-as-of" label="As of" value={asOf} onChange={setAsOf} />
        {data ? <BalancedChip balanced={data.balanced} label="The balance sheet" /> : null}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SheetSection title="Assets" rows={data.assets} total={data.totalAssets} totalLabel="Total assets" />
            <div className="space-y-4">
              <SheetSection title="Liabilities" rows={data.liabilities} total={data.totalLiabilities} totalLabel="Total liabilities" />
              <SheetSection
                title="Equity"
                rows={[...data.equity, { accountId: "earnings", code: "", name: "Earnings to date", amount: data.currentEarnings }]}
                total={data.totalEquity}
                totalLabel="Total equity"
              />
            </div>
          </div>
          <ScopeNote scope={data.scope} />
        </>
      )}
    </div>
  );
}

function SheetSection({ title, rows, total, totalLabel }: { title: string; rows: { accountId: string; code: string; name: string; amount: number }[]; total: number; totalLabel: string }) {
  return (
    <section className="card-raised">
      <h3 className="px-5 pb-2 pt-4 text-sm font-semibold tracking-tight">{title}</h3>
      <table className="w-full text-left text-xs">
        <tbody className="divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <tr key={row.accountId}>
              <td className="px-5 py-2.5">
                {row.code ? <span className="tabular font-medium">{row.code} · </span> : null}
                {row.name}
              </td>
              <td className="tabular px-5 py-2.5 text-right">{formatPesos(row.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border-strong font-semibold">
          <tr>
            <td className="px-5 py-3">{totalLabel}</td>
            <td className="tabular px-5 py-3 text-right">{formatPesos(total)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

/* -------------------------------------------------------------- daily sales */

function DailySalesReport() {
  const [range, setRange] = React.useState<DateRange>(monthRange);
  const { data, error, refetch } = useDailySales(range);
  const methodLabel = (method: string) => PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <RangeFields prefix="ds" range={range} onChange={setRange} />
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-64" />
      ) : data.days.length === 0 ? (
        <div className="card">
          <EmptyState icon={CheckCircle2} title="No sales or receipts" description="Nothing was invoiced or received in this range." />
        </div>
      ) : (
        <>
          <section className="card-raised overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Branch</th>
                  <th className="px-3 py-3 text-right font-medium">Net sales</th>
                  <th className="px-3 py-3 text-right font-medium">VAT</th>
                  <th className="px-3 py-3 text-right font-medium">Invoiced</th>
                  <th className="px-3 py-3 text-right font-medium">Received</th>
                  <th className="px-5 py-3 font-medium">By method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.days.map((day) => (
                  <tr key={`${day.date}-${day.branchId}`}>
                    <td className="px-5 py-2.5">{formatDate(day.date)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{day.branchName}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Amount value={day.netSales} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Amount value={day.vat} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Amount value={day.invoiced} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Amount value={day.received} />
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {day.receipts.length === 0 ? "—" : day.receipts.map((r) => `${methodLabel(r.method)} ${formatPesos(r.received)}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border-strong font-semibold">
                <tr>
                  <td className="px-5 py-3" colSpan={2}>
                    Total
                  </td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(data.totals.netSales)}</td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(data.totals.vat)}</td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(data.totals.invoiced)}</td>
                  <td className="tabular px-3 py-3 text-right">{formatPesos(data.totals.received)}</td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            </table>
          </section>
          <ScopeNote scope={data.scope} />
        </>
      )}
    </div>
  );
}
