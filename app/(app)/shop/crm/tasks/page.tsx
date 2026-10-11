"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, CalendarPlus, CheckCircle2, ListChecks, Pencil, RotateCcw, UserX } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { TASK_KIND, TaskStatus } from "@/components/crm/crm-chips";
import { TaskDialog } from "@/components/crm/task-dialog";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatDay } from "@/components/detailing/booking-status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmActions, useCrmTasks } from "@/lib/crm";
import { useCan } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import type { CrmTask } from "@/types/crm";

const VIEWS = [
  ["open", "Open"],
  ["done", "Done"],
  ["all", "All"],
] as const;

/**
 * Tasks: follow-ups, call-backs and the booking requests customers leave from
 * a reminder's link. Which are overdue and which have a reminder due is the
 * API's call. A task is added from the customer or the lead it is about.
 */
export default function CrmTasksPage() {
  const [status, setStatus] = React.useState<(typeof VIEWS)[number][0]>("open");
  const [mine, setMine] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const { data, error, refetch } = useCrmTasks({ status, mine, page });
  const actions = useCrmActions();
  const { can, reason } = useCan();
  const works = can("crm:work");
  const [editing, setEditing] = React.useState<CrmTask | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs transition-colors", active ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2");
  const act = async (task: CrmTask, to: CrmTask["status"]) => {
    const result = await actions.setTaskStatus(task.id, to);
    setFailure(result.ok ? null : result.error);
  };
  const gate = (node: React.ReactElement) => (works ? node : <DeniedAction reason={reason("crm:work")}>{node}</DeniedAction>);

  return (
    <>
      <PageHeader title="Tasks" description="Follow-ups and call-backs, and the booking requests customers send from a reminder. Add a task from the customer or the lead it is about." />

      {data ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Open" value={String(data.summary.open)} icon={ListChecks} hint={`${data.summary.unassigned} with nobody assigned`} />
          <StatTile label="Overdue" value={String(data.summary.overdue)} icon={AlertTriangle} tone={data.summary.overdue > 0 ? "critical" : "ok"} />
          <StatTile label="Reminders due" value={String(data.summary.remindersDue)} icon={BellRing} tone={data.summary.remindersDue > 0 ? "warning" : "ok"} />
          <StatTile label="Booking requests" value={String(data.summary.bookingRequests)} icon={CalendarPlus} tone={data.summary.bookingRequests > 0 ? "brand" : undefined} hint="From reminder links: call these customers back" />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter tasks">
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            className={chip(status === value)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => {
            setMine((current) => !current);
            setPage(1);
          }}
          className={cn(chip(mine), "ml-2")}
        >
          Assigned to me
        </button>
      </div>
      {failure ? (
        <p role="alert" className="mb-3 text-xs text-critical">
          {failure}
        </p>
      ) : null}

      {!data ? (
        <Skeleton className="h-96" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={ListChecks} title="Nothing here" description="No task matches this view." />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Task</th>
                <th scope="col" className="px-3 py-3 font-medium">About</th>
                <th scope="col" className="px-3 py-3 font-medium">Assigned to</th>
                <th scope="col" className="px-3 py-3 font-medium">Due</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map((task) => (
                <tr key={task.id} className="align-top hover:bg-surface-2/60">
                  <td className="px-5 py-3">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-2xs text-subtle-foreground">
                      {TASK_KIND[task.kind] ?? task.kind}
                      {task.reminderDue ? " · reminder due" : ""}
                    </p>
                    {task.details ? <p className="mt-1 max-w-md whitespace-pre-wrap text-muted-foreground">{task.details}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    {task.customerAccountId ? (
                      <Link href={`/shop/crm/customers/${task.customerAccountId}`} className="text-brand hover:underline">
                        {task.customerName}
                      </Link>
                    ) : (
                      <Link href="/shop/crm/pipeline" className="text-brand hover:underline">
                        {task.leadName} (lead)
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {task.assigneeName ?? (
                      <span className="inline-flex items-center gap-1 text-subtle-foreground">
                        <UserX className="size-3.5" aria-hidden />
                        Nobody yet
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{task.dueOn ? formatDay(task.dueOn) : <span className="text-subtle-foreground">—</span>}</td>
                  <td className="px-3 py-3">
                    <TaskStatus task={task} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex justify-end gap-1">
                      {gate(
                        <Button size="sm" variant="ghost" aria-label={`Edit "${task.title}"`} onClick={() => setEditing(task)}>
                          <Pencil />
                        </Button>
                      )}
                      {task.status === "open"
                        ? gate(
                            <Button size="sm" onClick={() => void act(task, "done")}>
                              <CheckCircle2 />
                              Done
                            </Button>
                          )
                        : gate(
                            <Button size="sm" variant="ghost" onClick={() => void act(task, "open")}>
                              <RotateCcw />
                              Re-open
                            </Button>
                          )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border px-5 py-3">
            <Pagination page={data.meta.page} pageCount={Math.max(1, Math.ceil(data.meta.total / data.meta.perPage))} pageSize={data.meta.perPage} totalItems={data.meta.total} onPageChange={setPage} onPageSizeChange={() => undefined} />
          </div>
        </section>
      )}

      {editing ? <TaskDialog task={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
