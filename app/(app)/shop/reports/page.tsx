"use client";

import { useState } from "react";
import { subMonths } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Meter } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpendRankingChart } from "@/components/charts/spend-ranking-chart";
import { MaintenanceMixChart } from "@/components/charts/maintenance-mix-chart";
import { BayUtilisationChart } from "@/components/charts/bay-utilisation-chart";
import { useFleet } from "@/lib/store";
import { monthlyCosts } from "@/lib/analytics";
import {
  PARTS_MARKUP,
  approvalTurnaroundByClient,
  partsMargin,
  revenueByClient,
  revenueByServiceItem,
  utilisationSeries,
} from "@/lib/shop";
import { formatCurrency } from "@/lib/utils";

const RANGES = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

export default function ShopReportsPage() {
  const { ready, workOrders, vehicles, fleetClients } = useFleet();
  const [months, setMonths] = useState("6");

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Reports"
          description="The book of work, cut by the questions a shop owner asks."
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  const now = new Date();
  const window = Number(months);
  const from = subMonths(now, window);

  const byClient = revenueByClient(fleetClients, vehicles, workOrders, from, now);
  const byService = revenueByServiceItem(workOrders, from, now).slice(0, 10);
  const utilisation = utilisationSeries(workOrders, 21, now);
  const turnaround = approvalTurnaroundByClient(fleetClients, vehicles, workOrders);
  const mix = monthlyCosts(workOrders, window);
  const margin = partsMargin(workOrders);

  const partsTotal = margin.supplierProvidedValue + margin.ownStockValue;
  const ownStockShare = partsTotal ? margin.ownStockValue / partsTotal : 0;

  return (
    <>
      <PageHeader
        title="Reports"
        description="The book of work, cut by the questions a shop owner asks rather than a fleet manager."
      />

      {/* One filter row above everything it scopes. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="w-[184px]" aria-label="Reporting period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SpendRankingChart
          title="Revenue by client"
          description="Collected work over the period, biggest account first."
          data={byClient}
          unitLabel="Revenue"
          highlightFirst
          axisWidth={148}
        />

        <SpendRankingChart
          title="Revenue by service item"
          description="Which jobs actually pay. Multi-item work orders split evenly across their items."
          data={byService}
          unitLabel="Revenue"
          axisWidth={148}
        />

        <BayUtilisationChart data={utilisation} className="xl:col-span-2" />

        <SpendRankingChart
          title="Approval turnaround by client"
          description="Mean working hours from quote sent to decision — who is slow to say yes."
          data={turnaround}
          unitLabel="Hours"
          valueFormat="number"
          highlightFirst
          axisWidth={148}
        />

        <MaintenanceMixChart data={mix} />

        <section className="card-raised flex flex-col xl:col-span-2">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">
              Parts consumption and margin
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-subtle-foreground">
              Across all closed work. Lines the client supplied from their own
              stock pass through the job at cost — the shop fits them but earns
              nothing on them, so they are excluded from margin.
            </p>
          </header>

          <div className="grid gap-5 border-t border-border px-5 py-5 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Supplier-provided
              </p>
              <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight">
                {formatCurrency(margin.supplierProvidedValue)}
              </p>
              <p className="mt-2 text-2xs text-subtle-foreground">
                Parts the shop sourced and marked up.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Client&apos;s own stock
              </p>
              <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight">
                {formatCurrency(margin.ownStockValue)}
              </p>
              <p className="mt-2 text-2xs text-subtle-foreground">
                Fitted at cost. No margin to the shop.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Margin earned
              </p>
              <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight">
                {formatCurrency(Math.round(margin.margin))}
              </p>
              <p className="mt-2 text-2xs text-subtle-foreground">
                At the shop&apos;s {Math.round(PARTS_MARKUP * 100)}% markup.
              </p>
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Share of parts value supplied by clients
              </span>
              <span className="tabular text-xs font-medium">
                {Math.round(ownStockShare * 100)}%
              </span>
            </div>
            <Meter
              className="mt-2"
              value={ownStockShare}
              tone={ownStockShare > 0.5 ? "warning" : "ok"}
              label="Share of parts value supplied by clients"
            />
            <p className="mt-2 text-2xs leading-relaxed text-subtle-foreground">
              The higher this runs, the more the shop is selling labour alone.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
