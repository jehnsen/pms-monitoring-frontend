"use client";

import * as React from "react";
import { BookOpen, Download, Search, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Amount, BooksGate } from "@/components/books/books-chrome";
import { EVENT_GROUPS } from "@/lib/api/ledger";
import { useJournalEntry, useJournalPage, useLedgerAccounts, useLedgerActions, useLedgerSettings } from "@/lib/ledger";
import { formatDate, formatPesos, manilaDateDaysAgo } from "@/lib/utils";

/**
 * The journal browser: every balanced entry the money and stock events have
 * posted, newest first, with its lines. Entries are never edited or deleted;
 * a void posts a reversing entry that names the one it undoes. The file
 * export covers the range chosen.
 */
export default function JournalPage() {
  return (
    <BooksGate>
      <Journal />
    </BooksGate>
  );
}

function Journal() {
  const [from, setFrom] = React.useState(() => manilaDateDaysAgo(30));
  const [to, setTo] = React.useState(() => manilaDateDaysAgo(0));
  const [event, setEvent] = React.useState("all");
  const [account, setAccount] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [open, setOpen] = React.useState<string | null>(null);
  const chart = useLedgerAccounts(manilaDateDaysAgo(0));
  const settings = useLedgerSettings();
  const { downloadJournal } = useLedgerActions();
  const [exportError, setExportError] = React.useState<string | null>(null);

  const { data, error, isSuccess, refetch } = useJournalPage({
    page,
    per_page: pageSize,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(event !== "all" ? { event } : {}),
    ...(account !== "all" ? { account_id: account } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  });

  React.useEffect(() => setPage(1), [from, to, event, account, q, pageSize]);

  async function exportAs(format: "csv" | "xero" | "quickbooks") {
    setExportError(null);
    const result = await downloadJournal(format, { from, to });
    if (!result.ok) setExportError(result.error);
  }

  const target = settings.data?.accountingTarget ?? "none";

  return (
    <>
      <PageHeader
        title="Journal"
        description="Every entry the books have posted, with the document it came from. Entries are never edited; a void posts a reversing entry."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void exportAs("csv")}>
              <Download />
              Export CSV
            </Button>
            {target !== "none" ? (
              <Button variant="secondary" size="sm" onClick={() => void exportAs(target)}>
                <Download />
                Export for {target === "xero" ? "Xero" : "QuickBooks"}
              </Button>
            ) : null}
          </div>
        }
      />

      {exportError ? (
        <p role="alert" className="mb-3 text-xs text-critical">
          {exportError}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="journal-from" className="text-2xs">
            From
          </Label>
          <Input id="journal-from" type="date" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="journal-to" className="text-2xs">
            to
          </Label>
          <Input id="journal-to" type="date" className="h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Select value={event} onValueChange={setEvent}>
          <SelectTrigger aria-label="Event" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every event</SelectItem>
            {EVENT_GROUPS.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger aria-label="Account" className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every account</SelectItem>
            {(chart.data?.accounts ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.code} · {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input aria-label="Search the journal" placeholder="Entry, reference or memo" className="w-60 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : !isSuccess ? (
        <Skeleton className="h-72" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={BookOpen} title="No entries here" description="Nothing was posted in this range, or nothing matches the filters." />
        </div>
      ) : (
        <>
          <section className="card-raised overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Entry</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Event</th>
                  <th className="px-3 py-3 font-medium">Reference</th>
                  <th className="px-3 py-3 font-medium">Branch</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.data.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-3">
                      <button type="button" className="tabular font-medium hover:text-brand" onClick={() => setOpen(entry.id)}>
                        {entry.number}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(entry.entryDate)}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {entry.eventLabel}
                        {entry.isReversal ? (
                          <Badge tone="warning">
                            <Undo2 />
                            Reversal
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="tabular px-3 py-3 text-muted-foreground">{entry.reference || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{entry.branchName}</td>
                    <td className="tabular px-5 py-3 text-right">{formatPesos(entry.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="mt-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              pageCount={Math.max(1, Math.ceil(data.meta.total / pageSize))}
              totalItems={data.meta.total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </>
      )}

      <EntryDialog id={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </>
  );
}

function EntryDialog({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, error } = useJournalEntry(id);

  return (
    <Dialog open={id !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data ? `${data.number} · ${data.eventLabel}` : "Journal entry"}</DialogTitle>
          <DialogDescription>
            {data ? `${formatDate(data.entryDate)} · ${data.branchName} · posted by ${data.postedByName}` : "Loading the entry…"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error ? (
            <p role="alert" className="text-xs text-critical">
              {error instanceof Error ? error.message : "The entry could not be loaded."}
            </p>
          ) : !data ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              {data.memo ? <p className="text-xs text-muted-foreground">{data.memo}</p> : null}
              {data.reversalOfId ? (
                <p className="text-xs">
                  Reverses{" "}
                  <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => onOpen(data.reversalOfId as string)}>
                    the original entry
                  </button>
                  {data.periodClosed ? "" : "."}
                </p>
              ) : null}
              {data.periodClosed ? <Badge tone="outline">{data.period} is closed</Badge> : null}
              <table className="w-full text-left text-xs">
                <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Debit</th>
                    <th className="py-2 pl-3 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 pr-3">
                        <span className="tabular font-medium">{line.accountCode}</span> · {line.accountName}
                        {line.memo ? <span className="ml-2 text-2xs text-subtle-foreground">{line.memo}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Amount value={line.debit} />
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <Amount value={line.credit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border-strong font-semibold">
                  <tr>
                    <td className="py-2 pr-3">Total</td>
                    <td className="tabular px-3 py-2 text-right">{formatPesos(data.total)}</td>
                    <td className="tabular py-2 pl-3 text-right">{formatPesos(data.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
