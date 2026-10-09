/**
 * The seam between the API's resources and the app's domain types.
 *
 * Components never see a raw API payload; everything passes through here:
 *
 *  - snake_case → camelCase;
 *  - money: the API sends integer centavos, mapped to pesos here for DISPLAY
 *    only (`centsToPesos`); nothing in the app computes an authoritative total;
 *  - nullable API fields get the defaults components have always relied on
 *    ("" for text, [] for lists), so a null never surfaces as a runtime error
 *    deep in a component.
 *
 * The raw shapes below are the API's resources (checked against its
 * responses; `types/api.ts` holds the generated OpenAPI types).
 */
import type {
  Alert,
  AlertKind,
  AlertSeverity,
  ApprovalAction,
  ApprovalLogEntry,
  ApprovalSettings,
  ApproverBand,
  Bay,
  ComplianceStatus,
  DocumentKind,
  FleetClient,
  FleetDocument,
  FleetSummary,
  FuelType,
  Invitation,
  LifecycleStage,
  LineApprovalStatus,
  LineUrgency,
  Member,
  MeterReading,
  Part,
  PartLine,
  PartsSource,
  PmsItem,
  PmsStatus,
  Priority,
  ProviderTechnician,
  ProviderVendor,
  PurchaseOrder,
  PurchaseOrderStatus,
  ServiceTask,
  TaskCategory,
  UserRole,
  UserSide,
  Vehicle,
  VehicleClass,
  VehicleHealth,
  VehicleOperationalStatus,
  VehiclePms,
  VehicleRef,
  WorkOrder,
  WorkOrderLine,
  WorkOrderStatus,
  WorkOrderTotals,
  WorkOrderType,
} from "@/types";

/* ---------------------------------------------------------------- money */

/** Centavos → pesos, for display. Exact for any amount the API sends. */
export function centsToPesos(cents: number): number {
  return cents / 100;
}

/** Pesos typed in a form → centavos for the API (rounded once, half away from zero). */
export function pesosToCents(pesos: number): number {
  return Math.sign(pesos) * Math.round(Math.abs(pesos) * 100);
}

function pesos(cents: number | null | undefined): number {
  return typeof cents === "number" ? centsToPesos(cents) : 0;
}

function num(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") return Number(value);
  return 0;
}

function numOrNull(value: string | number | null | undefined): number | null {
  return value === null || value === undefined || value === "" ? null : num(value);
}

/* ----------------------------------------------------------- raw shapes */

export interface RawVehicle {
  id: string;
  customer_account_id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  vehicle_class: string | null;
  fuel_type: string | null;
  color: string | null;
  status: string;
  assigned_to: string | null;
  department: string | null;
  location: string | null;
  acquired_on: string | null;
  registration_expiry: string | null;
  insurance_expiry: string | null;
  driver_licence_expiry: string | null;
  lto_renewal_month: string | null;
  odometer: { value: number; label: string; read_on: string; age_days: number; stale: boolean; avg_daily_km: number };
  pms: {
    status: string;
    health_score: number;
    overdue_count: number;
    due_soon_count: number;
    next_item: {
      service_task_id: string;
      name: string;
      status: string;
      due_date: string;
      days_remaining: number;
      due_label: string;
      governed_by: string;
      km_remaining: number;
      due_odometer: number;
      progress: number;
    } | null;
  } | null;
  compliance_status: string;
  archived_at: string | null;
}

export interface RawPmsItem {
  service_task_id: string;
  task: { id: string; code: string; name: string; category: string; critical: boolean; interval_km: number; interval_months: number };
  status: string;
  km_remaining: number;
  days_remaining: number;
  due_label: string;
  progress: number;
  due_odometer: number;
  due_date: string;
  governed_by: string;
  last_done_on: string;
  last_done_odometer: number;
}

export interface RawVehicleHealth {
  vehicle_id: string;
  evaluated_on: string;
  status: string;
  health_score: number;
  overdue_count: number;
  due_soon_count: number;
  next_item: RawPmsItem | null;
  items: RawPmsItem[];
  thresholds: { due_soon_km: number; due_soon_days: number };
}

export interface RawTotals {
  parts_total_cents: number;
  labour_total_cents: number;
  sub_total_cents: number;
  misc_total_cents: number;
  tax_total_cents: number;
  vat_rate_pct: string;
  grand_total_cents: number;
}

export interface RawWorkOrderLine {
  id: string;
  service_task_id: string | null;
  description: string;
  category: string;
  quantity: string;
  unit_part_rate_cents: number;
  part_cost_cents: number;
  labour_hours: string;
  labour_rate_cents: number;
  labour_cost_cents: number;
  line_cost_cents: number;
  urgency: string;
  parts_source: string;
  approval_status: string;
  approved_by_name: string | null;
  approved_at: string | null;
  decline_reason: string | null;
  photos: string[];
}

export interface RawVehicleRef {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
}

export interface RawWorkOrder {
  id: string;
  reference: string;
  display_reference: string;
  title: string;
  type: string;
  status: string;
  lifecycle_stage: string;
  next_statuses: string[];
  priority: string;
  customer_account_id: string;
  vehicle_id: string;
  branch_id: string | null;
  bay_id: string | null;
  technician_id: string | null;
  technician_name: string | null;
  vendor: string;
  in_house: boolean;
  opened_on: string;
  scheduled_for: string | null;
  scheduled_time: string | null;
  odometer_at_intake: string | null;
  odometer_at_service: string | null;
  findings: string;
  notes: string;
  cancellation_reason: string | null;
  labor_cost_cents: number;
  parts_cost_cents: number;
  totals: RawTotals;
  approved_totals: RawTotals;
  approval: {
    pending_value_cents: number;
    approved_value_cents: number;
    declined_value_cents: number;
    required_approver: string;
    pending_approval_entered_at: string | null;
    approval_wait_hours: string | number | null;
    sla_hours: number;
    waiting_hours?: number | null;
    sla_breached?: boolean;
    can_approve?: boolean;
  };
  lines: RawWorkOrderLine[];
  task_ids: string[];
  parts: { id: string; part_number: string | null; name: string; quantity: string | number; unit_cost_cents: number }[];
  history: { id: string; status: string; at: string; actor_name: string }[];
  approval_log: {
    id: string;
    line_id: string | null;
    action: string;
    actor_name: string;
    at: string;
    note: string | null;
    amount_at_time_cents: number;
  }[];
  completed_on: string | null;
  collected_at: string | null;
  created_at: string;
  vehicle?: RawVehicleRef | null;
  customer_name?: string | null;
}

export interface RawDocument {
  id: string;
  customer_account_id: string;
  vehicle_id: string | null;
  work_order_id: string | null;
  kind: string;
  kind_label: string;
  name: string;
  mime_type: string | null;
  size_bytes: number;
  has_file: boolean;
  expires_on: string | null;
  expiry_status: string;
  reference_number: string | null;
  issued_on: string | null;
  issuing_body: string | null;
  notes: string | null;
  uploaded_by_name: string | null;
  uploaded_on: string;
}

export interface RawAlert {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  vehicle_id: string | null;
  href: string;
  days_remaining: number;
  read: boolean;
  dismissed: boolean;
}

export interface RawServiceTask {
  id: string;
  code: string;
  name: string;
  category: string;
  interval_km: number;
  interval_months: number;
  estimated_cost_cents: number;
  estimated_hours: string;
  critical: boolean;
  is_active: boolean;
}

export interface RawTechnician {
  id: string;
  branch_id: string;
  name: string;
  skill_tags: string[];
  specialty: string | null;
  home_bay_id: string | null;
  user_id: string | null;
  status: string;
}

export interface RawBay {
  id: string;
  branch_id: string;
  name: string;
  focus: string | null;
  capacity_hours_per_day: string;
  status: string;
}

export interface RawVendor {
  id: string;
  name: string;
  is_active: boolean;
}

export interface RawSettings {
  auto_approve_under_cents?: number | null;
  ops_approval_under_cents?: number | null;
  sla_hours?: number | null;
  variance_threshold_pct?: string | number | null;
  default_parts_source?: string | null;
  monthly_budget_cents?: number | null;
  vat_rate_pct?: string | number | null;
  misc_fee_flat_cents?: number | null;
  default_labour_rate_cents?: number | null;
}

export interface RawCustomerAccount {
  id: string;
  account_type: string;
  display_name: string;
  registered_name: string | null;
  tin: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  contact_name: string | null;
  contact_email: string | null;
  payment_terms_days: number;
  credit_limit_cents: number | null;
  approval_threshold_overrides: RawSettings | null;
  logo_url: string | null;
  brand_color: string | null;
  status: string;
  notes?: string | null;
  tags?: string[];
  created_at: string;
}

export interface RawUser {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  username: string | null;
  email: string;
  title: string | null;
  side: string;
  role: string;
  role_label: string;
  customer_account_id: string | null;
  branch_ids: string[];
  status: string;
  last_login_at: string | null;
  created_at: string;
}

export interface RawInvitation {
  id: string;
  email: string;
  name: string;
  side: string;
  role: string;
  title: string | null;
  customer_account_id: string | null;
  branch_ids: string[];
  status: "accepted" | "revoked" | "expired" | "pending";
  expires_at: string;
  created_at: string;
}

export interface RawPurchaseOrder {
  id: string;
  customer_account_id: string;
  reference: string;
  vendor: string;
  status: string;
  next_statuses: string[];
  can_send: boolean;
  created_on: string;
  created_by_name: string;
  notes: string;
  total_cents: number;
  lines: {
    id: string;
    fleet_part_id: string | null;
    description: string;
    quantity: number;
    unit_cost_cents: number;
    line_total_cents: number;
    service_task_ids: string[];
    vehicle_ids: string[];
  }[];
  sent_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  events: { status: string; at: string; actor_name: string; note: string | null }[];
}

export interface RawFleetPart {
  id: string;
  customer_account_id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unit_cost_cents: number;
  current_stock: number;
  reorder_point: number;
  needs_reorder: boolean;
  preferred_vendor: string;
  lead_time_days: number;
  is_active: boolean;
  usages: { service_task_id: string; quantity_per_service: number }[];
}

export interface RawMeterReading {
  id: string;
  value: string | null;
  read_on: string;
  source: string;
  recorded_by: string | null;
  voids_reading_id: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface RawFleetSummary {
  evaluated_on: string;
  total: number;
  compliant: number;
  due_soon: number;
  overdue: number;
  in_service: number;
  down: number;
  compliance_rate: number;
  avg_health_score: number;
  total_odometer: number;
  documents: { expired: number; expiring: number; ok: number };
  expiring_documents: { window_days: number; total: number; by_kind: { label: string; count: number }[] };
  thresholds: {
    due_soon_km: number;
    due_soon_days: number;
    odometer_stale_days: number;
    dashboard_expiry_window_days: number;
    badge_warning_days: number;
    document_expiry_warning_days: number;
  };
}

/* -------------------------------------------------------------- mappers */

export function toVehicle(v: RawVehicle): Vehicle {
  return {
    id: v.id,
    fleetClientId: v.customer_account_id,
    plateNumber: v.plate_number,
    make: v.make ?? "",
    model: v.model ?? "",
    year: v.year,
    vin: v.vin ?? "",
    vehicleClass: (v.vehicle_class as VehicleClass | null) ?? null,
    fuelType: (v.fuel_type as FuelType | null) ?? null,
    color: v.color ?? "",
    driverLicenceExpiry: v.driver_licence_expiry,
    odometer: v.odometer.value,
    odometerLabel: v.odometer.label,
    odometerReadAt: v.odometer.read_on,
    odometerAgeDays: v.odometer.age_days,
    odometerStale: v.odometer.stale,
    avgDailyKm: v.odometer.avg_daily_km,
    status: v.status as VehicleOperationalStatus,
    assignedTo: v.assigned_to ?? "",
    department: v.department ?? "",
    location: v.location ?? "",
    acquiredOn: v.acquired_on,
    registrationExpiry: v.registration_expiry,
    insuranceExpiry: v.insurance_expiry,
    ltoRenewalMonth: v.lto_renewal_month,
    complianceStatus: v.compliance_status as ComplianceStatus,
    pms: v.pms ? toVehiclePms(v.pms) : null,
    archivedAt: v.archived_at,
  };
}

function toVehiclePms(p: NonNullable<RawVehicle["pms"]>): VehiclePms {
  return {
    status: p.status as PmsStatus,
    healthScore: p.health_score,
    overdueCount: p.overdue_count,
    dueSoonCount: p.due_soon_count,
    nextItem: p.next_item
      ? {
          serviceTaskId: p.next_item.service_task_id,
          name: p.next_item.name,
          status: p.next_item.status as PmsStatus,
          dueDate: p.next_item.due_date,
          daysRemaining: p.next_item.days_remaining,
          dueLabel: p.next_item.due_label,
          governedBy: p.next_item.governed_by as "distance" | "time",
          kmRemaining: p.next_item.km_remaining,
          dueOdometer: p.next_item.due_odometer,
          progress: p.next_item.progress,
        }
      : null,
  };
}

export function toPmsItem(i: RawPmsItem): PmsItem {
  return {
    task: {
      id: i.task.id,
      code: i.task.code,
      name: i.task.name,
      category: i.task.category as TaskCategory,
      critical: i.task.critical,
      intervalKm: i.task.interval_km,
      intervalMonths: i.task.interval_months,
    },
    status: i.status as PmsStatus,
    kmRemaining: i.km_remaining,
    daysRemaining: i.days_remaining,
    dueLabel: i.due_label,
    progress: i.progress,
    dueOdometer: i.due_odometer,
    dueDate: i.due_date,
    governedBy: i.governed_by as "distance" | "time",
    lastDoneOn: i.last_done_on,
    lastDoneOdometer: i.last_done_odometer,
  };
}

export function toVehicleHealth(h: RawVehicleHealth): VehicleHealth {
  return {
    vehicleId: h.vehicle_id,
    evaluatedOn: h.evaluated_on,
    items: h.items.map(toPmsItem),
    status: h.status as PmsStatus,
    overdueCount: h.overdue_count,
    dueSoonCount: h.due_soon_count,
    nextItem: h.next_item ? toPmsItem(h.next_item) : null,
    healthScore: h.health_score,
    thresholds: { dueSoonKm: h.thresholds.due_soon_km, dueSoonDays: h.thresholds.due_soon_days },
  };
}

export function toVehicleRef(v: RawVehicleRef): VehicleRef {
  return { id: v.id, plateNumber: v.plate_number, make: v.make ?? "", model: v.model ?? "" };
}

export function toTotals(t: RawTotals): WorkOrderTotals {
  return {
    partsTotal: pesos(t.parts_total_cents),
    labourTotal: pesos(t.labour_total_cents),
    subTotal: pesos(t.sub_total_cents),
    miscTotal: pesos(t.misc_total_cents),
    taxTotal: pesos(t.tax_total_cents),
    vatRatePct: num(t.vat_rate_pct),
    grandTotal: pesos(t.grand_total_cents),
  };
}

export function toWorkOrderLine(l: RawWorkOrderLine): WorkOrderLine {
  return {
    id: l.id,
    serviceTaskId: l.service_task_id,
    description: l.description,
    category: l.category as TaskCategory | "other",
    quantity: num(l.quantity),
    unitPartRate: pesos(l.unit_part_rate_cents),
    labourHours: num(l.labour_hours),
    labourRate: pesos(l.labour_rate_cents),
    partCost: pesos(l.part_cost_cents),
    labourCost: pesos(l.labour_cost_cents),
    lineCost: pesos(l.line_cost_cents),
    urgency: l.urgency as LineUrgency,
    partsSource: l.parts_source as PartsSource,
    approvalStatus: l.approval_status as LineApprovalStatus,
    approvedBy: l.approved_by_name,
    approvedAt: l.approved_at,
    declineReason: l.decline_reason,
    photoUrls: l.photos ?? [],
  };
}

export function toWorkOrder(o: RawWorkOrder): WorkOrder {
  return {
    id: o.id,
    reference: o.reference,
    displayReference: o.display_reference,
    fleetClientId: o.customer_account_id,
    vehicleId: o.vehicle_id,
    title: o.title,
    type: o.type as WorkOrderType,
    status: o.status as WorkOrderStatus,
    lifecycleStage: o.lifecycle_stage as LifecycleStage,
    nextStatuses: o.next_statuses as WorkOrderStatus[],
    priority: o.priority as Priority,
    branchId: o.branch_id,
    bayId: o.bay_id,
    technicianId: o.technician_id,
    technician: o.technician_name ?? "",
    vendor: o.vendor ?? "",
    inHouse: o.in_house,
    openedOn: o.opened_on,
    scheduledFor: o.scheduled_for,
    scheduledTime: o.scheduled_time,
    completedOn: o.completed_on,
    collectedAt: o.collected_at,
    odometerAtIntake: numOrNull(o.odometer_at_intake),
    odometerAtService: numOrNull(o.odometer_at_service),
    findings: o.findings ?? "",
    notes: o.notes ?? "",
    cancellationReason: o.cancellation_reason,
    laborCost: pesos(o.labor_cost_cents),
    partsCost: pesos(o.parts_cost_cents),
    totals: toTotals(o.totals),
    approvedTotals: toTotals(o.approved_totals),
    approval: {
      pendingValue: pesos(o.approval.pending_value_cents),
      approvedValue: pesos(o.approval.approved_value_cents),
      declinedValue: pesos(o.approval.declined_value_cents),
      requiredApprover: o.approval.required_approver as ApproverBand,
      pendingApprovalEnteredAt: o.approval.pending_approval_entered_at,
      approvalWaitHours: numOrNull(o.approval.approval_wait_hours),
      slaHours: o.approval.sla_hours,
      waitingHours: o.approval.waiting_hours ?? null,
      slaBreached: o.approval.sla_breached ?? false,
      canApprove: o.approval.can_approve ?? false,
    },
    lines: (o.lines ?? []).map(toWorkOrderLine),
    taskIds: o.task_ids ?? [],
    parts: (o.parts ?? []).map(
      (p): PartLine => ({
        id: p.id,
        partNumber: p.part_number ?? "",
        name: p.name,
        quantity: num(p.quantity),
        unitCost: pesos(p.unit_cost_cents),
      })
    ),
    history: (o.history ?? []).map((e) => ({ id: e.id, status: e.status as WorkOrderStatus, at: e.at, actor: e.actor_name })),
    approvalLog: (o.approval_log ?? []).map(
      (e): ApprovalLogEntry => ({
        id: e.id,
        lineId: e.line_id,
        action: e.action as ApprovalAction,
        actorName: e.actor_name,
        at: e.at,
        note: e.note,
        amountAtTime: pesos(e.amount_at_time_cents),
      })
    ),
    vehicle: o.vehicle ? toVehicleRef(o.vehicle) : null,
    customerName: o.customer_name ?? null,
    createdAt: o.created_at,
  };
}

export function toDocument(d: RawDocument): FleetDocument {
  return {
    id: d.id,
    fleetClientId: d.customer_account_id,
    name: d.name,
    kind: d.kind as DocumentKind,
    kindLabel: d.kind_label,
    vehicleId: d.vehicle_id,
    workOrderId: d.work_order_id,
    uploadedBy: d.uploaded_by_name ?? "",
    uploadedOn: d.uploaded_on,
    sizeBytes: d.size_bytes,
    mimeType: d.mime_type ?? "",
    hasFile: d.has_file,
    expiresOn: d.expires_on,
    expiryStatus: d.expiry_status as ComplianceStatus,
    referenceNumber: d.reference_number,
    issuedOn: d.issued_on,
    issuingBody: d.issuing_body,
    notes: d.notes ?? "",
  };
}

export function toAlert(a: RawAlert): Alert {
  return {
    id: a.id,
    kind: a.kind as AlertKind,
    severity: a.severity as AlertSeverity,
    title: a.title,
    body: a.body,
    vehicleId: a.vehicle_id,
    href: a.href,
    daysRemaining: a.days_remaining,
    read: a.read,
    dismissed: a.dismissed,
  };
}

export function toServiceTask(t: RawServiceTask): ServiceTask {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    category: t.category as TaskCategory,
    intervalKm: t.interval_km,
    intervalMonths: t.interval_months,
    estimatedCost: pesos(t.estimated_cost_cents),
    estimatedHours: num(t.estimated_hours),
    critical: t.critical,
    active: t.is_active,
  };
}

export function toTechnician(t: RawTechnician): ProviderTechnician {
  return {
    id: t.id,
    branchId: t.branch_id,
    name: t.name,
    specialty: t.specialty ?? "",
    skillTags: t.skill_tags ?? [],
    homeBayId: t.home_bay_id,
    userId: t.user_id,
    active: t.status === "active",
  };
}

export function toBay(b: RawBay): Bay {
  return {
    id: b.id,
    branchId: b.branch_id,
    name: b.name,
    focus: b.focus ?? "",
    capacityHoursPerDay: num(b.capacity_hours_per_day),
    status: b.status,
  };
}

export function toVendor(v: RawVendor): ProviderVendor {
  return { id: v.id, name: v.name, active: v.is_active };
}

/** A full settings set (organization or effective). */
export function toApprovalSettings(s: RawSettings): ApprovalSettings {
  return {
    autoApproveUnder: pesos(s.auto_approve_under_cents),
    opsApprovalUnder: pesos(s.ops_approval_under_cents),
    slaHours: num(s.sla_hours),
    varianceThresholdPct: num(s.variance_threshold_pct),
    defaultPartsSource: (s.default_parts_source ?? "supplier_provided") as PartsSource,
    monthlyBudget: pesos(s.monthly_budget_cents),
    vatRatePct: num(s.vat_rate_pct),
    miscFeeFlat: pesos(s.misc_fee_flat_cents),
    defaultLabourRate: pesos(s.default_labour_rate_cents),
  };
}

/** A sparse override set: only the keys present (an unset key inherits). */
export function toSettingsOverrides(s: RawSettings | null | undefined): Partial<ApprovalSettings> | null {
  if (!s) return null;
  const out: Partial<ApprovalSettings> = {};
  if (s.auto_approve_under_cents != null) out.autoApproveUnder = pesos(s.auto_approve_under_cents);
  if (s.ops_approval_under_cents != null) out.opsApprovalUnder = pesos(s.ops_approval_under_cents);
  if (s.sla_hours != null) out.slaHours = num(s.sla_hours);
  if (s.variance_threshold_pct != null) out.varianceThresholdPct = num(s.variance_threshold_pct);
  if (s.default_parts_source != null) out.defaultPartsSource = s.default_parts_source as PartsSource;
  if (s.monthly_budget_cents != null) out.monthlyBudget = pesos(s.monthly_budget_cents);
  if (s.vat_rate_pct != null) out.vatRatePct = num(s.vat_rate_pct);
  if (s.misc_fee_flat_cents != null) out.miscFeeFlat = pesos(s.misc_fee_flat_cents);
  if (s.default_labour_rate_cents != null) out.defaultLabourRate = pesos(s.default_labour_rate_cents);
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Settings edits → the API's body. Money keys go to centavos; `null` clears
 * an override (it inherits again).
 */
export function settingsToApi(patch: { [K in keyof ApprovalSettings]?: ApprovalSettings[K] | null }): RawSettings {
  const out: RawSettings = {};
  const money = (v: number | null | undefined) => (v === null ? null : v === undefined ? undefined : pesosToCents(v));
  if ("autoApproveUnder" in patch) out.auto_approve_under_cents = money(patch.autoApproveUnder);
  if ("opsApprovalUnder" in patch) out.ops_approval_under_cents = money(patch.opsApprovalUnder);
  if ("slaHours" in patch) out.sla_hours = patch.slaHours ?? null;
  if ("varianceThresholdPct" in patch) out.variance_threshold_pct = patch.varianceThresholdPct == null ? null : String(patch.varianceThresholdPct);
  if ("defaultPartsSource" in patch) out.default_parts_source = patch.defaultPartsSource ?? null;
  if ("monthlyBudget" in patch) out.monthly_budget_cents = money(patch.monthlyBudget);
  if ("vatRatePct" in patch) out.vat_rate_pct = patch.vatRatePct == null ? null : String(patch.vatRatePct);
  if ("miscFeeFlat" in patch) out.misc_fee_flat_cents = money(patch.miscFeeFlat);
  if ("defaultLabourRate" in patch) out.default_labour_rate_cents = money(patch.defaultLabourRate);
  return out;
}

export function toFleetClient(a: RawCustomerAccount): FleetClient {
  return {
    id: a.id,
    name: a.display_name,
    accountType: a.account_type,
    registeredName: a.registered_name ?? "",
    contactName: a.contact_name ?? "",
    contactEmail: a.contact_email ?? a.email ?? "",
    mobile: a.mobile ?? "",
    address: a.address ?? "",
    tin: a.tin ?? "",
    paymentTermsDays: a.payment_terms_days,
    creditLimit: a.credit_limit_cents === null ? null : pesos(a.credit_limit_cents),
    approvalThresholdOverrides: toSettingsOverrides(a.approval_threshold_overrides),
    logoUrl: a.logo_url,
    brandColor: a.brand_color,
    status: a.status as "active" | "suspended",
    notes: a.notes ?? "",
    tags: a.tags ?? [],
    createdAt: a.created_at,
  };
}

export function toMember(u: RawUser): Member {
  return {
    id: u.id,
    name: u.name,
    firstName: u.first_name,
    lastName: u.last_name,
    username: u.username ?? "",
    email: u.email,
    title: u.title ?? "",
    side: u.side as UserSide,
    role: u.role as UserRole,
    roleLabel: u.role_label,
    fleetClientId: u.customer_account_id,
    branchIds: u.branch_ids ?? [],
    status: u.status,
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
  };
}

export function toInvitation(i: RawInvitation): Invitation {
  return {
    id: i.id,
    email: i.email,
    name: i.name,
    side: i.side as UserSide,
    role: i.role as UserRole,
    title: i.title ?? "",
    fleetClientId: i.customer_account_id,
    branchIds: i.branch_ids ?? [],
    status: i.status,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  };
}

export function toPurchaseOrder(p: RawPurchaseOrder): PurchaseOrder {
  return {
    id: p.id,
    fleetClientId: p.customer_account_id,
    reference: p.reference,
    vendor: p.vendor,
    status: p.status as PurchaseOrderStatus,
    nextStatuses: p.next_statuses as PurchaseOrderStatus[],
    canSend: p.can_send,
    createdOn: p.created_on,
    createdBy: p.created_by_name,
    notes: p.notes ?? "",
    total: pesos(p.total_cents),
    lines: (p.lines ?? []).map((l) => ({
      id: l.id,
      partId: l.fleet_part_id,
      description: l.description,
      quantity: l.quantity,
      unitCost: pesos(l.unit_cost_cents),
      lineTotal: pesos(l.line_total_cents),
      serviceTaskIds: l.service_task_ids ?? [],
      vehicleIds: l.vehicle_ids ?? [],
    })),
    sentAt: p.sent_at,
    receivedAt: p.received_at,
    cancelledAt: p.cancelled_at,
    cancellationReason: p.cancellation_reason,
    events: (p.events ?? []).map((e) => ({ status: e.status as PurchaseOrderStatus, at: e.at, actorName: e.actor_name, note: e.note })),
  };
}

export function toPart(p: RawFleetPart): Part {
  return {
    id: p.id,
    fleetClientId: p.customer_account_id,
    sku: p.sku,
    name: p.name,
    category: p.category as TaskCategory | "other",
    unit: p.unit,
    unitCost: pesos(p.unit_cost_cents),
    currentStock: p.current_stock,
    reorderPoint: p.reorder_point,
    needsReorder: p.needs_reorder,
    preferredVendor: p.preferred_vendor,
    leadTimeDays: p.lead_time_days,
    active: p.is_active,
    usages: (p.usages ?? []).map((u) => ({ serviceTaskId: u.service_task_id, quantityPerService: u.quantity_per_service })),
  };
}

export function toMeterReading(r: RawMeterReading): MeterReading {
  return {
    id: r.id,
    value: numOrNull(r.value),
    readOn: r.read_on,
    source: r.source,
    recordedBy: r.recorded_by,
    voidsReadingId: r.voids_reading_id,
    voidReason: r.void_reason,
    createdAt: r.created_at,
  };
}

export function toFleetSummary(s: RawFleetSummary): FleetSummary {
  return {
    evaluatedOn: s.evaluated_on,
    total: s.total,
    compliant: s.compliant,
    dueSoon: s.due_soon,
    overdue: s.overdue,
    inService: s.in_service,
    down: s.down,
    complianceRate: s.compliance_rate,
    avgHealthScore: s.avg_health_score,
    totalOdometer: s.total_odometer,
    documents: s.documents,
    expiringDocuments: {
      windowDays: s.expiring_documents.window_days,
      total: s.expiring_documents.total,
      byKind: s.expiring_documents.by_kind ?? [],
    },
    thresholds: {
      dueSoonKm: s.thresholds.due_soon_km,
      dueSoonDays: s.thresholds.due_soon_days,
      odometerStaleDays: s.thresholds.odometer_stale_days,
      dashboardExpiryWindowDays: s.thresholds.dashboard_expiry_window_days,
      badgeWarningDays: s.thresholds.badge_warning_days,
      documentExpiryWarningDays: s.thresholds.document_expiry_warning_days,
    },
  };
}
