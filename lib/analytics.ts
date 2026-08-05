import {
  addWeeks,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { VehicleHealth, WorkOrder } from "@/types";
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

/** Projected cost of clearing everything currently overdue or due soon. */
export function forecastCost(health: VehicleHealth[]) {
  return urgentItems(health).reduce(
    (total, { item }) => total + item.task.estimatedCost,
    0
  );
}
