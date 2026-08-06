"use client";

import Link from "next/link";
import { startOfMonth } from "date-fns";
import { CalendarClock, ClipboardCheck, Hourglass, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityBadge } from "@/components/status";
import { useFleet } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { canApprove, lineCost, pendingValue, businessHoursBetween } from "@/lib/approvals";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

export default function RequestsPage() {
  const { ready, workOrders, vehiclesById, approvalSettings } = useFleet();
  const { role } = useCan();

  if (!ready) {
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

  const now = new Date();

  const pendingOrders = workOrders
    .filter((order) => order.status === "pending_approval")
    .sort((a, b) =>
      (a.pendingApprovalEnteredAt ?? "").localeCompare(b.pendingApprovalEnteredAt ?? "")
    );

  const myPendingLines = pendingOrders.flatMap((order) => {
    const orderPendingValue = pendingValue(order.lines);
    if (!role || !canApprove(role, orderPendingValue, approvalSettings)) return [];
    return order.lines
      .filter((line) => line.approvalStatus === "pending")
      .map((line) => ({ order, line }));
  });
  const myPendingValue = myPendingLines.reduce(
    (total, { line }) => total + lineCost(line),
    0
  );

  const awaitingScheduling = workOrders.filter(
    (order) => order.status === "approved" || order.status === "partially_approved"
  );

  const monthStart = startOfMonth(now);
  const committedThisPeriod = workOrders.reduce((total, order) => {
    const approvedThisMonth = order.lines
      .filter(
        (line) =>
          line.approvalStatus === "approved" &&
          line.approvedAt &&
          new Date(line.approvedAt) >= monthStart
      )
      .reduce((sum, line) => sum + lineCost(line), 0);
    return total + approvedThisMonth;
  }, 0);
  const budgetUsedPct = approvalSettings.monthlyBudget
    ? Math.round((committedThisPeriod / approvalSettings.monthlyBudget) * 100)
    : 0;

  const resolvedWaitHours = workOrders
    .map((order) => order.approvalWaitHours)
    .filter((hours): hours is number => hours !== null);
  const avgTurnaround = resolvedWaitHours.length
    ? Math.round(
        (resolvedWaitHours.reduce((total, hours) => total + hours, 0) /
          resolvedWaitHours.length) *
          10
      ) / 10
    : 0;

  return (
    <>
      <PageHeader
        title="Requests"
        description="Purchases waiting on your approval, and what's already cleared."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Awaiting my approval"
          value={`${myPendingLines.length}`}
          hint={`${formatCurrencyCompact(myPendingValue)} in pending lines`}
          icon={ClipboardCheck}
          tone={myPendingLines.length > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Approved, awaiting scheduling"
          value={`${awaitingScheduling.length}`}
          hint="Cleared purchasing, not yet on the bay calendar"
          icon={CalendarClock}
          tone="brand"
        />
        <StatTile
          label="Committed spend this period"
          value={formatCurrency(committedThisPeriod)}
          hint={`${budgetUsedPct}% of ${formatCurrencyCompact(approvalSettings.monthlyBudget)} monthly budget`}
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
                  const vehicle = vehiclesById.get(order.vehicleId);
                  const orderPendingValue = pendingValue(order.lines);
                  const waited = order.pendingApprovalEnteredAt
                    ? businessHoursBetween(new Date(order.pendingApprovalEnteredAt), now)
                    : 0;
                  const breached = waited > approvalSettings.slaHours;

                  return (
                    <tr key={order.id} className="transition-colors hover:bg-surface-2/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/work-orders/${order.id}`}
                          className="text-xs font-medium transition-colors hover:text-brand"
                        >
                          {order.reference}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {vehicle?.plateNumber ?? "—"}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-xs">
                        {order.title}
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={order.priority} />
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                        {formatCurrency(orderPendingValue)}
                      </td>
                      <td
                        className={`tabular whitespace-nowrap px-4 py-3 text-xs ${
                          breached ? "font-medium text-critical" : "text-muted-foreground"
                        }`}
                      >
                        {waited}h{breached ? ` · past ${approvalSettings.slaHours}h SLA` : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/work-orders/${order.id}`}
                          className="text-2xs font-medium text-brand hover:underline"
                        >
                          Review
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
