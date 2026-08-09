/**
 * Row <-> domain mapping for the `pms_` tables.
 *
 * This is where `normalise()` from the localStorage store moved to. Its job is
 * unchanged: guarantee that every field the app's types promise is actually
 * present, so a null column or an absent relation can never surface as a
 * `.length` of undefined three components deep.
 *
 * Two conventions:
 *  - Postgres is snake_case, the domain is camelCase. Nothing else differs.
 *  - `date` columns come back as "YYYY-MM-DD" and `timestamptz` as ISO
 *    datetimes, which is exactly what the domain types already expect, so
 *    dates pass through as strings rather than becoming Date objects. The PMS
 *    engine parses them itself.
 */
import type {
  ApprovalLogEntry,
  ApprovalSettings,
  FleetClient,
  FleetDocument,
  Part,
  PartLine,
  Provider,
  PurchaseOrder,
  PurchaseOrderLine,
  ServiceTask,
  TaskState,
  Vehicle,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
} from "@/types";

/* ----------------------------------------------------------------- helpers */

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const num = (v: unknown, fallback = 0): number => {
  // Postgres `numeric` arrives as a string to preserve precision.
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const nullableNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const parsed = num(v, NaN);
  return Number.isFinite(parsed) ? parsed : null;
};

const nullableStr = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

type Row = Record<string, unknown>;

/* --------------------------------------------------------------- providers */

export function toProvider(row: Row): Provider {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    logoUrl: nullableStr(row.logo_url),
    brandColor: str(row.brand_color, "#1d5ba6"),
    supportEmail: str(row.support_email),
    createdAt: str(row.created_at),
  };
}

export function toFleetClient(row: Row): FleetClient {
  const overrides = row.approval_threshold_overrides;
  return {
    id: str(row.id),
    providerId: str(row.provider_id),
    name: str(row.name),
    slug: str(row.slug),
    contactName: str(row.contact_name),
    contactEmail: str(row.contact_email),
    contractTerms: str(row.contract_terms),
    paymentTermsDays: num(row.payment_terms_days, 30),
    // Null means "inherit every band from the provider" and must stay null —
    // an empty object would read the same here, but the distinction matters
    // to `approvalSettingsForClient`, so it is preserved rather than coerced.
    approvalThresholdOverrides:
      overrides && typeof overrides === "object"
        ? (overrides as Partial<ApprovalSettings>)
        : null,
    logoUrl: nullableStr(row.logo_url),
    brandColor: nullableStr(row.brand_color),
    status: row.status === "suspended" ? "suspended" : "active",
    createdAt: str(row.created_at),
  };
}

export function fleetClientToRow(
  client: Partial<FleetClient>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (client.id !== undefined) row.id = client.id;
  if (client.providerId !== undefined) row.provider_id = client.providerId;
  if (client.name !== undefined) row.name = client.name;
  if (client.slug !== undefined) row.slug = client.slug;
  if (client.contactName !== undefined) row.contact_name = client.contactName;
  if (client.contactEmail !== undefined) row.contact_email = client.contactEmail;
  if (client.contractTerms !== undefined) row.contract_terms = client.contractTerms;
  if (client.paymentTermsDays !== undefined) {
    row.payment_terms_days = client.paymentTermsDays;
  }
  if (client.approvalThresholdOverrides !== undefined) {
    row.approval_threshold_overrides = client.approvalThresholdOverrides;
  }
  if (client.logoUrl !== undefined) row.logo_url = client.logoUrl;
  if (client.brandColor !== undefined) row.brand_color = client.brandColor;
  if (client.status !== undefined) row.status = client.status;
  if (client.createdAt !== undefined) row.created_at = client.createdAt;
  return row;
}

/* ---------------------------------------------------------------- vehicles */

export function toVehicle(row: Row): Vehicle {
  const taskState =
    row.task_state && typeof row.task_state === "object"
      ? (row.task_state as Record<string, TaskState>)
      : {};

  return {
    id: str(row.id),
    fleetClientId: str(row.fleet_client_id),
    plateNumber: str(row.plate_number),
    make: str(row.make),
    model: str(row.model),
    year: num(row.year),
    vin: str(row.vin),
    vehicleClass: (row.vehicle_class as Vehicle["vehicleClass"]) ?? "sedan",
    fuelType: (row.fuel_type as Vehicle["fuelType"]) ?? "gasoline",
    color: str(row.color),
    driverLicenceExpiry: nullableStr(row.driver_licence_expiry),
    odometer: num(row.odometer),
    // Readings are not always same-day; an absent one is treated as current,
    // matching the old normalise().
    odometerReadAt:
      nullableStr(row.odometer_read_at) ?? new Date().toISOString().slice(0, 10),
    avgDailyKm: num(row.avg_daily_km),
    status: (row.status as Vehicle["status"]) ?? "active",
    assignedTo: str(row.assigned_to),
    department: str(row.department),
    location: str(row.location),
    acquiredOn: str(row.acquired_on),
    registrationExpiry: str(row.registration_expiry),
    insuranceExpiry: str(row.insurance_expiry),
    taskState,
  };
}

export function vehicleToRow(
  vehicle: Partial<Vehicle>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (vehicle.id !== undefined) row.id = vehicle.id;
  if (vehicle.fleetClientId !== undefined) row.fleet_client_id = vehicle.fleetClientId;
  if (vehicle.plateNumber !== undefined) row.plate_number = vehicle.plateNumber;
  if (vehicle.make !== undefined) row.make = vehicle.make;
  if (vehicle.model !== undefined) row.model = vehicle.model;
  if (vehicle.year !== undefined) row.year = vehicle.year;
  if (vehicle.vin !== undefined) row.vin = vehicle.vin;
  if (vehicle.vehicleClass !== undefined) row.vehicle_class = vehicle.vehicleClass;
  if (vehicle.fuelType !== undefined) row.fuel_type = vehicle.fuelType;
  if (vehicle.color !== undefined) row.color = vehicle.color;
  if (vehicle.driverLicenceExpiry !== undefined) {
    row.driver_licence_expiry = vehicle.driverLicenceExpiry || null;
  }
  if (vehicle.odometer !== undefined) row.odometer = vehicle.odometer;
  if (vehicle.odometerReadAt !== undefined) {
    row.odometer_read_at = vehicle.odometerReadAt || null;
  }
  if (vehicle.avgDailyKm !== undefined) row.avg_daily_km = vehicle.avgDailyKm;
  if (vehicle.status !== undefined) row.status = vehicle.status;
  if (vehicle.assignedTo !== undefined) row.assigned_to = vehicle.assignedTo;
  if (vehicle.department !== undefined) row.department = vehicle.department;
  if (vehicle.location !== undefined) row.location = vehicle.location;
  if (vehicle.acquiredOn !== undefined) row.acquired_on = vehicle.acquiredOn || null;
  if (vehicle.registrationExpiry !== undefined) {
    row.registration_expiry = vehicle.registrationExpiry || null;
  }
  if (vehicle.insuranceExpiry !== undefined) {
    row.insurance_expiry = vehicle.insuranceExpiry || null;
  }
  if (vehicle.taskState !== undefined) row.task_state = vehicle.taskState;
  return row;
}

/* ------------------------------------------------------------- work orders */

export function toWorkOrderEvent(row: Row): WorkOrderEvent {
  return {
    id: str(row.id),
    status: row.status as WorkOrderEvent["status"],
    at: str(row.at),
    actor: str(row.actor, "—"),
  };
}

/**
 * @param taskNames catalogue names by service-task id, used to resolve a
 *   line's label from its FK. A line with no `service_task_id` is ad-hoc work
 *   that was never in the catalogue, and falls back to its stored text.
 */
export function toWorkOrderLine(
  row: Row,
  taskNames?: ReadonlyMap<string, string>
): WorkOrderLine {
  const serviceTaskId = nullableStr(row.service_task_id);
  const catalogueName = serviceTaskId ? taskNames?.get(serviceTaskId) : undefined;

  return {
    id: str(row.id),
    serviceTaskId,
    // The catalogue is authoritative when the line points at it: renaming a
    // task must rename it everywhere, which was the whole point of the FK.
    description: catalogueName ?? str(row.description),
    category: (row.category as WorkOrderLine["category"]) ?? "other",
    partCost: num(row.part_cost),
    labourCost: num(row.labour_cost),
    urgency: (row.urgency as WorkOrderLine["urgency"]) ?? "recommended",
    partsSource: (row.parts_source as WorkOrderLine["partsSource"]) ?? "supplier_provided",
    approvalStatus:
      (row.approval_status as WorkOrderLine["approvalStatus"]) ?? "pending",
    approvedBy: nullableStr(row.approved_by),
    approvedAt: nullableStr(row.approved_at),
    declineReason: nullableStr(row.decline_reason),
    photoUrls: arr<string>(row.photo_urls),
  };
}

export function workOrderLineToRow(
  line: WorkOrderLine,
  workOrderId: string
): Record<string, unknown> {
  return {
    id: line.id,
    work_order_id: workOrderId,
    service_task_id: line.serviceTaskId ?? null,
    // Still written even when the FK is set: it is the historical label, and
    // what a line falls back to if its catalogue task is later deleted.
    description: line.description,
    category: line.category,
    part_cost: line.partCost,
    labour_cost: line.labourCost,
    urgency: line.urgency,
    parts_source: line.partsSource,
    approval_status: line.approvalStatus,
    approved_by: line.approvedBy,
    approved_at: line.approvedAt,
    decline_reason: line.declineReason,
    photo_urls: line.photoUrls ?? [],
  };
}

export function toApprovalLogEntry(row: Row): ApprovalLogEntry {
  return {
    id: str(row.id),
    fleetClientId: str(row.fleet_client_id),
    lineId: nullableStr(row.line_id),
    action: row.action as ApprovalLogEntry["action"],
    actorId: str(row.actor_id),
    actorName: str(row.actor_name),
    at: str(row.at),
    note: nullableStr(row.note),
    amountAtTime: num(row.amount_at_time),
  };
}

export function approvalLogEntryToRow(
  entry: ApprovalLogEntry,
  workOrderId: string
): Record<string, unknown> {
  return {
    id: entry.id,
    work_order_id: workOrderId,
    fleet_client_id: entry.fleetClientId,
    line_id: entry.lineId,
    action: entry.action,
    actor_id: entry.actorId,
    actor_name: entry.actorName,
    at: entry.at,
    note: entry.note,
    amount_at_time: entry.amountAtTime,
  };
}

/**
 * Everything a work order needs from the normalised child tables.
 *
 * These were an array column and a jsonb blob before; they are rows now, but
 * the domain type is deliberately unchanged — `order.taskIds` is still a
 * `string[]` at every call site. Normalising storage should not ripple into
 * fifteen components.
 */
export interface WorkOrderRelations {
  events: WorkOrderEvent[];
  lines: WorkOrderLine[];
  approvalLog: ApprovalLogEntry[];
  /** From `pms_work_order_tasks`, replacing the old `task_ids` array. */
  taskIds: string[];
  /** From `pms_work_order_parts`, replacing the old `parts` jsonb. */
  parts: PartLine[];
  /** Resolved through `technician_id`; falls back to the stored text. */
  technicianName: string | null;
  /** Resolved through `vendor_id`; falls back to the stored text. */
  vendorName: string | null;
}

/**
 * Assembles a work order from its own row plus its child collections.
 *
 * The children arrive as separate queries rather than a nested select because
 * `history` and `approvalLog` are append-only and ordered, and PostgREST's
 * embedded resources do not guarantee child ordering — the sequence columns do.
 */
export function toWorkOrder(row: Row, relations: WorkOrderRelations): WorkOrder {
  const { events, lines, approvalLog } = relations;
  const status = row.status as WorkOrder["status"];
  const openedOn = str(row.opened_on);

  return {
    id: str(row.id),
    reference: str(row.reference),
    vehicleId: str(row.vehicle_id),
    title: str(row.title),
    type: (row.type as WorkOrder["type"]) ?? "corrective",
    status,
    priority: (row.priority as WorkOrder["priority"]) ?? "medium",
    openedOn,
    scheduledFor: str(row.scheduled_for),
    // Never fabricate a time from a bare date.
    scheduledTime: nullableStr(row.scheduled_time),
    completedOn: nullableStr(row.completed_on),
    odometerAtService: num(row.odometer_at_service),
    // The catalogue row wins when the FK resolves; the text column is the
    // historical label for a technician who has since left the shop.
    technician: relations.technicianName ?? str(row.technician),
    vendor: relations.vendorName ?? str(row.vendor),
    bayId: nullableStr(row.bay_id),
    collectedAt: nullableStr(row.collected_at),
    collectedBy: nullableStr(row.collected_by),
    laborCost: num(row.labor_cost),
    partsCost: num(row.parts_cost),
    parts: relations.parts,
    findings: str(row.findings),
    taskIds: relations.taskIds,
    notes: str(row.notes),
    // A record with no stored history still carries its status; give it one
    // synthesized entry rather than an empty timeline.
    history:
      events.length > 0
        ? events
        : [{ id: `${str(row.id)}-legacy`, status, at: openedOn, actor: "—" }],
    lines,
    approvalLog,
    pendingApprovalEnteredAt: nullableStr(row.pending_approval_entered_at),
    approvalWaitHours: nullableNum(row.approval_wait_hours),
  };
}

/**
 * Name → id for a provider-scoped catalogue (technicians, vendors).
 *
 * The domain still carries names, so a write has to resolve one back to its
 * row. An unmatched name resolves to null rather than inventing a row: the
 * text column keeps the label, and the FK stays empty until the provider adds
 * the person to the catalogue.
 */
export type CatalogueIndex = ReadonlyMap<string, string>;

export function catalogueIndex(rows: Row[]): CatalogueIndex {
  const index = new Map<string, string>();
  for (const row of rows) {
    const name = str(row.name);
    if (name) index.set(name.toLowerCase(), str(row.id));
  }
  return index;
}

export function workOrderToRow(
  order: Partial<WorkOrder>,
  catalogues?: { technicians?: CatalogueIndex; vendors?: CatalogueIndex }
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (order.id !== undefined) row.id = order.id;
  if (order.reference !== undefined) row.reference = order.reference;
  if (order.vehicleId !== undefined) row.vehicle_id = order.vehicleId;
  if (order.title !== undefined) row.title = order.title;
  if (order.type !== undefined) row.type = order.type;
  if (order.status !== undefined) row.status = order.status;
  if (order.priority !== undefined) row.priority = order.priority;
  if (order.openedOn !== undefined) row.opened_on = order.openedOn || null;
  if (order.scheduledFor !== undefined) row.scheduled_for = order.scheduledFor || null;
  if (order.scheduledTime !== undefined) row.scheduled_time = order.scheduledTime;
  if (order.completedOn !== undefined) row.completed_on = order.completedOn || null;
  if (order.odometerAtService !== undefined) {
    row.odometer_at_service = order.odometerAtService;
  }
  // Both the FK and the text: the id is the relation, the text is the label
  // that survives the catalogue row being renamed or removed.
  if (order.technician !== undefined) {
    row.technician = order.technician;
    row.technician_id =
      catalogues?.technicians?.get(order.technician.toLowerCase()) ?? null;
  }
  if (order.vendor !== undefined) {
    row.vendor = order.vendor;
    row.vendor_id = catalogues?.vendors?.get(order.vendor.toLowerCase()) ?? null;
  }
  if (order.bayId !== undefined) row.bay_id = order.bayId;
  if (order.collectedAt !== undefined) row.collected_at = order.collectedAt;
  if (order.collectedBy !== undefined) row.collected_by = order.collectedBy;
  if (order.laborCost !== undefined) row.labor_cost = order.laborCost;
  if (order.partsCost !== undefined) row.parts_cost = order.partsCost;
  if (order.findings !== undefined) row.findings = order.findings;
  if (order.notes !== undefined) row.notes = order.notes;
  // `parts` and `taskIds` are deliberately absent: they are rows in
  // pms_work_order_parts / pms_work_order_tasks now, written by
  // `workOrderPartRows` / `workOrderTaskRows` alongside this row rather than
  // as columns on it. Including them here would send unknown columns.
  if (order.pendingApprovalEnteredAt !== undefined) {
    row.pending_approval_entered_at = order.pendingApprovalEnteredAt;
  }
  if (order.approvalWaitHours !== undefined) {
    row.approval_wait_hours = order.approvalWaitHours;
  }
  return row;
}

/* ------------------------------------- work order child rows (normalised) */

/** One `pms_work_order_parts` row per fitted part. */
export function toPartLine(row: Row): PartLine {
  return {
    id: str(row.id),
    // The catalogue SKU when the part resolves, else the label recorded at the
    // time — a part fitted off the shelf may never have had a pms_parts row.
    partNumber: str(row.part_number),
    name: str(row.name),
    quantity: num(row.quantity),
    unitCost: num(row.unit_cost),
  };
}

/**
 * Fitted parts as rows.
 *
 * Ids are positional and deterministic so a re-write of the same order
 * replaces its parts rather than accumulating duplicates — the caller deletes
 * by `work_order_id` and re-inserts.
 */
export function workOrderPartRows(
  parts: PartLine[],
  workOrderId: string,
  /** SKU → `pms_parts.id`, so a fitted part resolves to the catalogue row. */
  partsBySku?: ReadonlyMap<string, string>
): Record<string, unknown>[] {
  return parts.map((part, index) => ({
    id: part.id || `${workOrderId}-part-${index + 1}`,
    work_order_id: workOrderId,
    part_id: partsBySku?.get(part.partNumber) ?? null,
    part_number: part.partNumber,
    name: part.name,
    quantity: part.quantity,
    unit_cost: part.unitCost,
  }));
}

/** The `pms_work_order_tasks` junction rows for one order. */
export function workOrderTaskRows(
  taskIds: string[],
  workOrderId: string
): Record<string, unknown>[] {
  // Deduplicated: the junction's primary key would reject a repeat, and the
  // old array column had no such guard, so seeded data may carry one.
  return [...new Set(taskIds)].map((taskId) => ({
    work_order_id: workOrderId,
    service_task_id: taskId,
  }));
}

/** The `pms_purchase_order_line_tasks` / `_vehicles` junction rows. */
export function purchaseOrderLineTaskRows(
  line: PurchaseOrderLine
): Record<string, unknown>[] {
  return [...new Set(line.serviceTaskIds ?? [])].map((taskId) => ({
    purchase_order_line_id: line.id,
    service_task_id: taskId,
  }));
}

export function purchaseOrderLineVehicleRows(
  line: PurchaseOrderLine
): Record<string, unknown>[] {
  return [...new Set(line.vehicleIds ?? [])].map((vehicleId) => ({
    purchase_order_line_id: line.id,
    vehicle_id: vehicleId,
  }));
}

/* ---------------------------------------------------------------- documents */

export function toDocument(row: Row): FleetDocument {
  return {
    id: str(row.id),
    fleetClientId: str(row.fleet_client_id),
    name: str(row.name),
    kind: (row.kind as FleetDocument["kind"]) ?? "other",
    vehicleId: nullableStr(row.vehicle_id),
    workOrderId: nullableStr(row.work_order_id),
    uploadedBy: str(row.uploaded_by),
    uploadedOn: str(row.uploaded_on),
    sizeBytes: num(row.size_bytes),
    mimeType: str(row.mime_type),
    dataUrl: nullableStr(row.data_url),
    expiresOn: nullableStr(row.expires_on),
    referenceNumber: nullableStr(row.reference_number),
    issuedOn: nullableStr(row.issued_on),
    issuingBody: nullableStr(row.issuing_body),
    notes: str(row.notes),
  };
}

export function documentToRow(doc: FleetDocument): Record<string, unknown> {
  return {
    id: doc.id,
    fleet_client_id: doc.fleetClientId,
    name: doc.name,
    kind: doc.kind,
    vehicle_id: doc.vehicleId,
    work_order_id: doc.workOrderId,
    uploaded_by: doc.uploadedBy,
    uploaded_on: doc.uploadedOn,
    size_bytes: doc.sizeBytes,
    mime_type: doc.mimeType,
    data_url: doc.dataUrl,
    expires_on: doc.expiresOn,
    reference_number: doc.referenceNumber,
    issued_on: doc.issuedOn,
    issuing_body: doc.issuingBody,
    notes: doc.notes,
  };
}

/* -------------------------------------------------------- parts & purchasing */

export function toPart(row: Row): Part {
  return {
    id: str(row.id),
    fleetClientId: str(row.fleet_client_id),
    sku: str(row.sku),
    name: str(row.name),
    category: (row.category as Part["category"]) ?? "other",
    unit: str(row.unit, "pc"),
    unitCost: num(row.unit_cost),
    currentStock: num(row.current_stock),
    reorderPoint: num(row.reorder_point),
    preferredVendor: str(row.preferred_vendor),
    leadTimeDays: num(row.lead_time_days),
  };
}

/**
 * @param taskIds  from `pms_purchase_order_line_tasks`, replacing the old array
 * @param vehicleIds from `pms_purchase_order_line_vehicles`, likewise
 * @param taskNames catalogue names, so a line labelled from the catalogue
 *   follows a rename instead of keeping a stale copy
 */
export function toPurchaseOrderLine(
  row: Row,
  taskIds: string[] = [],
  vehicleIds: string[] = [],
  taskNames?: ReadonlyMap<string, string>
): PurchaseOrderLine {
  const serviceTaskId = nullableStr(row.service_task_id);
  const catalogueName = serviceTaskId ? taskNames?.get(serviceTaskId) : undefined;

  return {
    id: str(row.id),
    // `part_ref` is the enforced FK added in 0006; `part_id` is the original
    // unconstrained column, kept as the fallback for rows whose part has since
    // been deleted.
    partId: str(row.part_ref) || str(row.part_id),
    description: catalogueName ?? str(row.description),
    quantity: num(row.quantity),
    unitCost: num(row.unit_cost),
    serviceTaskIds: taskIds,
    vehicleIds,
  };
}

export function purchaseOrderLineToRow(
  line: PurchaseOrderLine,
  purchaseOrderId: string
): Record<string, unknown> {
  return {
    id: line.id,
    purchase_order_id: purchaseOrderId,
    part_id: line.partId,
    part_ref: line.partId || null,
    description: line.description,
    quantity: line.quantity,
    unit_cost: line.unitCost,
    // `serviceTaskIds` / `vehicleIds` are junction rows now — see
    // `purchaseOrderLineTaskRows` / `purchaseOrderLineVehicleRows`.
  };
}

export function toPurchaseOrder(row: Row, lines: PurchaseOrderLine[]): PurchaseOrder {
  return {
    id: str(row.id),
    fleetClientId: str(row.fleet_client_id),
    reference: str(row.reference),
    vendor: str(row.vendor),
    status: (row.status as PurchaseOrder["status"]) ?? "draft",
    createdOn: str(row.created_on),
    createdBy: str(row.created_by),
    lines,
    notes: str(row.notes),
  };
}

export function purchaseOrderToRow(po: PurchaseOrder): Record<string, unknown> {
  return {
    id: po.id,
    fleet_client_id: po.fleetClientId,
    reference: po.reference,
    vendor: po.vendor,
    status: po.status,
    created_on: po.createdOn,
    created_by: po.createdBy,
    notes: po.notes,
  };
}

/* ----------------------------------------------------------- service tasks */

export function toServiceTask(row: Row): ServiceTask {
  return {
    id: str(row.id),
    name: str(row.name),
    category: (row.category as ServiceTask["category"]) ?? "other",
    intervalKm: num(row.interval_km),
    intervalMonths: num(row.interval_months),
    estimatedCost: num(row.estimated_cost),
    estimatedHours: num(row.estimated_hours),
    critical: Boolean(row.critical),
  };
}

export function serviceTaskToRow(
  task: Partial<ServiceTask>,
  providerId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = { provider_id: providerId };
  if (task.id !== undefined) row.id = task.id;
  if (task.name !== undefined) row.name = task.name;
  if (task.category !== undefined) row.category = task.category;
  if (task.intervalKm !== undefined) row.interval_km = task.intervalKm;
  if (task.intervalMonths !== undefined) row.interval_months = task.intervalMonths;
  if (task.estimatedCost !== undefined) row.estimated_cost = task.estimatedCost;
  if (task.estimatedHours !== undefined) row.estimated_hours = task.estimatedHours;
  if (task.critical !== undefined) row.critical = task.critical;
  return row;
}

/* ------------------------------------------------------- approval settings */

export function toApprovalSettings(
  row: Row,
  defaults: ApprovalSettings
): ApprovalSettings {
  return {
    autoApproveUnder: num(row.auto_approve_under, defaults.autoApproveUnder),
    opsApprovalUnder: num(row.ops_approval_under, defaults.opsApprovalUnder),
    slaHours: num(row.sla_hours, defaults.slaHours),
    varianceThresholdPct: num(
      row.variance_threshold_pct,
      defaults.varianceThresholdPct
    ),
    defaultPartsSource:
      (row.default_parts_source as ApprovalSettings["defaultPartsSource"]) ??
      defaults.defaultPartsSource,
    monthlyBudget: num(row.monthly_budget, defaults.monthlyBudget),
  };
}

export function approvalSettingsToRow(
  patch: Partial<ApprovalSettings>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.autoApproveUnder !== undefined) {
    row.auto_approve_under = patch.autoApproveUnder;
  }
  if (patch.opsApprovalUnder !== undefined) {
    row.ops_approval_under = patch.opsApprovalUnder;
  }
  if (patch.slaHours !== undefined) row.sla_hours = patch.slaHours;
  if (patch.varianceThresholdPct !== undefined) {
    row.variance_threshold_pct = patch.varianceThresholdPct;
  }
  if (patch.defaultPartsSource !== undefined) {
    row.default_parts_source = patch.defaultPartsSource;
  }
  if (patch.monthlyBudget !== undefined) row.monthly_budget = patch.monthlyBudget;
  return row;
}
