import {
  addWeeks,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type { PmsItem, Vehicle, VehicleHealth, WorkOrder } from "@/types";
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { workOrderCost } from "@/lib/pms";

export interface MonthlyCostPoint {
  key: string;
  month: string;
  parts: number;
  labor: number;
  total: number;
  preventive: number;
  corrective: number;
}

/** Twelve months of closed spend, oldest first, with empty months kept in place. */
export function monthlyCosts(
  workOrders: WorkOrder[],
  months = 12,
  today = new Date()
): MonthlyCostPoint[] {
  const buckets = new Map<string, MonthlyCostPoint>();

  for (let i = months - 1; i >= 0; i--) {
    const date = startOfMonth(subMonths(today, i));
    const key = format(date, "yyyy-MM");
    buckets.set(key, {
      key,
      month: format(date, "MMM"),
      parts: 0,
      labor: 0,
      total: 0,
      preventive: 0,
      corrective: 0,
    });
  }

  for (const order of workOrders) {
    if (order.status !== "completed" || !order.completedOn) continue;
    const key = format(parseISO(order.completedOn), "yyyy-MM");
    const bucket = buckets.get(key);
    if (!bucket) continue;

    bucket.parts += order.partsCost;
    bucket.labor += order.laborCost;
    bucket.total += workOrderCost(order);
    if (order.type === "corrective") bucket.corrective += 1;
    else bucket.preventive += 1;
  }

  return [...buckets.values()];
}

export interface NamedTotal {
  name: string;
  value: number;
  meta?: string;
}

/** Closed spend per vehicle, highest first. */
export function spendByVehicle(
  workOrders: WorkOrder[],
  health: VehicleHealth[],
  limit = 8
): NamedTotal[] {
  const byVehicle = new Map<string, number>();

  for (const order of workOrders) {
    if (order.status !== "completed") continue;
    byVehicle.set(
      order.vehicleId,
      (byVehicle.get(order.vehicleId) ?? 0) + workOrderCost(order)
    );
  }

  return health
    .map((entry) => ({
      name: entry.vehicle.plateNumber,
      value: byVehicle.get(entry.vehicle.id) ?? 0,
      meta: `${entry.vehicle.make} ${entry.vehicle.model}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Closed spend grouped by the service category the order belongs to. */
export function spendByCategory(workOrders: WorkOrder[]): NamedTotal[] {
  const totals = new Map<string, number>();

  for (const order of workOrders) {
    if (order.status !== "completed") continue;
    const task = SERVICE_TASKS.find((t) => order.taskIds.includes(t.id));
    const label = task ? task.name : "Unscheduled repairs";
    totals.set(label, (totals.get(label) ?? 0) + workOrderCost(order));
  }

  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export interface UpcomingBucket {
  label: string;
  range: string;
  overdue: number;
  dueSoon: number;
  upcoming: number;
}

/**
 * The forward workload: how many PMS items land in each of the next six weeks.
 * Anything already past its limit collapses into the first bucket, since it is
 * work that needs doing now rather than work that is scheduled.
 */
export function upcomingLoad(
  health: VehicleHealth[],
  weeks = 6,
  today = new Date()
): UpcomingBucket[] {
  const buckets: UpcomingBucket[] = Array.from({ length: weeks }, (_, index) => ({
    label: index === 0 ? "This week" : `Week ${index + 1}`,
    range: `${format(addWeeks(today, index), "dd MMM")} – ${format(
      addWeeks(today, index + 1),
      "dd MMM"
    )}`,
    overdue: 0,
    dueSoon: 0,
    upcoming: 0,
  }));

  for (const entry of health) {
    for (const item of entry.items) {
      if (item.status === "overdue") {
        buckets[0].overdue += 1;
        continue;
      }
      const days = differenceInCalendarDays(parseISO(item.dueDate), today);
      const index = Math.floor(days / 7);
      if (index < 0 || index >= weeks) continue;
      if (item.status === "due_soon") buckets[index].dueSoon += 1;
      else buckets[index].upcoming += 1;
    }
  }

  return buckets;
}

/** Every non-compliant PMS item across the fleet, most urgent first. */
export function urgentItems(health: VehicleHealth[]) {
  return health
    .flatMap((entry) =>
      entry.items
        .filter((item) => item.status !== "ok")
        .map((item) => ({ vehicle: entry.vehicle, item }))
    )
    .sort((a, b) => a.item.daysRemaining - b.item.daysRemaining);
}

export interface DemandBand {
  items: { vehicle: Vehicle; item: PmsItem }[];
  /** Number of service items in this band. */
  count: number;
  /** Number of distinct vehicles those items belong to. */
  vehicleCount: number;
  /** Catalogue cost of clearing the band. */
  estimatedCost: number;
}

export interface ServiceDemand {
  /** Past a limit. */
  overdue: DemandBand;
  /** Inside the warning threshold, not yet past a limit. */
  dueSoon: DemandBand;
}

function band(entries: { vehicle: Vehicle; item: PmsItem }[]): DemandBand {
  return {
    items: entries,
    count: entries.length,
    vehicleCount: new Set(entries.map((entry) => entry.vehicle.id)).size,
    estimatedCost: entries.reduce(
      (total, entry) => total + entry.item.task.estimatedCost,
      0
    ),
  };
}

/**
 * The single source for "how much work is outstanding".
 *
 * Both the dashboard and the schedule read counts and costs from here so the
 * two screens cannot report different numbers for the same thing. Two terms,
 * used consistently everywhere: **overdue** is past a limit, **due soon** is
 * inside the warning threshold. Neither is a "backlog".
 */
export function serviceDemand(health: VehicleHealth[]): ServiceDemand {
  const urgent = urgentItems(health);

  return {
    overdue: band(urgent.filter((entry) => entry.item.status === "overdue")),
    dueSoon: band(urgent.filter((entry) => entry.item.status === "due_soon")),
  };
}

export interface RollingSpend {
  /** Closed spend over the trailing window. */
  current: number;
  /** Closed spend over the window immediately before it. */
  previous: number;
  /** Percentage change, rounded; 0 when there is no prior spend to compare. */
  deltaPct: number;
  windowDays: number;
}

/**
 * Trailing-window spend.
 *
 * Calendar months are not comparable mid-month: on the 5th, "this month" holds
 * five days of spend and "last month" holds thirty, so the delta reads as a
 * collapse every time the month turns over. Two equal trailing windows compare
 * like with like.
 */
export function rollingSpend(
  workOrders: WorkOrder[],
  windowDays = 30,
  today = new Date()
): RollingSpend {
  const currentStart = subDays(today, windowDays);
  const previousStart = subDays(today, windowDays * 2);

  let current = 0;
  let previous = 0;

  for (const order of workOrders) {
    if (order.status !== "completed" || !order.completedOn) continue;
    const completedOn = parseISO(order.completedOn);
    const cost = workOrderCost(order);

    if (completedOn > currentStart && completedOn <= today) current += cost;
    else if (completedOn > previousStart && completedOn <= currentStart)
      previous += cost;
  }

  return {
    current,
    previous,
    deltaPct: previous ? Math.round(((current - previous) / previous) * 100) : 0,
    windowDays,
  };
}

/**
 * Distance the fleet covers in a period, from each vehicle's daily average.
 *
 * Cost per kilometre needs the distance driven *during* the costing period.
 * Dividing a year of spend by lifetime odometer mixes a flow with a stock and
 * understates the rate by however many years of history the fleet carries.
 */
export function fleetKmInPeriod(vehicles: Vehicle[], days: number) {
  return Math.round(
    vehicles.reduce((total, vehicle) => total + vehicle.avgDailyKm * days, 0)
  );
}

/**
 * Maintenance frequency: services per 10,000 km for each vehicle.
 *
 * Raw service counts punish the hardest-worked units, which is exactly
 * backwards — normalising by distance makes a van doing 145 km/day comparable
 * with a sedan doing 42, and surfaces the units genuinely consuming more
 * workshop attention than their mileage justifies.
 */
export function serviceFrequency(
  workOrders: WorkOrder[],
  health: VehicleHealth[],
  limit = 8
): NamedTotal[] {
  const counts = new Map<string, number>();

  for (const order of workOrders) {
    if (order.status !== "completed") continue;
    counts.set(order.vehicleId, (counts.get(order.vehicleId) ?? 0) + 1);
  }

  return health
    .map((entry) => {
      const services = counts.get(entry.vehicle.id) ?? 0;
      const per10k =
        entry.vehicle.odometer > 0
          ? (services / entry.vehicle.odometer) * 10_000
          : 0;
      return {
        name: entry.vehicle.plateNumber,
        value: Math.round(per10k * 100) / 100,
        meta: `${services} services · ${Math.round(entry.vehicle.odometer / 1000)}k km`,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Mean days between completed services across the whole fleet. */
export function meanDaysBetweenServices(
  workOrders: WorkOrder[],
  vehicleCount: number,
  months = 12
) {
  const completed = workOrders.filter((order) => order.status === "completed");
  if (!completed.length || !vehicleCount) return 0;

  const windowDays = months * 30.44;
  const servicesPerVehicle = completed.length / vehicleCount;
  return Math.round(windowDays / Math.max(servicesPerVehicle, 0.01));
}

