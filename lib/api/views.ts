/**
 * The purpose-built screen endpoints (`/analytics/*`, `/requests`,
 * `/demand-forecast`, `/shop/*`, list summaries), as typed views.
 *
 * These are the API's computations — the frontend renders them and derives
 * nothing authoritative from them. Raw payloads map through the same rules as
 * `lib/mappers.ts`: camelCase, money in pesos for display, embedded resources
 * (work orders, vehicles, PMS items) through the domain mappers.
 */
import type { FleetClient, PmsItem, Priority, Vehicle, VehicleRef, WorkOrder } from "@/types";
import {
  centsToPesos as pesos,
  toApprovalSettings,
  toFleetClient,
  toFleetSummary,
  toPmsItem,
  toSettingsOverrides,
  toVehicle,
  toVehicleRef,
  toWorkOrder,
  type RawCustomerAccount,
  type RawFleetSummary,
  type RawPmsItem,
  type RawSettings,
  type RawVehicle,
  type RawVehicleRef,
  type RawWorkOrder,
} from "@/lib/mappers";

/* ---------------------------------------------------------- shared shapes */

export interface MonthlyCostPoint {
  key: string;
  month: string;
  parts: number;
  labor: number;
  total: number;
  preventive: number;
  corrective: number;
}

export interface NamedTotal {
  name: string;
  value: number;
  meta?: string;
}

export interface UpcomingBucket {
  label: string;
  range: string;
  overdue: number;
  dueSoon: number;
  upcoming: number;
}

export interface DemandBand {
  count: number;
  vehicleCount: number;
  estimatedCost: number;
}

export interface UrgentRow {
  vehicle: VehicleRef;
  item: PmsItem & { estimatedCost: number };
}

interface RawMonthly {
  key: string;
  month: string;
  parts_cents: number;
  labor_cents: number;
  total_cents: number;
  preventive: number;
  corrective: number;
}

interface RawNamed {
  name: string;
  value_cents?: number;
  value?: number;
  hours?: number;
  meta?: string | null;
}

interface RawBucket {
  label: string;
  range: string;
  overdue: number;
  due_soon: number;
  upcoming: number;
}

interface RawBand {
  count: number;
  vehicle_count: number;
  estimated_cost_cents: number;
}

interface RawUrgent {
  vehicle: RawVehicleRef;
  item: RawPmsItem & { estimated_cost_cents: number };
}

const monthly = (m: RawMonthly): MonthlyCostPoint => ({
  key: m.key,
  month: m.month,
  parts: pesos(m.parts_cents),
  labor: pesos(m.labor_cents),
  total: pesos(m.total_cents),
  preventive: m.preventive,
  corrective: m.corrective,
});

/** A ranking row; `money` ones carry `value_cents`. */
const named = (r: RawNamed): NamedTotal => ({
  name: r.name,
  value: r.value_cents !== undefined ? pesos(r.value_cents) : (r.value ?? r.hours ?? 0),
  ...(r.meta ? { meta: r.meta } : {}),
});

const bucket = (b: RawBucket): UpcomingBucket => ({
  label: b.label,
  range: b.range,
  overdue: b.overdue,
  dueSoon: b.due_soon,
  upcoming: b.upcoming,
});

const band = (b: RawBand): DemandBand => ({
  count: b.count,
  vehicleCount: b.vehicle_count,
  estimatedCost: pesos(b.estimated_cost_cents),
});

const urgent = (r: RawUrgent): UrgentRow => ({
  vehicle: toVehicleRef(r.vehicle),
  item: { ...toPmsItem(r.item), estimatedCost: pesos(r.item.estimated_cost_cents) },
});

/* -------------------------------------------------------------- dashboard */

export interface DashboardView {
  asOf: string;
  summary: ReturnType<typeof toFleetSummary>;
  vehiclesInOperation: number;
  demand: { overdue: DemandBand; dueSoon: DemandBand };
  spend: { windowDays: number; current: number; previous: number; deltaPct: number };
  monthlyCosts: MonthlyCostPoint[];
  upcomingLoad: UpcomingBucket[];
  staleOdometers: number;
  attention: { total: number; items: UrgentRow[] };
  activeWorkOrders: { total: number; preview: WorkOrder[] };
}

export interface RawDashboard {
  as_of: string;
  summary: RawFleetSummary;
  vehicles_in_operation: number;
  demand: { overdue: RawBand; due_soon: RawBand };
  spend: { window_days: number; current_cents: number; previous_cents: number; delta_pct: number };
  monthly_costs: RawMonthly[];
  upcoming_load: RawBucket[];
  stale_odometers: number;
  attention: { total: number; items: RawUrgent[] };
  active_work_orders: { total: number; preview: RawWorkOrder[] };
}

export function toDashboard(d: RawDashboard): DashboardView {
  return {
    asOf: d.as_of,
    summary: toFleetSummary(d.summary),
    vehiclesInOperation: d.vehicles_in_operation,
    demand: { overdue: band(d.demand.overdue), dueSoon: band(d.demand.due_soon) },
    spend: {
      windowDays: d.spend.window_days,
      current: pesos(d.spend.current_cents),
      previous: pesos(d.spend.previous_cents),
      deltaPct: d.spend.delta_pct,
    },
    monthlyCosts: d.monthly_costs.map(monthly),
    upcomingLoad: d.upcoming_load.map(bucket),
    staleOdometers: d.stale_odometers,
    attention: { total: d.attention.total, items: d.attention.items.map(urgent) },
    activeWorkOrders: { total: d.active_work_orders.total, preview: d.active_work_orders.preview.map(toWorkOrder) },
  };
}

/* ---------------------------------------------------------------- reports */

export interface ReportsView {
  months: number;
  closedOrders: number;
  vehicleCount: number;
  totalSpend: number;
  preventiveSpend: number;
  preventiveSharePct: number;
  periodKm: number;
  costPerKm: number;
  meanDaysBetweenServices: number;
  monthlyCosts: MonthlyCostPoint[];
  spendByVehicle: NamedTotal[];
  spendByServiceItem: NamedTotal[];
  serviceFrequency: NamedTotal[];
}

export interface RawReports {
  months: number;
  closed_orders: number;
  vehicle_count: number;
  total_spend_cents: number;
  preventive_spend_cents: number;
  preventive_share_pct: number;
  period_km: number;
  cost_per_km_cents: number;
  mean_days_between_services: number;
  monthly_costs: RawMonthly[];
  spend_by_vehicle: RawNamed[];
  spend_by_service_item: RawNamed[];
  service_frequency: RawNamed[];
}

export function toReports(r: RawReports): ReportsView {
  return {
    months: r.months,
    closedOrders: r.closed_orders,
    vehicleCount: r.vehicle_count,
    totalSpend: pesos(r.total_spend_cents),
    preventiveSpend: pesos(r.preventive_spend_cents),
    preventiveSharePct: r.preventive_share_pct,
    periodKm: r.period_km,
    costPerKm: pesos(r.cost_per_km_cents),
    meanDaysBetweenServices: r.mean_days_between_services,
    monthlyCosts: r.monthly_costs.map(monthly),
    spendByVehicle: r.spend_by_vehicle.map(named),
    spendByServiceItem: r.spend_by_service_item.map(named),
    serviceFrequency: r.service_frequency.map(named),
  };
}

/* --------------------------------------------------------------- schedule */

export interface ScheduleGroup {
  key: string;
  label: string;
  description: string;
  count: number;
  estimatedCost: number;
  rows: UrgentRow[];
}

export interface ScheduleView {
  status: string;
  upcomingLoad: UpcomingBucket[];
  demand: { overdue: DemandBand; dueSoon: DemandBand };
  listed: number;
  beyondHorizon: number;
  groups: ScheduleGroup[];
}

export interface RawSchedule {
  status: string;
  upcoming_load: RawBucket[];
  demand: { overdue: RawBand; due_soon: RawBand };
  listed: number;
  beyond_horizon: number;
  groups: { key: string; label: string; description: string; count: number; estimated_cost_cents: number; rows: RawUrgent[] }[];
}

export function toSchedule(s: RawSchedule): ScheduleView {
  return {
    status: s.status,
    upcomingLoad: s.upcoming_load.map(bucket),
    demand: { overdue: band(s.demand.overdue), dueSoon: band(s.demand.due_soon) },
    listed: s.listed,
    beyondHorizon: s.beyond_horizon,
    groups: s.groups.map((g) => ({
      key: g.key,
      label: g.label,
      description: g.description,
      count: g.count,
      estimatedCost: pesos(g.estimated_cost_cents),
      rows: g.rows.map(urgent),
    })),
  };
}

/* ---------------------------------------------------------- auto-schedule */

export interface AutoScheduleProposal {
  vehicle: VehicleRef;
  item: PmsItem & { estimatedCost: number };
  scheduledFor: string;
  priority: Priority;
  estimate: number;
}

export interface AutoScheduleView {
  asOf: string;
  jobsPerDay: number;
  canCommit: boolean;
  count: number;
  estimate: number;
  proposals: AutoScheduleProposal[];
}

export interface RawAutoSchedule {
  as_of: string;
  jobs_per_day: number;
  can_commit: boolean;
  count: number;
  estimate_cents: number;
  proposals: (RawUrgent & { scheduled_for: string; priority: string; estimate_cents: number })[];
}

export function toAutoSchedule(a: RawAutoSchedule): AutoScheduleView {
  return {
    asOf: a.as_of,
    jobsPerDay: a.jobs_per_day,
    canCommit: a.can_commit,
    count: a.count,
    estimate: pesos(a.estimate_cents),
    proposals: a.proposals.map((p) => ({
      ...urgent(p),
      scheduledFor: p.scheduled_for,
      priority: p.priority as Priority,
      estimate: pesos(p.estimate_cents),
    })),
  };
}

/* --------------------------------------------------------------- requests */

export interface PendingRequestRow {
  workOrderId: string;
  displayReference: string;
  title: string;
  priority: Priority;
  vehicle: VehicleRef;
  pendingSince: string | null;
  pendingValue: number;
  waitingHours: number;
  slaHours: number;
  breached: boolean;
  canApprove: boolean;
}

export interface RequestsView {
  myPending: { lineCount: number; value: number };
  awaitingScheduling: number;
  committedThisPeriod: number;
  monthlyBudget: number;
  budgetUsedPct: number;
  avgTurnaroundHours: number;
  pending: PendingRequestRow[];
}

export interface RawRequests {
  my_pending: { line_count: number; value_cents: number };
  awaiting_scheduling: number;
  committed_this_period_cents: number;
  monthly_budget_cents: number;
  budget_used_pct: number;
  avg_turnaround_hours: number;
  pending: {
    work_order_id: string;
    display_reference: string;
    title: string;
    priority: string;
    vehicle: RawVehicleRef;
    pending_approval_entered_at: string | null;
    pending_value_cents: number;
    waiting_hours: number;
    sla_hours: number;
    breached: boolean;
    can_approve: boolean;
  }[];
}

export function toRequests(r: RawRequests): RequestsView {
  return {
    myPending: { lineCount: r.my_pending.line_count, value: pesos(r.my_pending.value_cents) },
    awaitingScheduling: r.awaiting_scheduling,
    committedThisPeriod: pesos(r.committed_this_period_cents),
    monthlyBudget: pesos(r.monthly_budget_cents),
    budgetUsedPct: r.budget_used_pct,
    avgTurnaroundHours: r.avg_turnaround_hours,
    pending: r.pending.map((p) => ({
      workOrderId: p.work_order_id,
      displayReference: p.display_reference,
      title: p.title,
      priority: p.priority as Priority,
      vehicle: toVehicleRef(p.vehicle),
      pendingSince: p.pending_approval_entered_at,
      pendingValue: pesos(p.pending_value_cents),
      waitingHours: p.waiting_hours,
      slaHours: p.sla_hours,
      breached: p.breached,
      canApprove: p.can_approve,
    })),
  };
}

/* -------------------------------------------------------- demand forecast */

export interface ForecastRow {
  part: {
    id: string;
    sku: string;
    name: string;
    category: string;
    unit: string;
    unitCost: number;
    currentStock: number;
    reorderPoint: number;
    preferredVendor: string;
    leadTimeDays: number;
  };
  quantityRequired: number;
  shortfall: number;
  estimatedCost: number;
  earliestNeededOn: string;
  leadTimeRisk: boolean;
  selectable: boolean;
  contributingItems: { vehicleId: string; plateNumber: string; serviceTaskId: string; taskName: string; dueDate: string }[];
}

export interface ForecastView {
  customerAccountId: string;
  horizonWeeks: number;
  summary: string;
  canRaise: boolean;
  totals: { parts: number; withShortfall: number; leadTimeRisks: number; estimatedCost: number };
  rows: ForecastRow[];
}

export interface RawForecast {
  customer_account_id: string;
  horizon_weeks: number;
  summary: string;
  can_raise: boolean;
  totals: { parts: number; with_shortfall: number; lead_time_risks: number; estimated_cost_cents: number };
  rows: {
    part: {
      id: string;
      sku: string;
      name: string;
      category: string;
      unit: string;
      unit_cost_cents: number;
      current_stock: number;
      reorder_point: number;
      preferred_vendor: string;
      lead_time_days: number;
    };
    quantity_required: number;
    shortfall: number;
    estimated_cost_cents: number;
    earliest_needed_on: string;
    lead_time_risk: boolean;
    selectable: boolean;
    contributing_items: { vehicle_id: string; plate_number: string; service_task_id: string; task_name: string; due_date: string }[];
  }[];
}

export function toForecast(f: RawForecast): ForecastView {
  return {
    customerAccountId: f.customer_account_id,
    horizonWeeks: f.horizon_weeks,
    summary: f.summary,
    canRaise: f.can_raise,
    totals: {
      parts: f.totals.parts,
      withShortfall: f.totals.with_shortfall,
      leadTimeRisks: f.totals.lead_time_risks,
      estimatedCost: pesos(f.totals.estimated_cost_cents),
    },
    rows: f.rows.map((r) => ({
      part: {
        id: r.part.id,
        sku: r.part.sku,
        name: r.part.name,
        category: r.part.category,
        unit: r.part.unit,
        unitCost: pesos(r.part.unit_cost_cents),
        currentStock: r.part.current_stock,
        reorderPoint: r.part.reorder_point,
        preferredVendor: r.part.preferred_vendor,
        leadTimeDays: r.part.lead_time_days,
      },
      quantityRequired: r.quantity_required,
      shortfall: r.shortfall,
      estimatedCost: pesos(r.estimated_cost_cents),
      earliestNeededOn: r.earliest_needed_on,
      leadTimeRisk: r.lead_time_risk,
      selectable: r.selectable,
      contributingItems: r.contributing_items.map((c) => ({
        vehicleId: c.vehicle_id,
        plateNumber: c.plate_number,
        serviceTaskId: c.service_task_id,
        taskName: c.task_name,
        dueDate: c.due_date,
      })),
    })),
  };
}

/* ------------------------------------------------------------ list totals */

export interface WorkOrderSummaryView {
  buckets: { active: number; completed: number; cancelled: number; all: number };
  filtered: { count: number; value: number };
}

export interface RawWorkOrderSummary {
  buckets: { active: number; completed: number; cancelled: number; all: number };
  filtered: { count: number; value_cents: number };
}

export function toWorkOrderSummary(s: RawWorkOrderSummary): WorkOrderSummaryView {
  return { buckets: s.buckets, filtered: { count: s.filtered.count, value: pesos(s.filtered.value_cents) } };
}

export interface DocumentSummaryView {
  count: number;
  totalBytes: number;
  expiringSoon: number;
  expiringWindowDays: number;
}

export interface RawDocumentSummary {
  count: number;
  total_bytes: number;
  expiring_soon: number;
  expiring_window_days: number;
}

export function toDocumentSummary(s: RawDocumentSummary): DocumentSummaryView {
  return { count: s.count, totalBytes: s.total_bytes, expiringSoon: s.expiring_soon, expiringWindowDays: s.expiring_window_days };
}

/* ------------------------------------------------------------------- shop */

export interface FloorView {
  bookedHours: number;
  capacityHours: number;
  utilisation: number;
  baysWorking: number;
  bays: { bayId: string; name: string; bookedHours: number; capacityHours: number; utilisation: number }[];
}

interface RawFloor {
  booked_hours: number;
  capacity_hours: number;
  utilisation: number;
  bays_working?: number;
  bays: { bay_id: string; name: string; booked_hours: number; capacity_hours: number; utilisation: number }[];
}

const floor = (f: RawFloor): FloorView => ({
  bookedHours: f.booked_hours,
  capacityHours: f.capacity_hours,
  utilisation: f.utilisation,
  baysWorking: f.bays_working ?? 0,
  bays: f.bays.map((b) => ({
    bayId: b.bay_id,
    name: b.name,
    bookedHours: b.booked_hours,
    capacityHours: b.capacity_hours,
    utilisation: b.utilisation,
  })),
});

export interface RunningJob {
  elapsedMinutes: number;
  elapsed: string;
  estimatedHours: number;
  overEstimate: boolean;
  workOrder: WorkOrder;
}

export interface ShopHomeView {
  date: string;
  arriving: WorkOrder[];
  inProgress: RunningJob[];
  awaitingApproval: {
    count: number;
    totalValue: number;
    longest: { workOrderId: string; hours: number } | null;
    orders: { quotedValue: number; waitingHours: number; workOrder: WorkOrder }[];
  };
  readyForCollection: { count: number; value: number; orders: WorkOrder[] };
  floor: FloorView;
  revenue: { weekStart: string; thisWeek: number; lastWeek: number; deltaPct: number };
}

export interface RawShopHome {
  date: string;
  arriving: RawWorkOrder[];
  in_progress: { elapsed_minutes: number; elapsed: string; estimated_hours: number; over_estimate: boolean; work_order: RawWorkOrder }[];
  awaiting_approval: {
    count: number;
    total_value_cents: number;
    longest: { work_order_id: string; hours: number } | null;
    orders: { quoted_value_cents: number; waiting_hours: number; work_order: RawWorkOrder }[];
  };
  ready_for_collection: { count: number; value_cents: number; orders: RawWorkOrder[] };
  floor: RawFloor;
  revenue: { week_start: string; this_week_cents: number; last_week_cents: number; delta_pct: number };
}

export function toShopHome(h: RawShopHome): ShopHomeView {
  return {
    date: h.date,
    arriving: h.arriving.map(toWorkOrder),
    inProgress: h.in_progress.map((j) => ({
      elapsedMinutes: j.elapsed_minutes,
      elapsed: j.elapsed,
      estimatedHours: j.estimated_hours,
      overEstimate: j.over_estimate,
      workOrder: toWorkOrder(j.work_order),
    })),
    awaitingApproval: {
      count: h.awaiting_approval.count,
      totalValue: pesos(h.awaiting_approval.total_value_cents),
      longest: h.awaiting_approval.longest
        ? { workOrderId: h.awaiting_approval.longest.work_order_id, hours: h.awaiting_approval.longest.hours }
        : null,
      orders: h.awaiting_approval.orders.map((o) => ({
        quotedValue: pesos(o.quoted_value_cents),
        waitingHours: o.waiting_hours,
        workOrder: toWorkOrder(o.work_order),
      })),
    },
    readyForCollection: {
      count: h.ready_for_collection.count,
      value: pesos(h.ready_for_collection.value_cents),
      orders: h.ready_for_collection.orders.map(toWorkOrder),
    },
    floor: floor(h.floor),
    revenue: {
      weekStart: h.revenue.week_start,
      thisWeek: pesos(h.revenue.this_week_cents),
      lastWeek: pesos(h.revenue.last_week_cents),
      deltaPct: h.revenue.delta_pct,
    },
  };
}

export interface UtilisationPoint {
  date: string;
  label: string;
  utilisation: number;
  bookedHours: number;
}

export interface ShopReportsView {
  months: number;
  from: string;
  to: string;
  revenueByCustomer: NamedTotal[];
  revenueByServiceItem: NamedTotal[];
  utilisation: UtilisationPoint[];
  turnaroundByCustomer: NamedTotal[];
  maintenanceMix: MonthlyCostPoint[];
  partsMargin: { supplierProvided: number; ownStock: number; margin: number; markupPct: number };
}

export interface RawShopReports {
  months: number;
  from: string;
  to: string;
  revenue_by_customer: RawNamed[];
  revenue_by_service_item: RawNamed[];
  utilisation: { date: string; label: string; utilisation_pct: number; booked_hours: number }[];
  approval_turnaround_by_customer: RawNamed[];
  maintenance_mix: RawMonthly[];
  parts_margin: { supplier_provided_cents: number; own_stock_cents: number; margin_cents: number; markup_pct: number };
}

export function toShopReports(r: RawShopReports): ShopReportsView {
  return {
    months: r.months,
    from: r.from,
    to: r.to,
    revenueByCustomer: r.revenue_by_customer.map(named),
    revenueByServiceItem: r.revenue_by_service_item.map(named),
    utilisation: r.utilisation.map((u) => ({ date: u.date, label: u.label, utilisation: u.utilisation_pct, bookedHours: u.booked_hours })),
    turnaroundByCustomer: r.approval_turnaround_by_customer.map(named),
    maintenanceMix: r.maintenance_mix.map(monthly),
    partsMargin: {
      supplierProvided: pesos(r.parts_margin.supplier_provided_cents),
      ownStock: pesos(r.parts_margin.own_stock_cents),
      margin: pesos(r.parts_margin.margin_cents),
      markupPct: r.parts_margin.markup_pct,
    },
  };
}

export interface ClientRollup {
  customerAccountId: string;
  name: string;
  accountType: string;
  status: "active" | "suspended";
  vehicleCount: number;
  openWorkOrders: number;
  avgApprovalHours: number | null;
  spendThisPeriod: number;
  outstanding: number;
}

export interface RawClientRollup {
  customer_account_id: string;
  name: string;
  account_type: string;
  status: string;
  vehicle_count: number;
  open_work_orders: number;
  avg_approval_hours: number | null;
  spend_this_period_cents: number;
  outstanding_cents: number;
}

export function toClientRollup(r: RawClientRollup): ClientRollup {
  return {
    customerAccountId: r.customer_account_id,
    name: r.name,
    accountType: r.account_type,
    status: r.status as "active" | "suspended",
    vehicleCount: r.vehicle_count,
    openWorkOrders: r.open_work_orders,
    avgApprovalHours: r.avg_approval_hours,
    spendThisPeriod: pesos(r.spend_this_period_cents),
    outstanding: pesos(r.outstanding_cents),
  };
}

export interface ShopClientView {
  rollup: ClientRollup;
  overdueVehicles: number;
  account: ReturnType<typeof toFleetClient>;
  approvalOverrides: ReturnType<typeof toSettingsOverrides>;
  effectiveSettings: ReturnType<typeof toApprovalSettings>;
  vehicles: ReturnType<typeof toVehicle>[];
  workOrders: WorkOrder[];
}

export interface RawShopClient {
  rollup: RawClientRollup;
  overdue_vehicles: number;
  account: RawCustomerAccount;
  approval_overrides: RawSettings | null;
  effective_settings: RawSettings;
  vehicles: RawVehicle[];
  work_orders: RawWorkOrder[];
}

export function toShopClient(c: RawShopClient): ShopClientView {
  return {
    rollup: toClientRollup(c.rollup),
    overdueVehicles: c.overdue_vehicles,
    account: toFleetClient(c.account),
    approvalOverrides: toSettingsOverrides(c.approval_overrides),
    effectiveSettings: toApprovalSettings(c.effective_settings),
    vehicles: c.vehicles.map(toVehicle),
    workOrders: c.work_orders.map(toWorkOrder),
  };
}

export interface TechnicianLoadRow {
  technicianId: string;
  name: string;
  currentWorkOrderId: string | null;
  completedThisPeriod: number;
  avgActualHours: number | null;
  avgEstimatedHours: number | null;
  variancePct: number | null;
}

export interface RawTechnicianLoad {
  technician_id: string;
  name: string;
  current_work_order_id: string | null;
  completed_this_period: number;
  avg_actual_hours: number | null;
  avg_estimated_hours: number | null;
  variance_pct: number | null;
}

export function toTechnicianLoad(t: RawTechnicianLoad): TechnicianLoadRow {
  return {
    technicianId: t.technician_id,
    name: t.name,
    currentWorkOrderId: t.current_work_order_id,
    completedThisPeriod: t.completed_this_period,
    avgActualHours: t.avg_actual_hours,
    avgEstimatedHours: t.avg_estimated_hours,
    variancePct: t.variance_pct,
  };
}

export { toFleetSummary };

/* ------------------------------------------------------------- check-in */

/**
 * `GET /check-in/lookup`: an exact plate/VIN match (case, space and dash
 * insensitive), the form state it hydrates, and the work worth offering.
 * A stale odometer comes back with `odometerNeedsConfirmation` and is not
 * pre-filled — accepting an old reading shifts every due date behind it.
 */
export interface CheckInLookup {
  outcome: "existing" | "new" | "idle";
  matchedOn: "plate" | "vin" | null;
  vehicle: Vehicle | null;
  customer: FleetClient | null;
  lastOdometer: number | null;
  lastOdometerReadOn: string | null;
  odometerStale: boolean;
  form: { odometer: number | null; odometerNeedsConfirmation: boolean; customerName: string };
  /** Overdue and due-soon items, most urgent first — what to offer at the counter. */
  suggestedWork: PmsItem[];
}

export interface RawCheckInLookup {
  outcome: string;
  matched_on: string | null;
  vehicle: RawVehicle | null;
  customer: RawCustomerAccount | null;
  last_odometer: number | null;
  last_odometer_read_on: string | null;
  odometer_age_days: number | null;
  odometer_stale: boolean;
  form: { odometer: number | null; odometer_needs_confirmation: boolean; customer_name: string | null };
  suggested_work: RawPmsItem[];
}

export function toCheckInLookup(r: RawCheckInLookup): CheckInLookup {
  return {
    outcome: r.outcome === "existing" ? "existing" : r.outcome === "new" ? "new" : "idle",
    matchedOn: r.matched_on === "plate" || r.matched_on === "vin" ? r.matched_on : null,
    vehicle: r.vehicle ? toVehicle(r.vehicle) : null,
    customer: r.customer ? toFleetClient(r.customer) : null,
    lastOdometer: r.last_odometer,
    lastOdometerReadOn: r.last_odometer_read_on,
    odometerStale: r.odometer_stale,
    form: {
      odometer: r.form.odometer,
      odometerNeedsConfirmation: r.form.odometer_needs_confirmation,
      customerName: r.form.customer_name ?? "",
    },
    suggestedWork: r.suggested_work.map(toPmsItem),
  };
}
