"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, Hourglass, ScrollText, Send, Smile, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MessageStatus } from "@/components/crm/crm-chips";
import { StatTile } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedback, useMessages } from "@/lib/crm";
import { cn, formatManilaTime } from "@/lib/utils";

const STATUSES = [
  ["", "All"],
  ["sent", "Sent"],
  ["queued", "Queued"],
  ["skipped", "Not sent"],
  ["failed", "Failed"],
] as const;

const SOURCE: Record<string, string> = { reminder: "Reminder", campaign: "Campaign", feedback: "Feedback request", task: "Task", manual: "Manual" };

/**
 * The message log: everything the shop sent, is holding, or did not send,
 * with the reason. A message that may not go (no consent, opted out, no
 * address) is logged here instead of disappearing. Also the feedback that came
 * back, and the score it adds up to (the API's).
 */
export default function MessageLogPage() {
  const [status, setStatus] = React.useState<(typeof STATUSES)[number][0]>("");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<string | null>(null);
  const { data, error, refetch } = useMessages({ status: status || undefined, page });
  const feedback = useFeedback();

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader title="Message log" description="Every reminder, campaign message and feedback request: sent, waiting, or held back, and why." />

      {data ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Sent" value={String(data.summary.sent)} icon={Send} tone="ok" />
          <StatTile label="Queued" value={String(data.summary.queued)} icon={Hourglass} hint="Waiting for quiet hours to end, or for delivery" />
          <StatTile label="Not sent" value={String(data.summary.skipped)} icon={Ban} hint="No consent, opted out, or no address" />
          <StatTile label="Failed" value={String(data.summary.failed)} icon={TriangleAlert} tone={data.summary.failed > 0 ? "critical" : undefined} />
          <StatTile label="Net Promoter Score" value={feedback.data?.summary.nps == null ? "—" : String(feedback.data.summary.nps)} icon={Smile} hint={feedback.data ? `${feedback.data.summary.responses} answers of ${feedback.data.summary.requested} asked` : undefined} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter messages">
        {STATUSES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors", status === value ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2")}
          >
            {label}
          </button>
        ))}
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={ScrollText} title="Nothing here" description="No message matches this view." />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">When</th>
                <th scope="col" className="px-3 py-3 font-medium">To</th>
                <th scope="col" className="px-3 py-3 font-medium">Message</th>
                <th scope="col" className="px-3 py-3 font-medium">From</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map((message) => (
                <React.Fragment key={message.id}>
                  <tr className="align-top hover:bg-surface-2/60">
                    <td className="tabular whitespace-nowrap px-5 py-3">{formatManilaTime(message.sentAt ?? message.createdAt)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/shop/crm/customers/${message.customerAccountId}`} className="font-medium text-brand hover:underline">
                        {message.customerName}
                      </Link>
                      <p className="text-2xs text-subtle-foreground">{message.toAddress ?? "no address"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" aria-expanded={open === message.id} onClick={() => setOpen(open === message.id ? null : message.id)} className="text-left hover:underline">
                        {message.subject ?? message.purposeLabel}
                      </button>
                      <p className="text-2xs text-subtle-foreground">
                        {message.purposeLabel} · {message.channel}
                        {message.respondedAt ? " · answered" : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3">{SOURCE[message.sourceType] ?? message.sourceType}</td>
                    <td className="px-5 py-3">
                      <MessageStatus message={message} />
                      {message.status === "queued" && message.sendAfter ? <p className="mt-1 text-2xs text-subtle-foreground">after {formatManilaTime(message.sendAfter)}</p> : null}
                      {message.failedReason ? <p className="mt-1 max-w-48 text-2xs text-critical">{message.failedReason}</p> : null}
                    </td>
                  </tr>
                  {open === message.id ? (
                    <tr>
                      <td colSpan={5} className="bg-surface-2/50 px-5 py-3">
                        <p className="max-w-3xl whitespace-pre-wrap text-muted-foreground">{message.body}</p>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border px-5 py-3">
            <Pagination page={data.meta.page} pageCount={Math.max(1, Math.ceil(data.meta.total / data.meta.perPage))} pageSize={data.meta.perPage} totalItems={data.meta.total} onPageChange={setPage} onPageSizeChange={() => undefined} />
          </div>
        </section>
      )}

      {feedback.data && feedback.data.data.length > 0 ? (
        <section className="card mt-6 p-5">
          <h2 className="mb-1 text-sm font-semibold">Feedback</h2>
          <p className="mb-3 text-2xs text-subtle-foreground">
            {feedback.data.summary.promoters} promoters (9–10), {feedback.data.summary.passives} passives (7–8), {feedback.data.summary.detractors} detractors (0–6).
          </p>
          <ul className="divide-y divide-border text-xs">
            {feedback.data.data.map((answer) => (
              <li key={answer.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <Link href={`/shop/crm/customers/${answer.customerAccountId}`} className="font-medium text-brand hover:underline">
                    {answer.customerName}
                  </Link>
                  {answer.comment ? <p className="text-muted-foreground">{answer.comment}</p> : null}
                  <p className="text-2xs text-subtle-foreground">{answer.respondedAt ? formatManilaTime(answer.respondedAt) : ""}</p>
                </div>
                <span className="tabular shrink-0 font-semibold">{answer.score} / 10</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
