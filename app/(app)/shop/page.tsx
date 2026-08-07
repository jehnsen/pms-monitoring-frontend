"use client";

import Link from "next/link";
import { subDays, startOfWeek } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  Gauge,
  Hourglass,
  PackageCheck,
  Wallet,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatSkeletonRow, Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useFleet } from "@/lib/store";
import { bayName } from "@/lib/bays";
import {
  arrivingToday,
  awaitingApproval,
  elapsedMinutes,
  estimatedHours,
  floorUtilisation,
  formatDuration,
  inProgress,
  readyForCollection,
  revenueBetween,
  today as startOfToday,
} from "@/lib/shop";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatTime,
} from "@/lib/utils";

export default function ShopDashboardPage() {
  const { ready, workOrders, vehiclesById, fleetClients } = useFleet();

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Shop today"
          description="What is in the bays, who is waiting on you, and what it is worth."
        />
        <StatSkeletonRow />
        <Skeleton className="mt-5 h-96" />
      </>
    );
  }

  const now = new Date();
  const day = startOfToday(now);

  const arriving = arrivingToday(workOrders, now);
  const running = inProgress(workOrders);
  const approvals = awaitingApproval(workOrders, now);
  const collectable = readyForCollection(workOrders);
  const floor = floorUtilisation(workOrders, day);

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subDays(weekStart, 7);
  const thisWeek = revenueBetween(workOrders, weekStart, now);
  const lastWeek = revenueBetween(workOrders, lastWeekStart, weekStart);
  const weekDelta = lastWeek
    ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
    : 0;

  const clientName = (vehicleId: string) => {
    const vehicle = vehiclesById.get(vehicleId);
    if (!vehicle) return "—";
    return (
      fleetClients.find((c) => c.id === vehicle.fleetClientId)?.name ?? "—"
    );
  };

  const longest = approvals.longest;
  const longestVehicle = longest ? vehiclesById.get(longest.order.vehicleId) : null;

  return (
    <>
      <PageHeader
        title="Shop today"
        description="What is in the bays, who is waiting on you, and what it is worth."
        actions={
          <Button asChild variant="primary">
            <Link href="/shop/check-in">Check a vehicle in</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Arriving today"
          value={`${arriving.length}`}
          hint={
            arriving.length
              ? `Next: ${vehiclesById.get(arriving[0].vehicleId)?.plateNumber ?? "—"} · ${clientName(arriving[0].vehicleId)}`
              : "Nothing booked in"
          }
          icon={CalendarClock}
          tone="brand"
        />
        <StatTile
          label="In progress"
          value={`${running.length}`}
          hint={`${floor.loads.filter((l) => l.jobs.length > 0).length} of ${floor.loads.length} bays working`}
          icon={Wrench}
          tone={running.length > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Awaiting client approval"
          value={formatCurrencyCompact(approvals.totalValue)}
          hint={
            longest
              ? `Longest: ${longestVehicle?.plateNumber ?? longest.order.reference} · ${longest.hours}h`
              : "Nothing waiting"
          }
          icon={Hourglass}
          tone={approvals.count > 0 ? "critical" : "ok"}
        />
        <StatTile
          label="Ready for collection"
          value={`${collectable.length}`}
          hint={
            collectable.length
              ? `${formatCurrency(collectable.reduce((t, o) => t + o.laborCost + o.partsCost, 0))} on the lot`
              : "Lot is clear"
          }
          icon={PackageCheck}
          tone={collectable.length > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Bay utilisation today"
          value={`${Math.round(floor.utilisation * 100)}%`}
          hint={`${floor.bookedHours.toFixed(1)} of ${floor.capacityHours} bay hours booked`}
          icon={Gauge}
          tone={
            floor.utilisation > 1
              ? "critical"
              : floor.utilisation > 0.85
                ? "warning"
                : "ok"
          }
        />
        <StatTile
          label="Revenue this week"
          value={formatCurrency(thisWeek)}
          delta={{ value: weekDelta, period: "vs last week" }}
          hint={`Last week ${formatCurrency(lastWeek)}`}
          icon={Wallet}
          tone="brand"
        />
      </div>

      {/* The approval queue leads the page: it is the shop's own money sitting
          idle, and the clearest answer when a client asks why a job is late. */}
      <section className="card-raised mt-5">
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Waiting on the client
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Quoted work that cannot start until someone on the client&apos;s side
              signs it off. Oldest first.
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
            <EmptyState
              icon={Hourglass}
              title="Nothing waiting on a client"
              description="Every quote you have sent has been decided."
              className="py-10"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {approvals.orders
              .slice()
              .sort((a, b) =>
                (a.pendingApprovalEnteredAt ?? "").localeCompare(
                  b.pendingApprovalEnteredAt ?? ""
                )
              )
              .slice(0, 6)
              .map((order) => {
                const vehicle = vehiclesById.get(order.vehicleId);
                const isLongest = longest?.order.id === order.id;
                return (
                  <li key={order.id}>
                    <Link
                      href={`/work-orders/${order.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-surface-2/50"
                    >
                      <span className="tabular w-[92px] shrink-0 text-xs font-medium">
                        {vehicle?.plateNumber ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {order.title}
                        <span className="ml-2 text-subtle-foreground">
                          {clientName(order.vehicleId)}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-xs font-medium">
                        {formatCurrency(
                          order.lines.reduce(
                            (t, l) => t + l.partCost + l.labourCost,
                            0
                          )
                        )}
                      </span>
                      {isLongest ? (
                        <Badge tone="critical">
                          <Hourglass />
                          {longest.hours}h waiting
                        </Badge>
                      ) : (
                        <span className="tabular w-[72px] shrink-0 text-right text-2xs text-subtle-foreground">
                          {order.pendingApprovalEnteredAt
                            ? formatDate(order.pendingApprovalEnteredAt.slice(0, 10))
                            : "—"}
                        </span>
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
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Work under way now, with time on the job so far.
            </p>
          </header>
          {running.length === 0 ? (
            <div className="border-t border-border">
              <EmptyState
                icon={Wrench}
                title="No jobs under way"
                description="Nothing has been started on the floor yet today."
                className="py-10"
              />
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Vehicle", "Technician", "Bay", "Elapsed", "Est."].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {running.map((order) => {
                    const vehicle = vehiclesById.get(order.vehicleId);
                    const minutes = elapsedMinutes(order, now);
                    const estimate = estimatedHours(order);
                    const over = minutes !== null && minutes / 60 > estimate;
                    return (
                      <tr key={order.id} className="hover:bg-surface-2/50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/work-orders/${order.id}`}
                            className="tabular text-xs font-medium transition-colors hover:text-brand"
                          >
                            {vehicle?.plateNumber ?? "—"}
                          </Link>
                          <span className="block truncate text-2xs text-subtle-foreground">
                            {clientName(order.vehicleId)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {order.technician}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {bayName(order.bayId)}
                        </td>
                        <td
                          className={`tabular whitespace-nowrap px-4 py-3 text-xs ${
                            over ? "font-medium text-critical" : "text-muted-foreground"
                          }`}
                        >
                          {formatDuration(minutes)}
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-subtle-foreground">
                          {estimate.toFixed(1)}h
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card-raised">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">Bay load today</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Booked hours against each bay&apos;s working day.
            </p>
          </header>
          <ul className="divide-y divide-border border-t border-border">
            {floor.loads.map((load) => (
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
                  tone={
                    load.utilisation > 1
                      ? "critical"
                      : load.utilisation > 0.85
                        ? "warning"
                        : "ok"
                  }
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
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Booked in and not yet started.
            </p>
          </header>
          {arriving.length === 0 ? (
            <div className="border-t border-border">
              <EmptyState
                icon={CalendarClock}
                title="Nothing booked in"
                description="No vehicles are expected on the floor today."
                className="py-10"
              />
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {arriving.map((order) => {
                const vehicle = vehiclesById.get(order.vehicleId);
                return (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                  >
                    <span className="tabular w-[92px] shrink-0 text-xs font-medium">
                      {vehicle?.plateNumber ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {clientName(order.vehicleId)}
                    </span>
                    <span className="tabular shrink-0 text-2xs text-subtle-foreground">
                      {formatTime(order.scheduledFor)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card-raised">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">
                Ready for collection
              </h3>
              <p className="mt-0.5 text-xs text-subtle-foreground">
                Finished, still on the lot.
              </p>
            </div>
            {collectable.length > 0 ? (
              <Button asChild variant="secondary" size="sm">
                <Link href="/shop/check-in?tab=check-out">
                  Release
                  <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </header>
          {collectable.length === 0 ? (
            <div className="border-t border-border">
              <EmptyState
                icon={PackageCheck}
                title="Lot is clear"
                description="Everything finished has been collected."
                className="py-10"
              />
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {collectable.slice(0, 6).map((order) => {
                const vehicle = vehiclesById.get(order.vehicleId);
                return (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                  >
                    <span className="tabular w-[92px] shrink-0 text-xs font-medium">
                      {vehicle?.plateNumber ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {clientName(order.vehicleId)}
                    </span>
                    <span className="tabular shrink-0 text-2xs text-subtle-foreground">
                      {order.completedOn ? formatDate(order.completedOn) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
