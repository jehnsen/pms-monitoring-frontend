"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Gauge, Hourglass, PackageCheck, Wallet, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { WorkspaceBanner } from "@/components/dashboard/workspace-banner";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { useBays, useShopHome } from "@/lib/store";
import { formatCurrency, formatCurrencyCompact, formatDate, formatTime } from "@/lib/utils";

/**
 * The service centre's day, in one call (`GET /shop/home`): who is arriving,
 * what is on the floor and for how long, quotes waiting on clients (longest
 * first, in business hours), bay load, the lot, and revenue recognised on
 * collection this week against last. Every figure is the API's; each order
 * carries its own vehicle and customer name.
 */
export default function ShopDashboardPage() {
  const { data, error, refetch } = useShopHome();
  const { bayName } = useBays();

  const header = (
    <PageHeader
      title="Shop today"
      description="Your daily overview of workshop activity and service performance."
      actions={
        <Button asChild variant="primary">
          <Link href="/shop/check-in">
            <Wrench />
            Check in vehicle
          </Link>
        </Button>
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
        <WorkspaceBanner provider />
        <StatSkeletonRow count={6} className="xl:grid-cols-3" />
        <Skeleton className="mt-5 h-96" />
      </>
    );
  }

  const { arriving, inProgress: running, awaitingApproval: approvals, readyForCollection: collectable, floor, revenue } = data;
  const longest = approvals.longest;
  const longestOrder = longest ? approvals.orders.find((o) => o.workOrder.id === longest.workOrderId)?.workOrder : null;
  const plate = (order: { vehicle: { plateNumber: string } | null }) => order.vehicle?.plateNumber ?? "—";

  return (
    <>
      {header}

      <WorkspaceBanner provider />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Arriving today"
          value={`${arriving.length}`}
          hint={arriving.length ? `Next: ${plate(arriving[0])} · ${arriving[0].customerName ?? "—"}` : "Nothing booked in"}
          icon={CalendarClock}
          tone="brand"
        />
        <StatTile
          label="In progress"
          value={`${running.length}`}
          hint={`${floor.baysWorking} of ${floor.bays.length} bays working`}
          icon={Wrench}
          tone={running.length > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Awaiting client approval"
          value={formatCurrencyCompact(approvals.totalValue)}
          hint={longest ? `Longest: ${longestOrder ? plate(longestOrder) : "—"} · ${longest.hours}h` : "Nothing waiting"}
          icon={Hourglass}
          tone={approvals.count > 0 ? "critical" : "ok"}
        />
        <StatTile
          label="Ready for collection"
          value={`${collectable.count}`}
          hint={collectable.count ? `${formatCurrency(collectable.value)} on the lot` : "Lot is clear"}
          icon={PackageCheck}
          tone={collectable.count > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Bay utilisation today"
          value={`${Math.round(floor.utilisation * 100)}%`}
          hint={`${floor.bookedHours.toFixed(1)} of ${floor.capacityHours} bay hours booked`}
          icon={Gauge}
          tone={floor.utilisation > 1 ? "critical" : floor.utilisation > 0.85 ? "warning" : "ok"}
        />
        <StatTile
          label="Revenue this week"
          value={formatCurrency(revenue.thisWeek)}
          delta={{ value: revenue.deltaPct, period: "vs last week" }}
          hint={`Last week ${formatCurrency(revenue.lastWeek)}`}
          icon={Wallet}
          tone="brand"
        />
      </div>

      {/* The approval queue leads the page: it is the shop's own money sitting
          idle, and the clearest answer when a client asks why a job is late. */}
      <section className="card-raised mt-5">
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Waiting on the client</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Quoted work that cannot start until someone on the client&apos;s side signs it off. Longest wait first.
            </p>
          </div>
          {approvals.count > 0 ? (
            <Badge tone="critical" size="md">
              <Hourglass />
              {formatCurrency(approvals.totalValue)} held up
            </Badge>
          ) : null}
        </header>

        {approvals.count === 0 ? (
          <div className="border-t border-border">
            <EmptyState icon={Hourglass} title="Nothing waiting on a client" description="Every quote you have sent has been decided." className="py-10" />
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {approvals.orders.slice(0, 6).map(({ workOrder: order, quotedValue, waitingHours }) => {
              const isLongest = longest?.workOrderId === order.id;
              return (
                <li key={order.id}>
                  <Link
                    href={`/work-orders/${order.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-surface-2/50"
                  >
                    <span className="tabular w-[92px] shrink-0 text-xs font-medium">{plate(order)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {order.title}
                      <span className="ml-2 text-subtle-foreground">{order.customerName ?? ""}</span>
                    </span>
                    <span className="tabular shrink-0 text-xs font-medium">{formatCurrency(quotedValue)}</span>
                    {isLongest ? (
                      <Badge tone="critical">
                        <Hourglass />
                        {waitingHours}h waiting
                      </Badge>
                    ) : (
                      <span className="tabular w-[72px] shrink-0 text-right text-2xs text-subtle-foreground">{waitingHours}h</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card-raised">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">In the bays</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">Work under way now, with time on the job so far.</p>
          </header>
          {running.length === 0 ? (
            <div className="border-t border-border">
              <EmptyState icon={Wrench} title="No jobs under way" description="Nothing has been started on the floor yet today." className="py-10" />
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Vehicle", "Technician", "Bay", "Elapsed", "Est."].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {running.map(({ workOrder: order, elapsed, estimatedHours, overEstimate }) => (
                    <tr key={order.id} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3">
                        <Link href={`/work-orders/${order.id}`} className="tabular text-xs font-medium transition-colors hover:text-brand">
                          {plate(order)}
                        </Link>
                        <span className="block truncate text-2xs text-subtle-foreground">{order.customerName ?? "—"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{order.technician || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{bayName(order.bayId)}</td>
                      <td className={`tabular whitespace-nowrap px-4 py-3 text-xs ${overEstimate ? "font-medium text-critical" : "text-muted-foreground"}`}>
                        {elapsed}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-subtle-foreground">{estimatedHours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card-raised">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">Bay load today</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">Booked hours against each bay&apos;s working day.</p>
          </header>
          <ul className="divide-y divide-border border-t border-border">
            {floor.bays.map((load) => (
              <li key={load.bayId} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium">{load.name}</span>
                  <span className="tabular text-2xs text-subtle-foreground">
                    {load.bookedHours.toFixed(1)} / {load.capacityHours}h
                  </span>
                </div>
                <Meter
                  className="mt-2"
                  value={load.utilisation}
                  tone={load.utilisation > 1 ? "critical" : load.utilisation > 0.85 ? "warning" : "ok"}
                  label={`${load.name} utilisation`}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card-raised">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">Arriving today</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">Booked in and not yet started.</p>
          </header>
          {arriving.length === 0 ? (
            <div className="border-t border-border">
              <EmptyState icon={CalendarClock} title="Nothing booked in" description="No vehicles are expected on the floor today." className="py-10" />
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {arriving.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <span className="tabular w-[92px] shrink-0 text-xs font-medium">{plate(order)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{order.customerName ?? "—"}</span>
                  <span className="tabular shrink-0 text-2xs text-subtle-foreground">{formatTime(order.scheduledTime)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-raised">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Ready for collection</h3>
              <p className="mt-0.5 text-xs text-subtle-foreground">Finished, still on the lot.</p>
            </div>
            {collectable.count > 0 ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/shop/check-in?tab=check-out">
                  Release
                  <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </header>
          {collectable.count === 0 ? (
            <div className="border-t border-border">
              <EmptyState icon={PackageCheck} title="Lot is clear" description="Everything finished has been collected." className="py-10" />
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {collectable.orders.slice(0, 6).map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <span className="tabular w-[92px] shrink-0 text-xs font-medium">{plate(order)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{order.customerName ?? "—"}</span>
                  <span className="tabular shrink-0 text-2xs text-subtle-foreground">{order.completedOn ? formatDate(order.completedOn) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
