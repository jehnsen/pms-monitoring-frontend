"use client";

import Link from "next/link";
import { ArrowRight, Car, OctagonAlert, Timer, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ComplianceBar } from "@/components/dashboard/compliance-bar";
import { AttentionList } from "@/components/dashboard/attention-list";
import { CostTrendChart } from "@/components/charts/cost-trend-chart";
import { UpcomingLoadChart } from "@/components/charts/upcoming-load-chart";
import { WorkOrderTable } from "@/components/work-orders/work-order-table";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import { useFleet } from "@/lib/store";
import { monthlyCosts, upcomingLoad, urgentItems, forecastCost } from "@/lib/analytics";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

export default function DashboardPage() {
  const { ready, health, workOrders, vehicles, summary } = useFleet();

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Fleet overview"
          description="Preventive maintenance status across every vehicle."
        />
        <StatSkeletonRow />
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </>
    );
  }

  const costs = monthlyCosts(workOrders);
  const load = upcomingLoad(health);
  const urgent = urgentItems(health);
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

  const thisMonth = costs[costs.length - 1]?.total ?? 0;
  const lastMonth = costs[costs.length - 2]?.total ?? 0;
  const spendDelta = lastMonth
    ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
    : 0;

  const overdueItems = urgent.filter((entry) => entry.item.status === "overdue");
  const dueSoonItems = urgent.filter((entry) => entry.item.status === "due_soon");

  const activeOrders = workOrders
    .filter((order) => order.status !== "completed" && order.status !== "cancelled")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  return (
    <>
      <PageHeader
        title="Fleet overview"
        description="Preventive maintenance status across every vehicle, refreshed against today's odometer readings."
        actions={<NewWorkOrderDialog />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Vehicles in operation"
          value={`${summary.total - summary.inService - summary.down}`}
          hint={`${summary.inService} in the shop · ${summary.down} off road`}
          icon={Car}
          tone="brand"
        />
        <StatTile
          label="Overdue service items"
          value={`${overdueItems.length}`}
          hint={`Across ${summary.overdue} ${summary.overdue === 1 ? "vehicle" : "vehicles"}`}
          icon={OctagonAlert}
          tone={overdueItems.length > 0 ? "critical" : "ok"}
        />
        <StatTile
          label="Due within 21 days"
          value={`${dueSoonItems.length}`}
          hint={`Est. ${formatCurrencyCompact(forecastCost(health))} to clear the backlog`}
          icon={Timer}
          tone="warning"
        />
        <StatTile
          label="Spend this month"
          value={formatCurrency(thisMonth)}
          icon={Wallet}
          tone="brand"
          delta={{
            value: spendDelta,
            period: "vs last month",
            goodDirection: "down",
          }}
          trend={costs.map((point) => point.total)}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <ComplianceBar summary={summary} />
        <UpcomingLoadChart data={load} className="lg:col-span-2" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <CostTrendChart data={costs} className="lg:col-span-2" />
        <AttentionList health={health} />
      </div>

      <section className="card-raised mt-5">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Active work orders
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Open, scheduled, and in-progress jobs across the fleet.
            </p>
          </div>
          <Link
            href="/work-orders"
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-brand transition-colors hover:underline"
          >
            All work orders
            <ArrowRight className="size-3.5" />
          </Link>
        </header>
        <div className="border-t border-border">
          <WorkOrderTable
            orders={activeOrders}
            vehiclesById={vehiclesById}
            emptyTitle="Nothing in the bay"
            emptyDescription="Every raised work order has been closed out."
          />
        </div>
      </section>
    </>
  );
}
