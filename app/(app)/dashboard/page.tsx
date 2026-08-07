"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Car, Clock, FileWarning, OctagonAlert, Timer, Wallet } from "lucide-react";
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
import {
  monthlyCosts,
  rollingSpend,
  serviceDemand,
  upcomingLoad,
} from "@/lib/analytics";
import { DUE_SOON_DAYS, isOdometerStale } from "@/lib/pms";
import { DASHBOARD_EXPIRY_WINDOW_DAYS, expiringDocumentSummary } from "@/lib/compliance";
import { useCan } from "@/lib/rbac";
import { isProviderRole } from "@/lib/tenancy";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

/** Bounces provider staff to their own home screen. */
function ProviderRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/shop");
  }, [router]);
  return <Skeleton className="h-96" />;
}

export default function DashboardPage() {
  const { ready, health, workOrders, vehicles, documents, summary } = useFleet();
  const { role } = useCan();

  // A provider user reaching this by URL would be looking at every client's
  // fleet merged into one compliance view, which is not their job. Their home
  // is the shop floor.
  if (isProviderRole(role)) return <ProviderRedirect />;

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
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

  // Equal trailing windows, so the comparison holds mid-month.
  const spend = rollingSpend(workOrders, 30);

  // Same selector the schedule page reads, so the two cannot disagree.
  const demand = serviceDemand(health);

  const activeOrders = workOrders
    .filter((order) => order.status !== "closed" && order.status !== "cancelled")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const staleCount = vehicles.filter((vehicle) => isOdometerStale(vehicle)).length;
  const expiring = expiringDocumentSummary(vehicles, documents, DASHBOARD_EXPIRY_WINDOW_DAYS);

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
          value={`${demand.overdue.count}`}
          hint={`${demand.overdue.vehicleCount} ${
            demand.overdue.vehicleCount === 1 ? "vehicle" : "vehicles"
          } · est. ${formatCurrencyCompact(demand.overdue.estimatedCost)} to clear`}
          icon={OctagonAlert}
          tone={demand.overdue.count > 0 ? "critical" : "ok"}
        />
        <StatTile
          label={`Due soon (${DUE_SOON_DAYS} days)`}
          value={`${demand.dueSoon.count}`}
          hint={`${demand.dueSoon.vehicleCount} ${
            demand.dueSoon.vehicleCount === 1 ? "vehicle" : "vehicles"
          } · est. ${formatCurrencyCompact(demand.dueSoon.estimatedCost)} to clear`}
          icon={Timer}
          tone="warning"
        />
        <StatTile
          label="Spend, last 30 days"
          value={formatCurrency(spend.current)}
          icon={Wallet}
          tone="brand"
          delta={{
            value: spend.deltaPct,
            period: "vs previous 30 days",
            goodDirection: "down",
          }}
          trend={costs.map((point) => point.total)}
        />
        <Link href="/vehicles?pms=stale" className="block">
          <StatTile
            label="Vehicles with stale odometer"
            value={`${staleCount} of ${summary.total}`}
            hint="No reading in over 14 days — projections may be off."
            icon={Clock}
            tone={staleCount > 0 ? "warning" : "ok"}
          />
        </Link>
        <Link href="/documents" className="block">
          <StatTile
            label={`Documents expiring within ${DASHBOARD_EXPIRY_WINDOW_DAYS} days`}
            value={`${expiring.total}`}
            hint={
              expiring.byKind.length
                ? expiring.byKind.map((entry) => `${entry.count} ${entry.label}`).join(" · ")
                : "Nothing due for renewal"
            }
            icon={FileWarning}
            tone={expiring.total > 0 ? "warning" : "ok"}
          />
        </Link>
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
