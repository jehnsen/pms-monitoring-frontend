"use client";

import { useMemo, useState } from "react";
import { Wallet, Wrench, Gauge, PiggyBank } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { CostTrendChart } from "@/components/charts/cost-trend-chart";
import { MaintenanceMixChart } from "@/components/charts/maintenance-mix-chart";
import { SpendRankingChart } from "@/components/charts/spend-ranking-chart";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFleet } from "@/lib/store";
import {
  meanDaysBetweenServices,
  monthlyCosts,
  serviceFrequency,
  spendByCategory,
  spendByVehicle,
} from "@/lib/analytics";
import { workOrderCost } from "@/lib/pms";
import { formatCurrency, formatCurrencyCompact, sum } from "@/lib/utils";

const RANGES = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

export default function ReportsPage() {
  const { ready, workOrders, health, vehicles, summary } = useFleet();
  const [range, setRange] = useState("12");

  const months = Number(range);

  const costs = useMemo(
    () => monthlyCosts(workOrders, months),
    [workOrders, months]
  );

  // The range filter scopes every chart on the page, so the underlying order
  // set is narrowed once here rather than per card.
  const scopedOrders = useMemo(() => {
    const keys = new Set(costs.map((point) => point.key));
    return workOrders.filter(
      (order) =>
        order.status === "completed" &&
        order.completedOn &&
        keys.has(order.completedOn.slice(0, 7))
    );
  }, [workOrders, costs]);

  if (!ready) {
    return (
      <>
        <PageHeader title="Reports" description="Cost and compliance analysis." />
        <StatSkeletonRow />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </>
    );
  }

  const totalSpend = sum(scopedOrders.map(workOrderCost));
  const preventiveSpend = sum(
    scopedOrders.filter((o) => o.type !== "corrective").map(workOrderCost)
  );
  const preventiveShare = totalSpend
    ? Math.round((preventiveSpend / totalSpend) * 100)
    : 0;

  const totalKm = sum(vehicles.map((v) => v.odometer));
  const costPerKm = totalKm ? totalSpend / totalKm : 0;

  return (
    <>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total maintenance spend"
          value={formatCurrency(totalSpend)}
          hint={`${scopedOrders.length} closed work orders`}
          icon={Wallet}
          trend={costs.map((point) => point.total)}
        />
        <StatTile
          label="Preventive share of spend"
          value={`${preventiveShare}%`}
          hint="Planned work as a share of the total"
          icon={Wrench}
          tone={preventiveShare >= 60 ? "ok" : "warning"}
        />
        <StatTile
          label="Cost per fleet kilometre"
          value={`₱${costPerKm.toFixed(2)}`}
          hint={`Across ${formatCurrencyCompact(totalKm).replace("₱", "")} km logged`}
          icon={Gauge}
        />
        <StatTile
          label="Mean days between services"
          value={String(
            meanDaysBetweenServices(scopedOrders, summary.total, months)
          )}
          hint={`${summary.total} vehicles · ${scopedOrders.length} services in period`}
          icon={PiggyBank}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <CostTrendChart data={costs} />
        <MaintenanceMixChart data={costs} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <SpendRankingChart
          title="Highest-cost vehicles"
          description="Closed spend per unit. The costliest unit is highlighted; the rest are context."
          data={spendByVehicle(scopedOrders, health, 8)}
          highlightFirst
          height={296}
        />
        <SpendRankingChart
          title="Spend by service item"
          description="What the money was actually spent on, ranked."
          data={spendByCategory(scopedOrders).slice(0, 8)}
          height={296}
        />
      </div>

      <div className="mt-5">
        <SpendRankingChart
          title="Maintenance frequency"
          description="Completed services per 10,000 km. Normalising by distance keeps hard-worked units from looking worse simply for covering more ground."
          data={serviceFrequency(scopedOrders, health, 10)}
          unitLabel="Services / 10,000 km"
          valueFormat="number"
          height={330}
        />
      </div>
    </>
  );
}
