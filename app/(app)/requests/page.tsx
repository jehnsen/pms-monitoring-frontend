"use client";

import Link from "next/link";
import { CalendarClock, ClipboardCheck, Hourglass, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityBadge } from "@/components/status";
import { QueryError } from "@/components/ui/query-error";
import { useRequests } from "@/lib/store";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

export default function RequestsPage() {
  // Who may decide what, waits, SLA breaches and committed spend against the
  // budget: all the API's (`GET /requests`), each order against its own settings.
  const { data, error, refetch } = useRequests();

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  if (!data) {
    return (
      <>
        <PageHeader
          title="Requests"
          description="Purchases waiting on your approval, and what's already cleared."
        />
        <StatSkeletonRow />
        <Skeleton className="mt-5 h-96" />
      </>
    );
  }

  const pendingOrders = data.pending;
  const myPendingCount = data.myPending.lineCount;
  const myPendingValue = data.myPending.value;
  const committedThisPeriod = data.committedThisPeriod;
  const budgetUsedPct = data.budgetUsedPct;
  const avgTurnaround = data.avgTurnaroundHours;

  return (
    <>
      <PageHeader
        title="Requests"
        description="Purchases waiting on your approval, and what's already cleared."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Awaiting my approval"
          value={`${myPendingCount}`}
          hint={`${formatCurrencyCompact(myPendingValue)} in pending lines`}
          icon={ClipboardCheck}
          tone={myPendingCount > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Approved, awaiting scheduling"
          value={`${data.awaitingScheduling}`}
          hint="Cleared purchasing, not yet on the bay calendar"
          icon={CalendarClock}
          tone="brand"
        />
        <StatTile
          label="Committed spend this period"
          value={formatCurrency(committedThisPeriod)}
          hint={`${budgetUsedPct}% of ${formatCurrencyCompact(data.monthlyBudget)} monthly budget`}
          icon={Wallet}
          tone={budgetUsedPct > 100 ? "critical" : budgetUsedPct > 80 ? "warning" : "ok"}
        />
        <StatTile
          label="Average approval turnaround"
          value={avgTurnaround > 0 ? `${avgTurnaround}h` : "—"}
          hint="Business hours from raised to decided"
          icon={Hourglass}
          tone="brand"
        />
      </div>

      <section className="card-raised mt-5">
        <header className="px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold tracking-tight">Pending approval</h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            Oldest first — approve, decline, or defer each line from the work
            order itself.
          </p>
        </header>

        {pendingOrders.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState
              icon={ClipboardCheck}
              title="Nothing waiting"
              description="Every purchase has been decided."
              className="py-10"
            />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Reference", "Vehicle", "Job", "Priority", "Pending value", "Waiting", ""].map(
                    (heading, index) => (
                      <th
                        key={heading || index}
                        scope="col"
                        className={`whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground ${
                          heading === "Pending value" ? "text-right" : ""
                        }`}
                      >
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingOrders.map((order) => {
                  const waited = order.waitingHours;
                  const breached = order.breached;

                  return (
                    <tr key={order.workOrderId} className="transition-colors hover:bg-surface-2/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/work-orders/${order.workOrderId}`}
                          className="text-xs font-medium transition-colors hover:text-brand"
                        >
                          {order.displayReference}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {order.vehicle.plateNumber}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-xs">
                        {order.title}
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={order.priority} />
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                        {formatCurrency(order.pendingValue)}
                      </td>
                      <td
                        className={`tabular whitespace-nowrap px-4 py-3 text-xs ${
                          breached ? "font-medium text-critical" : "text-muted-foreground"
                        }`}
                      >
                        {waited}h{breached ? ` · past ${order.slaHours}h SLA` : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/work-orders/${order.workOrderId}`}
                          className="text-2xs font-medium text-brand hover:underline"
                        >
                          {order.canApprove ? "Review" : "View"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
