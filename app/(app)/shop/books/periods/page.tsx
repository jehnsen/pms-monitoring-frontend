"use client";

import * as React from "react";
import { CheckCircle2, Lock, LockOpen, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeniedAction } from "@/components/auth/denied-action";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { BooksGate } from "@/components/books/books-chrome";
import { useLedgerActions, usePeriodChecklist, usePeriods } from "@/lib/ledger";
import { useCan } from "@/lib/rbac";
import { cn, formatDate, formatPesos } from "@/lib/utils";
import type { CloseCheck } from "@/types/ledger";

/**
 * Period close. A month can be closed once it is over, the months before it
 * are closed, and the checklist passes: everything posted, receivables and
 * stock agreeing with their control accounts, customer credit with Customer
 * Deposits, and the trial balance balanced. A closed month takes no new entry
 * and is never reopened; a void of one of its documents is booked in the
 * current month, dated today, naming the original.
 */
export default function PeriodsPage() {
  return (
    <BooksGate>
      <Periods />
    </BooksGate>
  );
}

function Periods() {
  const periods = usePeriods();
  const [picked, setPicked] = React.useState<string | null>(null);

  // The oldest open month is the one to close next; open on it unless one was picked.
  const openMonths = (periods.data ?? []).filter((p) => p.status === "open");
  const selected = picked ?? openMonths[openMonths.length - 1]?.periodKey ?? periods.data?.[0]?.periodKey ?? null;

  return (
    <>
      <PageHeader title="Period close" description="Check a month against the documents behind it, then close it so it can never change." />

      {periods.error ? (
        <QueryError error={periods.error} onRetry={() => void periods.refetch()} />
      ) : !periods.data ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Accounting periods" className="card-raised self-start divide-y divide-border">
            {periods.data.map((period) => (
              <button
                key={period.periodKey}
                type="button"
                aria-current={selected === period.periodKey ? "true" : undefined}
                onClick={() => setPicked(period.periodKey)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-surface-2",
                  selected === period.periodKey && "bg-surface-2"
                )}
              >
                <span>
                  <span className="block font-medium">{period.label}</span>
                  <span className="text-2xs text-subtle-foreground">
                    {period.status === "closed" && period.closedByName ? `Closed by ${period.closedByName}` : "Open"}
                  </span>
                </span>
                {period.status === "closed" ? (
                  <Badge tone="outline">
                    <Lock />
                    Closed
                  </Badge>
                ) : (
                  <Badge tone="brand">
                    <LockOpen />
                    Open
                  </Badge>
                )}
              </button>
            ))}
          </nav>
          {selected ? <Checklist period={selected} /> : null}
        </div>
      )}
    </>
  );
}

function Checklist({ period }: { period: string }) {
  const { data, error, refetch } = usePeriodChecklist(period);
  const { closePeriod } = useLedgerActions();
  const { can, reason } = useCan();
  const [confirm, setConfirm] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return <Skeleton className="h-72" />;

  async function close() {
    setPending(true);
    setProblem(null);
    const result = await closePeriod(period);
    setPending(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    setConfirm(false);
  }

  const closeButton = (
    <Button variant="primary" size="sm" disabled={!data.canClose}>
      <Lock />
      Close {data.label}
    </Button>
  );

  return (
    <section className="card-raised">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{data.label}</h2>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            {formatDate(data.startsOn)} to {formatDate(data.endsOn)}. Checked against everything dated up to the last day.
          </p>
        </div>
        {data.status === "closed" ? (
          <Badge tone="outline">
            <Lock />
            Closed
          </Badge>
        ) : can("ledger:manage") ? (
          <Dialog open={confirm} onOpenChange={setConfirm}>
            <DialogTrigger asChild>{closeButton}</DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Close {data.label}?</DialogTitle>
                <DialogDescription>
                  Nothing more can be posted into it, and it is never reopened. A void of one of its documents will be booked in the current month instead.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                {problem ? (
                  <p role="alert" className="text-xs text-critical">
                    {problem}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Every check below passed.</p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={pending} onClick={() => void close()}>
                  {pending ? "Closing…" : `Close ${data.label}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <DeniedAction reason={reason("ledger:manage")}>{closeButton}</DeniedAction>
        )}
      </header>

      {data.status === "open" && data.blockedBy ? (
        <p role="status" className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          This month can’t be closed yet: {data.blockedBy}
        </p>
      ) : null}

      <ul className="divide-y divide-border border-t border-border">
        {data.checks.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </ul>
    </section>
  );
}

function CheckRow({ check }: { check: CloseCheck }) {
  const Icon = check.passed ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <Icon className={cn("mt-0.5 size-4 shrink-0", check.passed ? "text-ok" : "text-critical")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          {check.label} <span className="sr-only">{check.passed ? "(passed)" : "(failed)"}</span>
        </p>
        <p className="mt-0.5 text-xs text-subtle-foreground">{check.detail}</p>
        {check.expected !== null && check.actual !== null ? (
          <p className="tabular mt-1 text-2xs text-muted-foreground">
            {formatPesos(check.expected)} against {formatPesos(check.actual)}
            {check.difference ? ` (${check.difference > 0 ? "+" : "−"}${formatPesos(Math.abs(check.difference))})` : ""}
          </p>
        ) : null}
      </div>
    </li>
  );
}
