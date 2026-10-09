"use client";

import { useState } from "react";
import { Wallet, Wrench, Gauge, PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { CostTrendChart } from "@/components/charts/cost-trend-chart";
import { MaintenanceMixChart } from "@/components/charts/maintenance-mix-chart";
import { SpendRankingChart } from "@/components/charts/spend-ranking-chart";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReports } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";

const RANGES = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

/**
 * Where the maintenance budget goes. Every figure — totals, preventive share,
 * cost per km (on distance driven in the period), mean days between services
 * and the rankings — is the API's (`GET /analytics/reports?months=`), counting
 * only orders closed in the window.
 */
export default function ReportsPage() {
  const [range, setRange] = useState("12");
  const months = Number(range);
  const { data, error, refetch, isPlaceholderData } = useReports(months);

  const header = (
    <PageHeader
      title="Reports"
      description="Where the maintenance budget goes, and whether preventive work is holding unplanned repairs down."
      actions={
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[168px]" aria-label="Reporting period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <QueryError error={error} onRetry={() => void refetch()} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        {header}
        <StatSkeletonRow />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </>
    );
  }

  return (
    <div className={cn(isPlaceholderData && "opacity-70")}>
      {header}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total maintenance spend"
          value={formatCurrency(data.totalSpend)}
          hint={`${data.closedOrders} closed work orders`}
          icon={Wallet}
          trend={data.monthlyCosts.map((point) => point.total)}
        />
        <StatTile
          label="Preventive share of spend"
          value={`${data.preventiveSharePct}%`}
          hint="Planned work as a share of the total"
          icon={Wrench}
          tone={data.preventiveSharePct >= 60 ? "ok" : "warning"}
        />
        <StatTile
          label="Cost per fleet kilometre"
          value={`₱${data.costPerKm.toFixed(2)}`}
          hint={`Across ${Math.round(data.periodKm / 1000)}k km driven in period`}
          icon={Gauge}
        />
        <StatTile
          label="Mean days between services"
          value={String(data.meanDaysBetweenServices)}
          hint={`${data.vehicleCount} vehicles · ${data.closedOrders} services in period`}
          icon={PiggyBank}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <CostTrendChart data={data.monthlyCosts} />
        <MaintenanceMixChart data={data.monthlyCosts} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SpendRankingChart
          title="Highest-cost vehicles"
          description="Closed spend per unit. The costliest unit is highlighted; the rest are context."
          data={data.spendByVehicle}
          highlightFirst
          height={296}
        />
        <SpendRankingChart
          title="Spend by service item"
          description="What the money was actually spent on, ranked."
          data={data.spendByServiceItem}
          height={296}
        />
      </div>

      <div className="mt-5">
        <SpendRankingChart
          title="Maintenance frequency"
          description="Completed services per 10,000 km. Normalising by distance keeps hard-worked units from looking worse simply for covering more ground."
          data={data.serviceFrequency}
          unitLabel="Services / 10,000 km"
          valueFormat="number"
          height={330}
        />
      </div>
    </div>
  );
}
