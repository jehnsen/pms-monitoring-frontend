import {
  addDays,
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
import { clamp } from "@/lib/utils";

/** A task enters the warning band this far ahead of either limit. */
export const DUE_SOON_KM = 750;
export const DUE_SOON_DAYS = 21;

const DAYS_PER_MONTH = 30.44;

function toISODate(date: Date) {
  return formatISO(date, { representation: "date" });
}

/**
 * Resolves one PMS item for one vehicle.
 *
 * Distance and time limits run in parallel and the item is due on whichever
 * arrives first, so the distance limit is projected onto the calendar using the
 * vehicle's rolling daily average before the two are compared.
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

  const dueOdometer = state.lastDoneOdometer + task.intervalKm;
  const kmRemaining = dueOdometer - vehicle.odometer;

  const dailyKm = Math.max(vehicle.avgDailyKm, 1);
  const daysFromDistance = Math.round(kmRemaining / dailyKm);

  const timeDueDate = addMonths(parseISO(state.lastDoneOn), task.intervalMonths);
  const daysFromTime = differenceInCalendarDays(timeDueDate, today);

  const governedBy = daysFromDistance <= daysFromTime ? "distance" : "time";
  const daysRemaining = Math.min(daysFromDistance, daysFromTime);
  const dueDate =
    governedBy === "distance" ? addDays(today, daysFromDistance) : timeDueDate;

  const distanceProgress =
    (vehicle.odometer - state.lastDoneOdometer) / task.intervalKm;
  const elapsedDays = differenceInCalendarDays(
    today,
    parseISO(state.lastDoneOn)
  );
  const timeProgress = elapsedDays / (task.intervalMonths * DAYS_PER_MONTH);

  let status: PmsStatus = "ok";
  if (kmRemaining <= 0 || daysRemaining <= 0) status = "overdue";
  else if (kmRemaining <= DUE_SOON_KM || daysRemaining <= DUE_SOON_DAYS)
    status = "due_soon";

  return {
    task,
    status,
    kmRemaining,
    daysRemaining,
    progress: Math.max(distanceProgress, timeProgress, 0),
    dueOdometer,
    dueDate: toISODate(dueDate),
    governedBy,
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
  today = new Date()
): VehicleHealth {
  const items = SERVICE_TASKS.map((task) =>
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

export function evaluateFleet(vehicles: Vehicle[], today = new Date()) {
  return vehicles.map((vehicle) => evaluateVehicle(vehicle, today));
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
    status: "active",
  };
}
