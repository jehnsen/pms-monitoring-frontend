import {
  differenceInMinutes,
  formatISO,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import type {
  FleetClient,
  PmsItem,
  Vehicle,
  VehicleHealth,
  WorkOrder,
} from "@/types";
import { BAYS, TOTAL_BAY_CAPACITY_HOURS } from "@/lib/bays";
import { TASK_BY_ID } from "@/lib/service-tasks";
import { approvedValue, businessHoursBetween, pendingValue } from "@/lib/approvals";
import { resolvePartsCost, workOrderCost } from "@/lib/pms";

/**
 * Derivations for the provider's own view of the floor.
 *
 * The fleet client asks "is my vehicle compliant". The shop asks "what is in
 * my bays, who is waiting on me, and what is that worth" — same records, a
 * different set of questions, so the selectors live apart from `lib/pms.ts`
 * rather than growing it sideways.
 *
 * Everything here takes already-scoped collections. Scoping is `lib/tenancy.ts`'s
 * job and has happened before any of this runs.
 */

/** Statuses that mean the job is live on the floor rather than done or dead. */
const ACTIVE_STATUSES: WorkOrder["status"][] = [
  "draft",
  "pending_approval",
  "approved",
  "partially_approved",
  "scheduled",
  "in_progress",
];

export function isActiveJob(order: WorkOrder) {
  return ACTIVE_STATUSES.includes(order.status);
}

/** When work actually started, read off the append-only status history. */
export function startedAt(order: WorkOrder): Date | null {
  const entry = order.history.find((event) => event.status === "in_progress");
  return entry ? parseISO(entry.at) : null;
}

/**
 * When work actually finished.
 *
 * Read from the `closed` history event rather than `completedOn`, which is a
 * *date* — subtracting a datetime start from a midnight date produces a
 * negative duration for anything that started after midnight, i.e. every real
 * job. Falls back to the date only when no event was recorded.
 */
export function finishedAt(order: WorkOrder): Date | null {
  const entry = order.history.find((event) => event.status === "closed");
  if (entry) return parseISO(entry.at);
  return order.completedOn ? parseISO(order.completedOn) : null;
}

/** Minutes since the job went in-progress, or null if it hasn't. */
export function elapsedMinutes(order: WorkOrder, now = new Date()): number | null {
  const started = startedAt(order);
  if (!started) return null;
  return Math.max(0, differenceInMinutes(now, started));
}

/** "3h 20m" / "45m" — compact enough for a table cell. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Bay hours a job is expected to take. Preventive work is costed from the
 * service catalogue's own estimate; anything else falls back to the labour
 * charged, which at the shop's rate is the closest thing to a duration the
 * record carries.
 */
const LABOUR_RATE_PER_HOUR = 650;

export function estimatedHours(order: WorkOrder): number {
  const fromCatalogue = order.taskIds
    .map((id) => TASK_BY_ID.get(id)?.estimatedHours ?? 0)
    .reduce((total, hours) => total + hours, 0);
  if (fromCatalogue > 0) return fromCatalogue;
  return order.laborCost > 0 ? order.laborCost / LABOUR_RATE_PER_HOUR : 1;
}

/** Jobs booked into a bay on a given day. */
export function jobsScheduledFor(orders: WorkOrder[], day: Date): WorkOrder[] {
  return orders.filter((order) => {
    if (order.status === "cancelled" || order.status === "declined") return false;
    const scheduled = order.scheduledFor ? parseISO(order.scheduledFor) : null;
    return scheduled ? isSameDay(scheduled, day) : false;
  });
}

export interface BayLoad {
  bayId: string;
  name: string;
  bookedHours: number;
  capacityHours: number;
  /** 0–1+; over 1 means the bay is oversubscribed for the day. */
  utilisation: number;
  jobs: WorkOrder[];
}

/**
 * Booked hours against capacity, per bay, for one day. Jobs with no bay are
 * out-sourced and consume none of the floor's capacity.
 */
export function bayLoadFor(orders: WorkOrder[], day: Date): BayLoad[] {
  const scheduled = jobsScheduledFor(orders, day);

  return BAYS.map((bay) => {
    const jobs = scheduled.filter((order) => order.bayId === bay.id);
    const bookedHours = jobs.reduce((total, order) => total + estimatedHours(order), 0);
    return {
      bayId: bay.id,
      name: bay.name,
      bookedHours,
      capacityHours: bay.capacityHoursPerDay,
      utilisation: bay.capacityHoursPerDay
        ? bookedHours / bay.capacityHoursPerDay
        : 0,
      jobs,
    };
  });
}

/** Floor-wide booked hours against total capacity for one day. */
export function floorUtilisation(orders: WorkOrder[], day: Date) {
  const loads = bayLoadFor(orders, day);
  const bookedHours = loads.reduce((total, load) => total + load.bookedHours, 0);
  return {
    bookedHours,
    capacityHours: TOTAL_BAY_CAPACITY_HOURS,
    utilisation: TOTAL_BAY_CAPACITY_HOURS
      ? bookedHours / TOTAL_BAY_CAPACITY_HOURS
      : 0,
    loads,
  };
}

/* --------------------------------------------------------------- queues */

/** Booked in today and not yet started. */
export function arrivingToday(orders: WorkOrder[], day = new Date()): WorkOrder[] {
  return jobsScheduledFor(orders, day)
    .filter((order) => order.status === "scheduled" || order.status === "approved")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export function inProgress(orders: WorkOrder[]): WorkOrder[] {
  return orders
    .filter((order) => order.status === "in_progress")
    .sort((a, b) => (startedAt(a)?.getTime() ?? 0) - (startedAt(b)?.getTime() ?? 0));
}

/** Work is finished but the vehicle is still on the lot. */
export function readyForCollection(orders: WorkOrder[]): WorkOrder[] {
  return orders
    .filter((order) => order.status === "closed" && !order.collectedAt)
    .sort((a, b) => (a.completedOn ?? "").localeCompare(b.completedOn ?? ""));
}

export interface AwaitingApproval {
  orders: WorkOrder[];
  count: number;
  totalValue: number;
  /** The single order that has waited longest, and how long in business hours. */
  longest: { order: WorkOrder; hours: number } | null;
}

/**
 * The shop's money sitting idle. The longest-waiting job is named rather than
 * counted: "eleven jobs waiting" is a statistic, "CBA 1177 has been waiting
 * nine hours" is the thing an advisor can actually pick up the phone about.
 */
export function awaitingApproval(
  orders: WorkOrder[],
  now = new Date()
): AwaitingApproval {
  const pending = orders.filter((order) => order.status === "pending_approval");

  let longest: AwaitingApproval["longest"] = null;
  for (const order of pending) {
    if (!order.pendingApprovalEnteredAt) continue;
    const hours = businessHoursBetween(parseISO(order.pendingApprovalEnteredAt), now);
    if (!longest || hours > longest.hours) longest = { order, hours };
  }

  return {
    orders: pending,
    count: pending.length,
    totalValue: pending.reduce((total, order) => total + pendingValue(order.lines), 0),
    longest,
  };
}

/* --------------------------------------------------------------- revenue */

/**
 * Revenue recognised on collection rather than completion — the shop is paid
 * when the vehicle leaves, and counting it earlier flatters the week.
 */
export function revenueBetween(
  orders: WorkOrder[],
  from: Date,
  to: Date
): number {
  return orders.reduce((total, order) => {
    if (!order.collectedAt) return total;
    const collected = parseISO(order.collectedAt);
    if (collected < from || collected >= to) return total;
    return total + workOrderCost(order);
  }, 0);
}

/* ---------------------------------------------------------------- clients */

export interface ClientRollup {
  client: FleetClient;
  vehicleCount: number;
  openWorkOrders: number;
  /** Mean business hours from raised to decided, across resolved approvals. */
  avgApprovalHours: number | null;
  spendThisPeriod: number;
  /**
   * Delivered work not yet collected and paid for. There is no billing model
   * in this build, so "outstanding" means exactly that and nothing more.
   */
  outstanding: number;
}

export function rollupClients(
  clients: FleetClient[],
  vehicles: Vehicle[],
  orders: WorkOrder[],
  periodStart: Date,
  periodEnd: Date
): ClientRollup[] {
  const vehiclesByClient = new Map<string, number>();
  for (const vehicle of vehicles) {
    vehiclesByClient.set(
      vehicle.fleetClientId,
      (vehiclesByClient.get(vehicle.fleetClientId) ?? 0) + 1
    );
  }

  const clientOf = new Map(vehicles.map((v) => [v.id, v.fleetClientId]));

  return clients.map((client) => {
    const own = orders.filter(
      (order) => clientOf.get(order.vehicleId) === client.id
    );

    const waits = own
      .map((order) => order.approvalWaitHours)
      .filter((hours): hours is number => hours !== null);

    return {
      client,
      vehicleCount: vehiclesByClient.get(client.id) ?? 0,
      openWorkOrders: own.filter(isActiveJob).length,
      avgApprovalHours: waits.length
        ? Math.round((waits.reduce((t, h) => t + h, 0) / waits.length) * 10) / 10
        : null,
      spendThisPeriod: revenueBetween(own, periodStart, periodEnd),
      outstanding: own
        .filter((order) => order.status === "closed" && !order.collectedAt)
        .reduce((total, order) => total + workOrderCost(order), 0),
    };
  });
}

/* ------------------------------------------------------------ technicians */

export interface TechnicianLoad {
  name: string;
  /** The job in their bay right now, if any. */
  current: WorkOrder | null;
  completedThisPeriod: number;
  /** Mean actual bay time, in hours, across jobs with a recorded start. */
  avgActualHours: number | null;
  /** Mean catalogue estimate for those same jobs. */
  avgEstimatedHours: number | null;
}

/**
 * Utilisation and variance against the catalogue's own bay-time estimate.
 *
 * Deliberately not a score. A technician who consistently runs over on brake
 * jobs may be the one being handed the worst vehicles; the number is here to
 * prompt the question, not answer it.
 */
export function technicianLoad(
  names: string[],
  orders: WorkOrder[],
  periodStart: Date,
  periodEnd: Date
): TechnicianLoad[] {
  return names.map((name) => {
    const own = orders.filter((order) => order.technician === name);

    const completed = own.filter((order) => {
      if (order.status !== "closed" || !order.completedOn) return false;
      const done = parseISO(order.completedOn);
      return done >= periodStart && done < periodEnd;
    });

    const timed = completed
      .map((order) => {
        const started = startedAt(order);
        const finished = finishedAt(order);
        if (!started || !finished) return null;
        const hours = differenceInMinutes(finished, started) / 60;
        return hours > 0 ? { actual: hours, estimate: estimatedHours(order) } : null;
      })
      .filter((entry): entry is { actual: number; estimate: number } => entry !== null);

    const mean = (values: number[]) =>
      values.length
        ? Math.round((values.reduce((t, v) => t + v, 0) / values.length) * 10) / 10
        : null;

    return {
      name,
      current: own.find((order) => order.status === "in_progress") ?? null,
      completedThisPeriod: completed.length,
      avgActualHours: mean(timed.map((t) => t.actual)),
      avgEstimatedHours: mean(timed.map((t) => t.estimate)),
    };
  });
}

/* --------------------------------------------------------------- reporting */

export interface NamedValue {
  name: string;
  value: number;
  meta?: string;
}

/** Collected revenue per client over a window, biggest first. */
export function revenueByClient(
  clients: FleetClient[],
  vehicles: Vehicle[],
  orders: WorkOrder[],
  from: Date,
  to: Date
): NamedValue[] {
  const clientOf = new Map(vehicles.map((v) => [v.id, v.fleetClientId]));

  return clients
    .map((client) => ({
      name: client.name,
      value: revenueBetween(
        orders.filter((order) => clientOf.get(order.vehicleId) === client.id),
        from,
        to
      ),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

/**
 * Revenue per catalogue service item. Jobs covering several items split their
 * value evenly across them — the record does not say which line earned what,
 * and inventing a weighting would read as precision the data does not have.
 */
export function revenueByServiceItem(
  orders: WorkOrder[],
  from: Date,
  to: Date
): NamedValue[] {
  const totals = new Map<string, number>();

  for (const order of orders) {
    if (!order.collectedAt) continue;
    const collected = parseISO(order.collectedAt);
    if (collected < from || collected >= to) continue;

    const value = workOrderCost(order);
    const ids = order.taskIds.length ? order.taskIds : ["__other"];
    const share = value / ids.length;

    for (const id of ids) {
      const name = id === "__other" ? "Corrective & other" : (TASK_BY_ID.get(id)?.name ?? id);
      totals.set(name, (totals.get(name) ?? 0) + share);
    }
  }

  return [...totals.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

export interface UtilisationPoint {
  key: string;
  label: string;
  utilisation: number;
  bookedHours: number;
}

/** Floor utilisation per day across a window, oldest first. */
export function utilisationSeries(
  orders: WorkOrder[],
  days: number,
  now = new Date()
): UtilisationPoint[] {
  const points: UtilisationPoint[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const day = startOfDay(new Date(now.getTime() - offset * 86_400_000));
    const floor = floorUtilisation(orders, day);
    points.push({
      // Local calendar date. `toISOString()` would shift the key across the
      // date line for anyone east of UTC, labelling today as yesterday.
      key: formatISO(day, { representation: "date" }),
      label: `${day.getDate()}/${day.getMonth() + 1}`,
      utilisation: Math.round(floor.utilisation * 100),
      bookedHours: Math.round(floor.bookedHours * 10) / 10,
    });
  }

  return points;
}

/** Mean approval turnaround per client — who is slow to say yes. */
export function approvalTurnaroundByClient(
  clients: FleetClient[],
  vehicles: Vehicle[],
  orders: WorkOrder[]
): NamedValue[] {
  const clientOf = new Map(vehicles.map((v) => [v.id, v.fleetClientId]));

  return clients
    .map((client) => {
      const waits = orders
        .filter((order) => clientOf.get(order.vehicleId) === client.id)
        .map((order) => order.approvalWaitHours)
        .filter((hours): hours is number => hours !== null);

      return {
        name: client.name,
        value: waits.length
          ? Math.round((waits.reduce((t, h) => t + h, 0) / waits.length) * 10) / 10
          : 0,
        meta: `${waits.length} decided`,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------ parts margin */

export interface PartsMargin {
  /** Parts the shop supplied and marked up. */
  supplierProvidedValue: number;
  /** Parts the client supplied from their own stock — no margin to the shop. */
  ownStockValue: number;
  /** Margin on supplier-provided lines only. */
  margin: number;
}

/** Assumed markup on parts the shop sources. */
export const PARTS_MARKUP = 0.22;

/**
 * Parts value split by who supplied them. An `own_stock` line is the client's
 * part fitted by the shop: it appears in the job's cost but earns the shop
 * nothing, so folding it into margin would overstate the book badly.
 */
export function partsMargin(orders: WorkOrder[]): PartsMargin {
  let supplierProvidedValue = 0;
  let ownStockValue = 0;

  for (const order of orders) {
    if (order.status !== "closed") continue;

    if (order.lines.length === 0) {
      // Seeded history with no itemised lines predates the parts-source field;
      // treat it as supplier-provided, which is the shop's default.
      supplierProvidedValue += resolvePartsCost(order);
      continue;
    }

    for (const line of order.lines) {
      if (line.approvalStatus !== "approved") continue;
      if (line.partsSource === "own_stock") ownStockValue += line.partCost;
      else supplierProvidedValue += line.partCost;
    }
  }

  return {
    supplierProvidedValue,
    ownStockValue,
    margin: supplierProvidedValue * (PARTS_MARKUP / (1 + PARTS_MARKUP)),
  };
}

/* ------------------------------------------------------------- check-in */

/** Overdue and due-soon items to offer at the counter, worst first. */
export function serviceableItems(health: VehicleHealth | undefined): PmsItem[] {
  if (!health) return [];
  return health.items.filter((item) => item.status !== "ok");
}

/** Value approved on a job — what the client owes if it closes as authorised. */
export function authorisedValue(order: WorkOrder): number {
  return order.lines.length ? approvedValue(order.lines) : workOrderCost(order);
}

/** Start-of-day helper shared by the shop screens so "today" means one thing. */
export function today(now = new Date()) {
  return startOfDay(now);
}
