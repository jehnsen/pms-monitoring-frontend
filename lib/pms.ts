import {
  addMonths,
  differenceInCalendarDays,
  formatISO,
  parseISO,
} from "date-fns";
import type {
  PmsItem,
  PmsStatus,
  ServiceTask,
  Vehicle,
  VehicleHealth,
  WorkOrder,
} from "@/types";
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { computeIntervalStatus, DUE_SOON_DAYS, DUE_SOON_KM } from "@/lib/interval-status";
import { clamp } from "@/lib/utils";

// Re-exported so callers keep importing thresholds from the domain module.
export { DUE_SOON_KM, DUE_SOON_DAYS };

/** Past this many days, a reading is old enough that projections should say so. */
export const ODOMETER_STALE_DAYS = 14;

export function odometerAgeDays(vehicle: Vehicle, today = new Date()) {
  return Math.max(
    0,
    differenceInCalendarDays(today, parseISO(vehicle.odometerReadAt))
  );
}

export function isOdometerStale(vehicle: Vehicle, today = new Date()) {
  return odometerAgeDays(vehicle, today) > ODOMETER_STALE_DAYS;
}

function toISODate(date: Date) {
  return formatISO(date, { representation: "date" });
}

/**
 * Resolves one PMS item for one vehicle.
 *
 * The projection itself lives in `computeIntervalStatus` — a pure function with
 * its own tests. This wrapper only adapts vehicle records to that contract and
 * maps the result onto the shape the UI consumes.
 */
export function evaluateTask(
  vehicle: Vehicle,
  task: ServiceTask,
  today = new Date()
): PmsItem {
  const state = vehicle.taskState[task.id] ?? {
    lastDoneOdometer: Math.max(0, vehicle.odometer - task.intervalKm),
    lastDoneOn: toISODate(addMonths(today, -task.intervalMonths)),
  };

  const result = computeIntervalStatus({
    lastCompletedAt: parseISO(state.lastDoneOn),
    lastCompletedOdometer: state.lastDoneOdometer,
    distanceIntervalKm: task.intervalKm,
    timeIntervalMonths: task.intervalMonths,
    currentOdometer: vehicle.odometer,
    currentOdometerReadAt: parseISO(
      vehicle.odometerReadAt ?? toISODate(today)
    ),
    avgKmPerDay: vehicle.avgDailyKm,
    today,
  });

  const status: PmsStatus =
    result.status === "on_schedule" ? "ok" : result.status;

  return {
    task,
    status,
    kmRemaining: result.kmRemaining,
    daysRemaining: result.daysRemaining,
    progress: result.progress,
    dueOdometer: result.distanceDueAt,
    dueDate: toISODate(result.projectedDue),
    governedBy: result.governedBy,
    lastDoneOn: state.lastDoneOn,
    lastDoneOdometer: state.lastDoneOdometer,
  };
}

const STATUS_RANK: Record<PmsStatus, number> = {
  overdue: 0,
  due_soon: 1,
  ok: 2,
};

/** Sorts most-urgent-first: worse status wins, then the nearer due date. */
export function compareUrgency(a: PmsItem, b: PmsItem) {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  return a.daysRemaining - b.daysRemaining;
}

export function evaluateVehicle(
  vehicle: Vehicle,
  today = new Date(),
  // Defaults to the static catalogue so every existing caller — tests,
  // lib/seed.ts's generator — keeps working unchanged. `useFleet()` passes the
  // provider's live catalogue from the database instead; see lib/store.ts.
  tasks: ServiceTask[] = SERVICE_TASKS
): VehicleHealth {
  const items = tasks.map((task) =>
    evaluateTask(vehicle, task, today)
  ).sort(compareUrgency);

  const overdue = items.filter((item) => item.status === "overdue");
  const dueSoon = items.filter((item) => item.status === "due_soon");

  const status: PmsStatus =
    overdue.length > 0 ? "overdue" : dueSoon.length > 0 ? "due_soon" : "ok";

  // Critical items carry roughly double the weight of routine ones, so a unit
  // with one missed brake service never scores the same as one with a late
  // cabin filter. The weights are deliberately steep: a vehicle carrying two
  // breached safety intervals should read as a problem, not as a 90-something.
  const penalty = items.reduce((total, item) => {
    if (item.status === "overdue") return total + (item.task.critical ? 25 : 15);
    if (item.status === "due_soon") return total + (item.task.critical ? 8 : 4);
    return total;
  }, 0);

  return {
    vehicle,
    items,
    status,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    nextItem: items.find((item) => item.status !== "ok") ?? items[0] ?? null,
    healthScore: Math.round(clamp(100 - penalty, 0, 100)),
  };
}

export function evaluateFleet(
  vehicles: Vehicle[],
  today = new Date(),
  tasks: ServiceTask[] = SERVICE_TASKS
) {
  return vehicles.map((vehicle) => evaluateVehicle(vehicle, today, tasks));
}

export interface FleetSummary {
  total: number;
  compliant: number;
  dueSoon: number;
  overdue: number;
  inService: number;
  down: number;
  /** Share of vehicles with no overdue item, 0–100. */
  complianceRate: number;
  avgHealthScore: number;
  totalOdometer: number;
}

export function summariseFleet(health: VehicleHealth[]): FleetSummary {
  const total = health.length;
  const overdue = health.filter((h) => h.status === "overdue").length;
  const dueSoon = health.filter((h) => h.status === "due_soon").length;
  const compliant = health.filter((h) => h.status === "ok").length;

  return {
    total,
    compliant,
    dueSoon,
    overdue,
    inService: health.filter((h) => h.vehicle.status === "in_service").length,
    down: health.filter((h) => h.vehicle.status === "down").length,
    complianceRate: total ? Math.round(((total - overdue) / total) * 100) : 100,
    avgHealthScore: total
      ? Math.round(health.reduce((t, h) => t + h.healthScore, 0) / total)
      : 100,
    totalOdometer: health.reduce((t, h) => t + h.vehicle.odometer, 0),
  };
}

/**
 * Parts cost, preferring the itemised list once a technician has recorded one.
 * Estimates and seeded history carry only the aggregate, so both shapes have to
 * resolve through here — never read `order.partsCost` directly.
 */
export function resolvePartsCost(order: WorkOrder) {
  if (!order.parts?.length) return order.partsCost;
  return order.parts.reduce(
    (total, part) => total + part.quantity * part.unitCost,
    0
  );
}

export function workOrderCost(order: WorkOrder) {
  return order.laborCost + resolvePartsCost(order);
}

/** Applies a completed work order to the vehicle's task history and odometer. */
export function applyCompletion(vehicle: Vehicle, order: WorkOrder): Vehicle {
  const taskState = { ...vehicle.taskState };
  for (const taskId of order.taskIds) {
    taskState[taskId] = {
      lastDoneOdometer: order.odometerAtService,
      lastDoneOn: order.completedOn ?? toISODate(new Date()),
    };
  }
  return {
    ...vehicle,
    taskState,
    odometer: Math.max(vehicle.odometer, order.odometerAtService),
    // Closing the job is itself a fresh reading — the odometer above was
    // read at the moment of service, not left over from whenever it was
    // last logged.
    odometerReadAt: order.completedOn ?? toISODate(new Date()),
    status: "active",
  };
}
