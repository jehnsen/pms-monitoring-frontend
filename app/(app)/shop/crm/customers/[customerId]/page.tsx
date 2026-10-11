"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, CircleSlash, Minus, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { MessageStatus, TASK_KIND, TaskStatus } from "@/components/crm/crm-chips";
import { TaskDialog } from "@/components/crm/task-dialog";
import { formatDay } from "@/components/detailing/booking-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pesos } from "@/lib/api/crm";
import { useCrmActions, useCustomer360, useTiers } from "@/lib/crm";
import { useCan } from "@/lib/rbac";
import { formatManilaTime } from "@/lib/utils";
import type { Customer360 } from "@/types/crm";

/**
 * Customer 360: one customer, whole. Jobs, invoices, payments and bookings
 * come from EVERY branch, whichever one you work in. Nothing here is totalled
 * or sorted in the browser: the summary, the balance and the timeline are the
 * API's, built from the records each time the page is read.
 */
export default function Customer360Page() {
  const { customerId } = useParams<{ customerId: string }>();
  const { data, error, refetch } = useCustomer360(customerId);
  const actions = useCrmActions();
  const tiers = useTiers();
  const { can, reason } = useCan();
  const works = can("crm:work");
  const [note, setNote] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return <Skeleton className="h-96" />;

  const { account, summary } = data;
  const gate = (node: React.ReactElement) => (works ? node : <DeniedAction reason={reason("crm:work")}>{node}</DeniedAction>);
  const report = (result: { ok: boolean; error?: string }) => setMessage(result.ok ? null : (result.error ?? "That did not work."));
  const figure = (label: string, value: React.ReactNode, hint?: string) => (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-subtle-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
      {hint ? <dd className="text-2xs text-subtle-foreground">{hint}</dd> : null}
    </div>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {account.displayName}
            {account.status !== "active" ? <Badge tone="warning">{account.status}</Badge> : null}
            {account.isDealer ? <Badge tone="brand">Dealer</Badge> : null}
            {data.membership ? <Badge tone="ok">{data.membership.tierName}</Badge> : null}
          </span>
        }
        description={[account.accountType === "company" ? "Company" : "Individual", account.contactName, account.email, account.mobile].filter(Boolean).join(" · ")}
        breadcrumb={[{ label: "Customers", href: "/shop/crm" }, { label: account.displayName }]}
        actions={gate(
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus />
            Add a task
          </Button>
        )}
      />

      <dl className="card mb-6 grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
        {figure("Balance owed", pesos(summary.balanceCents), `${pesos(summary.paidCents)} paid of ${pesos(summary.billedCents)} billed`)}
        {figure("Last visit", summary.lastVisitOn ? formatDay(summary.lastVisitOn) : "Never")}
        {figure("Vehicles", String(summary.vehicles))}
        {figure("Jobs", String(summary.jobs), `${summary.openJobs} open · ${summary.bookings} bookings`)}
        {figure("Points", summary.points.toLocaleString("en-PH"))}
        {figure("Last score", summary.lastScore === null ? "—" : `${summary.lastScore} / 10`)}
      </dl>
      {message ? (
        <p role="alert" className="mb-4 text-xs text-critical">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="work">Jobs & bookings</TabsTrigger>
            <TabsTrigger value="money">Invoices & payments</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="card p-5">
            {data.timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing on record yet.</p>
            ) : (
              <ol className="space-y-3 text-xs">
                {data.timeline.map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className="flex gap-3">
                    <span className="tabular w-36 shrink-0 text-2xs text-subtle-foreground">{formatManilaTime(entry.at)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {entry.href ? (
                          <Link href={entry.href} className="text-brand hover:underline">
                            {entry.title}
                          </Link>
                        ) : (
                          entry.title
                        )}
                        {entry.amountCents !== null ? <span className="tabular ml-2 font-normal text-muted-foreground">{pesos(entry.amountCents)}</span> : null}
                      </p>
                      <p className="text-2xs text-subtle-foreground">{[entry.kind.replace("_", " "), entry.detail, entry.branchName].filter(Boolean).join(" · ")}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="work" className="card p-5">
            <Rows
              caption="Jobs and detailing bookings at every branch"
              head={["Reference", "What", "Branch", "When", "Status", "Amount"]}
              rows={[
                ...data.workOrders.map((o) => [<Link key="l" href={`/work-orders/${o.id}`} className="text-brand hover:underline">{o.reference || "Draft"}</Link>, `${o.title}${o.plateNumber ? ` · ${o.plateNumber}` : ""}`, o.branchName ?? "—", formatDay(o.completedOn ?? o.openedOn), o.status.replace(/_/g, " "), pesos(o.totalCents)]),
                ...data.bookings.map((b) => [<Link key="l" href={`/shop/detailing/bookings/${b.id}`} className="text-brand hover:underline">{b.reference}</Link>, `${b.packageName}${b.vehicleLabel ? ` · ${b.vehicleLabel}` : ""}`, b.branchName ?? "—", formatDay(b.scheduledDate), b.statusLabel, pesos(b.packagePriceCents)]),
              ]}
            />
          </TabsContent>

          <TabsContent value="money" className="card p-5">
            <Rows
              caption="Invoices and payments at every branch"
              head={["Number", "Kind", "Branch", "Date", "Status", "Amount"]}
              rows={[
                ...data.invoices.map((i) => [<Link key="l" href={`/invoices/${i.id}`} className="text-brand hover:underline">{i.number}</Link>, "Invoice", i.branchName ?? "—", formatDay(i.issueDate), i.balanceCents > 0 ? `${pesos(i.balanceCents)} owed` : i.status.replace(/_/g, " "), pesos(i.totalDueCents)]),
                ...data.payments.map((p) => [p.number, `Payment · ${p.methodLabel}`, p.branchName ?? "—", formatDay(p.receivedOn), p.status, pesos(p.amountCents)]),
              ]}
            />
          </TabsContent>

          <TabsContent value="messages" className="card p-5">
            {data.messages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No message has been sent or held back.</p>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {data.messages.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium">{m.subject ?? m.purposeLabel}</p>
                      <p className="text-2xs text-subtle-foreground">
                        {formatManilaTime(m.sentAt ?? m.createdAt)} · {m.purposeLabel} · {m.toAddress ?? "no address"}
                      </p>
                    </div>
                    <MessageStatus message={m} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="vehicles" className="card p-5">
            <Rows
              caption="Vehicles on the account"
              head={["Plate", "Vehicle", "Size", "Status"]}
              rows={data.vehicles.map((v) => [<Link key="l" href={`/vehicles/${v.id}`} className="text-brand hover:underline">{v.plateNumber}</Link>, [v.year, v.make, v.model].filter(Boolean).join(" "), v.sizeClass ?? "—", v.archived ? "archived" : v.status.replace(/_/g, " ")])}
            />
          </TabsContent>
        </Tabs>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
            {data.tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks.</p>
            ) : (
              <ul className="space-y-2.5 text-xs">
                {data.tasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      <p className="text-2xs text-subtle-foreground">{[TASK_KIND[task.kind] ?? task.kind, task.assigneeName ?? "Unassigned", task.dueOn ? `due ${formatDay(task.dueOn)}` : null].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <TaskStatus task={task} />
                      {works && task.status === "open" ? (
                        <button type="button" aria-label={`Mark "${task.title}" done`} onClick={async () => report(await actions.setTaskStatus(task.id, "done"))} className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-ok">
                          <CheckCircle2 className="size-4" />
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Notes</h2>
            {works ? (
              <div className="mb-3 space-y-2">
                <Textarea aria-label="New note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should the next person know?" />
                <Button
                  size="sm"
                  disabled={note.trim() === ""}
                  onClick={async () => {
                    const result = await actions.addNote(account.id, note);
                    report(result);
                    if (result.ok) setNote("");
                  }}
                >
                  Add note
                </Button>
              </div>
            ) : null}
            <ul className="space-y-3 text-xs">
              {data.notes.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="text-2xs text-subtle-foreground">
                      {n.pinned ? "Pinned · " : ""}
                      {n.authorName} · {formatManilaTime(n.createdAt)}
                    </p>
                  </div>
                  {works ? (
                    <span className="flex shrink-0">
                      <button type="button" aria-label={n.pinned ? "Unpin this note" : "Pin this note"} onClick={async () => report(await actions.pinNote(account.id, n.id, !n.pinned))} className="rounded p-1 text-subtle-foreground hover:bg-surface-2">
                        {n.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                      </button>
                      <button type="button" aria-label="Remove this note" onClick={async () => report(await actions.deleteNote(account.id, n.id))} className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-critical">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
              {data.notes.length === 0 ? <li className="text-muted-foreground">No notes yet.</li> : null}
            </ul>
          </section>

          <Membership data={data} tiers={tiers.data ?? []} works={works} onResult={report} />

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Consent</h2>
            <ul className="space-y-2 text-xs">
              {data.consents.map((consent) => (
                <li key={consent.purpose} className="flex items-center justify-between gap-2">
                  <span>{consent.label}</span>
                  {consent.granted === null ? (
                    <Badge tone="outline">
                      <Minus aria-hidden />
                      Not asked
                    </Badge>
                  ) : consent.granted ? (
                    <Badge tone="ok">
                      <CheckCircle2 aria-hidden />
                      Agreed
                    </Badge>
                  ) : (
                    <Badge tone="critical">
                      <CircleSlash aria-hidden />
                      Withdrawn
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-2xs text-subtle-foreground">
              Reminders need the second; campaigns the third. Record a decision on the{" "}
              <Link href={`/shop/clients/${account.id}`} className="text-brand hover:underline">
                account page
              </Link>
              .
            </p>
          </section>
        </aside>
      </div>

      {adding ? <TaskDialog task={null} subject={{ customerAccountId: account.id, name: account.displayName }} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function Rows({ caption, head, rows }: { caption: string; head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Nothing on record.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
          <tr>
            {head.map((label, index) => (
              <th key={label} scope="col" className={index === head.length - 1 && head.length > 4 ? "py-2 text-right font-medium" : "py-2 pr-3 font-medium"}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((cells, row) => (
            <tr key={row}>
              {cells.map((cell, index) => (
                <td key={index} className={index === cells.length - 1 && cells.length > 4 ? "tabular py-2 text-right" : "py-2 pr-3 first-letter:uppercase"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Membership({ data, tiers, works, onResult }: { data: Customer360; tiers: { id: string; name: string; isActive: boolean }[]; works: boolean; onResult: (result: { ok: boolean; error?: string }) => void }) {
  const actions = useCrmActions();
  const [tierId, setTierId] = React.useState("");
  const usable = data.packages.filter((p) => p.usable);

  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-sm font-semibold">Membership & packages</h2>
      {data.membership ? (
        <div className="text-xs">
          <p className="font-medium">
            {data.membership.tierName} · {Number(data.membership.discountPct)}% off detailing{data.membership.priorityBooking ? " · priority booking" : ""}
          </p>
          <p className="text-2xs text-subtle-foreground">
            Since {formatDay(data.membership.startedOn)}
            {data.membership.expiresOn ? ` · to ${formatDay(data.membership.expiresOn)}` : ""}
            {data.membership.perks ? ` · ${data.membership.perks}` : ""}
          </p>
          {works ? (
            <Button size="sm" variant="ghost" className="mt-2" onClick={async () => onResult(await actions.cancelMembership(data.account.id, data.membership!.id))}>
              End membership
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not a member.</p>
      )}
      {works ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger aria-label="Tier">
                <SelectValue placeholder={data.membership ? "Move to another tier" : "Enrol in a tier"} />
              </SelectTrigger>
              <SelectContent>
                {tiers.filter((tier) => tier.isActive).map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={tierId === ""}
            onClick={async () => {
              const result = await actions.enrol(data.account.id, tierId);
              onResult(result);
              if (result.ok) setTierId("");
            }}
          >
            Enrol
          </Button>
        </div>
      ) : null}
      <div className="border-t border-border pt-3 text-xs">
        {usable.length === 0 ? (
          <p className="text-muted-foreground">No prepaid credits to use.</p>
        ) : (
          <ul className="space-y-1.5">
            {usable.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>
                  {p.planName} <span className="text-2xs text-subtle-foreground">{p.reference}</span>
                </span>
                <span className="tabular">
                  {p.creditsLeft} of {p.creditsTotal} left
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/shop/crm/memberships" className="mt-2 inline-block text-2xs text-brand hover:underline">
          Sell a package
        </Link>
      </div>
    </section>
  );
}
