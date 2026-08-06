/**
 * Lives here rather than in `lib/rbac.ts` so `lib/auth.ts` can type a session's
 * role without importing the RBAC module, which imports auth in turn.
 */
export type UserRole =
  | "fleet_manager"
  | "operations"
  | "technician"
  | "purchasing_officer"
  | "viewer";

export type VehicleOperationalStatus = "active" | "in_service" | "down";

/** Health of a preventive-maintenance item, worst-first. */
export type PmsStatus = "overdue" | "due_soon" | "ok";

/**
 * Every job is a purchase before it's a repair, so it lives through an
 * approval stage before it can be scheduled:
 *
 *   draft -> pending_approval -> approved | partially_approved | declined
 *                                    |
 *                              scheduled -> in_progress -> closed
 *
 * `cancelled` is reachable from any pre-closed state and is a distinct
 * concept from `declined` — a decline is a purchasing decision on the
 * lines; a cancellation is the job being abandoned outright.
 */
export type WorkOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "partially_approved"
  | "declined"
  | "scheduled"
  | "in_progress"
  | "closed"
  | "cancelled";

export type WorkOrderType = "preventive" | "corrective" | "inspection";

export type Priority = "low" | "medium" | "high" | "critical";

export type VehicleClass = "sedan" | "suv" | "pickup" | "van" | "truck";

export type FuelType = "gasoline" | "diesel" | "hybrid" | "electric";

export interface Vehicle {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  vehicleClass: VehicleClass;
  fuelType: FuelType;
  color: string;
  /** Licence expiry of whoever is in `assignedTo`. Null when nobody's assigned. */
  driverLicenceExpiry: string | null;
  /** Current odometer reading, in kilometres. */
  odometer: number;
  /**
   * When that reading was taken. Readings are not always same-day, so distance
   * projections roll the odometer forward from here rather than assuming it is
   * current.
   */
  odometerReadAt: string;
  /** Rolling average distance per day, used to project km-based intervals onto a date. */
  avgDailyKm: number;
  status: VehicleOperationalStatus;
  assignedTo: string;
  department: string;
  location: string;
  acquiredOn: string;
  registrationExpiry: string;
  insuranceExpiry: string;
  /** Per-task service history keyed by task template id. */
  taskState: Record<string, TaskState>;
}

export interface TaskState {
  lastDoneOdometer: number;
  lastDoneOn: string;
}

export type TaskCategory =
  | "engine"
  | "drivetrain"
  | "brakes"
  | "tires"
  | "electrical"
  | "safety"
  | "body";

/** A recurring preventive-maintenance item, due on whichever limit arrives first. */
export interface ServiceTask {
  id: string;
  name: string;
  category: TaskCategory;
  intervalKm: number;
  intervalMonths: number;
  estimatedCost: number;
  estimatedHours: number;
  /** Skipping this one takes the vehicle off the road. */
  critical: boolean;
}

/**
 * One entry in a work order's status history. Append-only — nothing ever
 * edits or removes an entry, so the record can't drift from what actually
 * happened.
 */
export interface WorkOrderEvent {
  id: string;
  status: WorkOrderStatus;
  /** ISO datetime. */
  at: string;
  actor: string;
}

/** One line on a work order's parts list. */
export interface PartLine {
  id: string;
  partNumber: string;
  name: string;
  quantity: number;
  unitCost: number;
}

/** How much a line's absence would matter, worst-first. */
export type LineUrgency = "safety_critical" | "recommended" | "optional";

/** Whether the shop or the fleet's own stock supplies the part. */
export type PartsSource = "own_stock" | "supplier_provided";

export type LineApprovalStatus = "pending" | "approved" | "declined" | "deferred";

/**
 * One purchasable item on a work order. Approval happens per line, not per
 * order — a real answer is "do the brakes, skip the shocks" — so the order's
 * status is always derived from the set of its lines (see
 * `lib/approvals.ts`'s `deriveOrderStatus`), never set directly once the
 * order has left `draft`.
 */
export interface WorkOrderLine {
  id: string;
  description: string;
  category: TaskCategory | "other";
  partCost: number;
  labourCost: number;
  urgency: LineUrgency;
  partsSource: PartsSource;
  approvalStatus: LineApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Required when `approvalStatus` is `declined`, especially for safety-critical lines. */
  declineReason: string | null;
  photoUrls: string[];
}

export type ApprovalAction =
  | "auto_approved"
  | "approved"
  | "declined"
  | "deferred"
  | "escalated"
  | "variance_approved";

/**
 * One entry in a work order's approval log. Append-only, like `history` —
 * this is the shop's liability record for what was and wasn't authorised.
 */
export interface ApprovalLogEntry {
  id: string;
  /** Null for order-level entries, e.g. a variance re-approval at close-out. */
  lineId: string | null;
  action: ApprovalAction;
  actorId: string;
  actorName: string;
  at: string;
  note: string | null;
  amountAtTime: number;
}

/** Tenant-configurable approval policy. Lives on `FleetState`, edited in Settings. */
export interface ApprovalSettings {
  /** Total pending value below which lines auto-approve, no human involved. */
  autoApproveUnder: number;
  /** Above this, only a Fleet Manager can approve; below, Operations/Purchasing can too. */
  opsApprovalUnder: number;
  /** Working hours a line may sit in pending_approval before escalating. */
  slaHours: number;
  /** How far actual cost may exceed the approved amount before close-out is blocked. */
  varianceThresholdPct: number;
  defaultPartsSource: PartsSource;
  /** Maintenance spend ceiling per month, for the purchasing landing page's budget tile. */
  monthlyBudget: number;
}

/* --------------------------------------------------------- parts & demand */

/**
 * A stocked part. The catalogue attributes (sku, category, cost, reorder
 * point, vendor, lead time) come from `lib/parts.ts`'s static
 * `PART_DEFINITIONS` at seed time — `currentStock` is the only field that
 * actually changes afterward (consumed by jobs, replenished by receiving a
 * purchase order), which is why the record as a whole lives here in
 * `FleetState` rather than as static catalogue data.
 */
export interface Part {
  id: string;
  sku: string;
  name: string;
  category: TaskCategory | "other";
  unit: string;
  unitCost: number;
  currentStock: number;
  reorderPoint: number;
  preferredVendor: string;
  leadTimeDays: number;
}

export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";

/**
 * One line on a purchase order. `serviceTaskIds`/`vehicleIds` record which
 * projected due-items this line was raised to cover, so a later demand-forecast
 * run can exclude them rather than double-counting.
 */
export interface PurchaseOrderLine {
  id: string;
  partId: string;
  description: string;
  quantity: number;
  unitCost: number;
  serviceTaskIds: string[];
  vehicleIds: string[];
}

export interface PurchaseOrder {
  id: string;
  reference: string;
  vendor: string;
  status: PurchaseOrderStatus;
  createdOn: string;
  createdBy: string;
  lines: PurchaseOrderLine[];
  notes: string;
}

/* --------------------------------------------------------------- tenant */

/** Branding for the fleet client this instance is deployed to. */
export interface TenantSettings {
  displayName: string;
  logoUrl: string | null;
  /** Hex, e.g. "#1d5ba6" — drives the `--brand`/`--brand-foreground` CSS vars. */
  brandColor: string;
  supportEmail: string;
}

export interface WorkOrder {
  id: string;
  reference: string;
  vehicleId: string;
  title: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: Priority;
  openedOn: string;
  scheduledFor: string;
  completedOn: string | null;
  odometerAtService: number;
  technician: string;
  vendor: string;
  laborCost: number;
  /**
   * Authoritative only while `parts` is empty (estimates, seeded history). Once
   * parts are itemised, `resolvePartsCost` sums the lines instead — always read
   * through that helper rather than this field.
   */
  partsCost: number;
  /** Itemised parts replaced. Empty until a technician records them. */
  parts: PartLine[];
  /** What the technician found — the diagnostic half of the service record. */
  findings: string;
  /** Task template ids covered by this order. */
  taskIds: string[];
  notes: string;
  /** Every status change, oldest first — append-only. */
  history: WorkOrderEvent[];
  /** The purchasable items on this order — the source of truth once non-empty. */
  lines: WorkOrderLine[];
  /** Every approval decision, oldest first — append-only. */
  approvalLog: ApprovalLogEntry[];
  /** When the order most recently entered `pending_approval`; null once resolved. */
  pendingApprovalEnteredAt: string | null;
  /** Working hours spent in `pending_approval`, stamped once it resolves. */
  approvalWaitHours: number | null;
}

/** A single computed PMS item for one vehicle — the output of the due engine. */
export interface PmsItem {
  task: ServiceTask;
  status: PmsStatus;
  /** Negative once the interval has been passed. */
  kmRemaining: number;
  daysRemaining: number;
  /** 0–1+ progress through the interval; > 1 means overdue. */
  progress: number;
  dueOdometer: number;
  dueDate: string;
  /** Which limit governs — whichever arrives first. */
  governedBy: "distance" | "time";
  lastDoneOn: string;
  lastDoneOdometer: number;
}

export interface VehicleHealth {
  vehicle: Vehicle;
  items: PmsItem[];
  status: PmsStatus;
  overdueCount: number;
  dueSoonCount: number;
  /** The single most urgent item, or null when the vehicle is fully compliant. */
  nextItem: PmsItem | null;
  /** 0–100 compliance score across all tracked intervals. */
  healthScore: number;
}

/* ---------------------------------------------------------------- documents */

export type DocumentKind =
  | "invoice"
  | "service_report"
  | "inspection"
  | "lto_registration"
  | "ctpl"
  | "comprehensive_insurance"
  | "emission_test"
  | "ltfrb_franchise"
  | "warranty"
  | "photo"
  | "other";

export interface FleetDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  /** Documents may hang off a vehicle, a work order, both, or neither. */
  vehicleId: string | null;
  workOrderId: string | null;
  uploadedBy: string;
  uploadedOn: string;
  sizeBytes: number;
  mimeType: string;
  /**
   * Data URL for files added in-session. Seeded records carry `null` — they
   * stand for documents already held elsewhere, and cannot be opened.
   */
  dataUrl: string | null;
  /** Renewal date for documents that expire — the compliance kinds, plus warranty. */
  expiresOn: string | null;
  /** OR/CR number, policy number, certificate number — whatever the issuer prints. */
  referenceNumber: string | null;
  issuedOn: string | null;
  issuingBody: string | null;
  notes: string;
}

/* ------------------------------------------------------------------- alerts */

export type AlertKind =
  | "pms_overdue"
  | "pms_due_soon"
  | "document_expiry"
  | "work_order_overdue"
  | "approval_sla_breach"
  | "driver_licence_expiry";

export type AlertSeverity = "critical" | "warning" | "info";

/**
 * Alerts are derived from fleet state on every read, never stored — so they can
 * never contradict the data. Only the user's interaction with them persists,
 * keyed by the deterministic `id`.
 */
export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  vehicleId: string | null;
  href: string;
  /** Days until (negative: past) the thing this alert is about. */
  daysRemaining: number;
}

export interface AlertInteraction {
  readIds: string[];
  dismissedIds: string[];
}

export interface FleetState {
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
  documents: FleetDocument[];
  alerts: AlertInteraction;
  approvalSettings: ApprovalSettings;
  parts: Part[];
  purchaseOrders: PurchaseOrder[];
  tenant: TenantSettings;
}
