"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Car, ChevronRight, ClipboardList, Clock, FileWarning, OctagonAlert, Timer, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FleetMetric } from "@/components/dashboard/fleet-metric";
import { ComplianceBar } from "@/components/dashboard/compliance-bar";
import { AttentionList } from "@/components/dashboard/attention-list";
import { CostTrendChart } from "@/components/charts/cost-trend-chart";
import { UpcomingLoadChart } from "@/components/charts/upcoming-load-chart";
import { WorkOrderTable } from "@/components/work-orders/work-order-table";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useFleet } from "@/lib/store";
import { monthlyCosts, rollingSpend, serviceDemand, upcomingLoad } from "@/lib/analytics";
import { DUE_SOON_DAYS, isOdometerStale } from "@/lib/pms";
import { DASHBOARD_EXPIRY_WINDOW_DAYS, expiringDocumentSummary } from "@/lib/compliance";
import { useCan } from "@/lib/rbac";
import { isProviderRole } from "@/lib/tenancy";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

function ProviderRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/shop"); }, [router]);
  return <Skeleton className="h-96" />;
}

export default function DashboardPage() {
  const { ready, health, workOrders, vehicles, documents, summary, tenant } = useFleet();
  const { role } = useCan();
  if (isProviderRole(role)) return <ProviderRedirect />;

  if (!ready) {
    return (
      <>
        <PageHeader title="Fleet overview" description="Your fleet, maintenance priorities, and service performance." />
        <StatSkeletonRow />
        <Skeleton className="mt-4 h-20" />
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Skeleton className="h-80" /><Skeleton className="h-80" />
        </div>
      </>
    );
  }

  const costs = monthlyCosts(workOrders);
  const load = upcomingLoad(health);
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const spend = rollingSpend(workOrders, 30);
  const demand = serviceDemand(health);
  const activeOrders = workOrders
    .filter((order) => order.status !== "closed" && order.status !== "cancelled")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const staleCount = vehicles.filter((vehicle) => isOdometerStale(vehicle)).length;
  const expiring = expiringDocumentSummary(vehicles, documents, DASHBOARD_EXPIRY_WINDOW_DAYS);
  const previewOrders = activeOrders.slice(0, 5);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle-foreground">
          <span className="h-3 w-0.5 rounded-full bg-brand" />{tenant.displayName} / Fleet management
        </p>
        <PageHeader
          className="mb-0"
          title="Fleet overview"
          description="Your fleet, maintenance priorities, and service performance."
          actions={<>
            <Button asChild><Link href="/schedule"><CalendarDays />Service schedule</Link></Button>
            <NewWorkOrderDialog />
          </>}
        />
      </div>

      <section aria-label="Key fleet metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FleetMetric featured label="Vehicles in operation" value={`${summary.total - summary.inService - summary.down}`} detail={`${summary.total} total · ${summary.inService} in service · ${summary.down} off road`} icon={Car} href="/vehicles" />
        <FleetMetric label="Overdue service items" value={`${demand.overdue.count}`} detail={`${demand.overdue.vehicleCount} vehicles · est. ${formatCurrencyCompact(demand.overdue.estimatedCost)} to clear`} icon={OctagonAlert} tone={demand.overdue.count ? "critical" : "ok"} href="/schedule?status=overdue" />
        <FleetMetric label={`Due in ${DUE_SOON_DAYS} days`} value={`${demand.dueSoon.count}`} detail={`${demand.dueSoon.vehicleCount} vehicles · est. ${formatCurrencyCompact(demand.dueSoon.estimatedCost)}`} icon={Timer} tone="warning" href="/schedule?status=due_soon" />
        <FleetMetric label="Maintenance spend" value={formatCurrency(spend.current)} detail="Last 30 days · view cost breakdown" icon={Wallet} href="/reports" />
      </section>

      <section aria-label="Fleet reminders" className="grid gap-3 md:grid-cols-2">
        <Link href="/vehicles?pms=stale" className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-brand/35">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15"><Clock className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{staleCount} odometer {staleCount === 1 ? "reading needs" : "readings need"} updating</p>
            <p className="mt-1 text-[11px] leading-relaxed text-subtle-foreground">{staleCount ? "Over 14 days old. Update readings for accurate forecasts." : "All vehicle readings are up to date."}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-subtle-foreground group-hover:text-brand" />
        </Link>
        <Link href="/documents" className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-brand/35">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand"><FileWarning className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{expiring.total} {expiring.total === 1 ? "document expires" : "documents expire"} within {DASHBOARD_EXPIRY_WINDOW_DAYS} days</p>
            <p className="mt-1 text-[11px] leading-relaxed text-subtle-foreground">{expiring.total ? "Review renewals and keep your fleet compliant." : "Nothing is due for renewal."}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-subtle-foreground group-hover:text-brand" />
        </Link>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <UpcomingLoadChart data={load} />
        <ComplianceBar summary={summary} />
        <CostTrendChart data={costs} />
        <AttentionList health={health} limit={3} />
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand"><ClipboardList className="size-4" /></span>
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">Active work orders <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{activeOrders.length}</span></h2>
              <p className="mt-1 text-xs text-subtle-foreground">Next up, ordered by scheduled date.</p>
            </div>
          </div>
          <Button asChild size="sm"><Link href="/work-orders">View all work orders<ArrowRight /></Link></Button>
        </header>
        <div className="border-t border-border">
          <WorkOrderTable orders={previewOrders} vehiclesById={vehiclesById} emptyTitle="No active work orders" emptyDescription="There are no open jobs to display." />
        </div>
        {activeOrders.length > previewOrders.length ? <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2/40 px-5 py-3 text-[11px] text-muted-foreground">
          <span>Showing {previewOrders.length} of {activeOrders.length} active work orders</span>
          <Link href="/work-orders" className="inline-flex items-center gap-1.5 rounded font-medium text-brand hover:underline">Open work-order list<ArrowRight className="size-3" /></Link>
        </footer> : null}
      </section>
    </div>
  );
}
