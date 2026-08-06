/**
 * Lives here rather than in `lib/rbac.ts` so `lib/auth.ts` can type a session's
 * role without importing the RBAC module, which imports auth in turn.
 */
export type UserRole =
  | "fleet_manager"
  | "operations"
  | "technician"
  | "viewer";

export type VehicleOperationalStatus = "active" | "in_service" | "down";

/** Health of a preventive-maintenance item, worst-first. */
export type PmsStatus = "overdue" | "due_soon" | "ok";

export type WorkOrderStatus =
  | "open"
  | "scheduled"
  | "in_progress"
  | "completed"
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
  | "insurance"
  | "registration"
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
  /** Renewal date for documents that expire (insurance, registration). */
  expiresOn: string | null;
  notes: string;
}

/* ------------------------------------------------------------------- alerts */

export type AlertKind =
  | "pms_overdue"
  | "pms_due_soon"
  | "document_expiry"
  | "work_order_overdue";

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
}
