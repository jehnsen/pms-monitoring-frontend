/**
 * The app's domain types: what components render.
 *
 * Since the API cutover (Phase 5) these are the API's resources, mapped by
 * `lib/mappers.ts` (camelCase, money in pesos for display). Everything the API
 * derives — due dates, health, totals, approval values, the next legal
 * statuses, expiry status — arrives as data here; the frontend never computes
 * an authoritative value itself (../api CLAUDE.md, R2).
 */

/* ------------------------------------------------------------- identity */

export type ClientUserRole =
  | "fleet_manager"
  | "operations"
  | "technician"
  | "purchasing_officer"
  | "viewer";

export type ProviderUserRole =
  | "provider_admin"
  | "service_advisor"
  | "provider_technician"
  | "branch_manager"
  | "cashier";

export type UserRole = ClientUserRole | ProviderUserRole;

/** Which side of the tenancy boundary a session sits on (the API's `side`). */
export type UserSide = "staff" | "portal";

/** The API's capability list (`GET /me` → `capabilities`). */
export type Capability =
  | "vehicle:update"
  | "vehicle:manage"
  | "workorder:create"
  | "workorder:update"
  | "workorder:complete"
  | "workorder:approve"
  | "po:issue"
  | "document:upload"
  | "document:delete"
  | "settings:manage"
  | "access:manage"
  | "customer:manage"
  | "organization:manage";

/** A module the API gates screens behind. */
export type ModuleKey = "repair_pms" | "detailing" | "equipment" | "cafe_pos";

export interface BranchRef {
  id: string;
  name: string;
  slug: string;
}

/** Branding: the tenant's (`/me` → `branding`), or the platform's when none resolves. */
export interface TenantSettings {
  displayName: string;
  logoUrl: string | null;
  /** Hex, e.g. "#1d5ba6" — drives the `--brand`/`--brand-foreground` CSS vars. */
  brandColor: string;
  supportEmail: string;
}

/**
 * The signed-in user, as `GET /me` describes them. Role, capabilities,
 * modules, branches and branding are the API's answer.
 */
export interface Session {
  /** The API user id (ULID). */
  uid: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  role: UserRole;
  /** The API's label for the role ("Fleet Manager"). */
  roleLabel: string;
  /** Job title for display; `role` is what permissions key off. */
  title: string;
  side: UserSide;
  /** The organization (../web's "provider"). */
  providerId: string;
  providerName: string;
  /** The customer account a portal user belongs to; null for staff. */
  fleetClientId: string | null;
  fleetClientName: string | null;
  capabilities: Capability[];
  /** Modules active where the session works. */
  modules: ModuleKey[];
  /** Branches a staff member may work in (empty for portal users). */
  branches: BranchRef[];
  /** True when the user is pinned to specific branches. */
  branchRestricted: boolean;
  branding: TenantSettings;
}

/** A person with access (`GET /users`). */
export interface Member {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  title: string;
  side: UserSide;
  role: UserRole;
  roleLabel: string;
  fleetClientId: string | null;
  branchIds: string[];
  status: "active" | "disabled" | string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  name: string;
  side: UserSide;
  role: UserRole;
  title: string;
  fleetClientId: string | null;
  branchIds: string[];
  status: "accepted" | "revoked" | "expired" | "pending";
  expiresAt: string;
  createdAt: string;
}

/* ------------------------------------------------------------- tenancy */

export type FleetClientStatus = "active" | "suspended";

/** A customer account (../web's "fleet client"). */
export interface FleetClient {
  id: string;
  name: string;
  accountType: "company" | "individual" | string;
  registeredName: string;
  contactName: string;
  contactEmail: string;
  mobile: string;
  address: string;
  tin: string;
  paymentTermsDays: number;
  creditLimit: number | null;
  /** Sparse overrides of the organization's bands (pesos for money keys). */
  approvalThresholdOverrides: Partial<ApprovalSettings> | null;
  logoUrl: string | null;
  brandColor: string | null;
  status: FleetClientStatus;
  /** Free text: contract terms and the like. */
  notes: string;
  tags: string[];
  createdAt: string;
}

export interface Bay {
  id: string;
  branchId: string;
  name: string;
  /** What the bay specialises in; advisory when assigning, never enforced. */
  focus: string;
  capacityHoursPerDay: number;
  status: string;
}

/** A technician on the provider's roster (`GET /technicians`). */
export interface ProviderTechnician {
  id: string;
  branchId: string;
  name: string;
  /** Advisory only, like `Bay.focus`. */
  specialty: string;
  skillTags: string[];
  /** Bay this technician normally works out of; null when unassigned. */
  homeBayId: string | null;
  userId: string | null;
  /** False retires a technician from new assignments without deleting history. */
  active: boolean;
}

/** A repair vendor on the provider's approved list. */
export interface ProviderVendor {
  id: string;
  name: string;
  active: boolean;
}

/* --------------------------------------------------------------- fleet */

export type VehicleOperationalStatus = "active" | "in_service" | "down";

export type PmsStatus = "overdue" | "due_soon" | "ok";

export type ComplianceStatus = "ok" | "expiring" | "expired";

export type VehicleClass = "sedan" | "suv" | "pickup" | "van" | "truck";

export type FuelType = "gasoline" | "diesel" | "hybrid" | "electric";

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
  code: string;
  name: string;
  category: TaskCategory;
  intervalKm: number;
  intervalMonths: number;
  /** Catalogue estimate, pesos. */
  estimatedCost: number;
  estimatedHours: number;
  /** Skipping this one takes the vehicle off the road. */
  critical: boolean;
  active: boolean;
}

/** The PMS summary the API attaches to a vehicle. */
export interface VehiclePms {
  status: PmsStatus;
  healthScore: number;
  overdueCount: number;
  dueSoonCount: number;
  nextItem: {
    serviceTaskId: string;
    name: string;
    status: PmsStatus;
    dueDate: string;
    daysRemaining: number;
    dueLabel: string;
    governedBy: "distance" | "time";
    kmRemaining: number;
    dueOdometer: number;
    progress: number;
  } | null;
}

export interface Vehicle {
  id: string;
  fleetClientId: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number | null;
  vin: string;
  vehicleClass: VehicleClass | null;
  fuelType: FuelType | null;
  color: string;
  /** Licence expiry of whoever is in `assignedTo`. */
  driverLicenceExpiry: string | null;
  /** Current odometer (the latest effective reading), km. */
  odometer: number;
  odometerLabel: string;
  odometerReadAt: string;
  odometerAgeDays: number;
  /** The API's verdict: the reading is too old to project from. */
  odometerStale: boolean;
  avgDailyKm: number;
  status: VehicleOperationalStatus;
  assignedTo: string;
  department: string;
  location: string;
  acquiredOn: string | null;
  registrationExpiry: string | null;
  insuranceExpiry: string | null;
  ltoRenewalMonth: string | null;
  complianceStatus: ComplianceStatus;
  /** Null where PMS doesn't apply (repair module off). */
  pms: VehiclePms | null;
  archivedAt: string | null;
}

export interface PmsItem {
  task: Pick<ServiceTask, "id" | "code" | "name" | "category" | "critical" | "intervalKm" | "intervalMonths">;
  status: PmsStatus;
  kmRemaining: number;
  daysRemaining: number;
  /** "in 11 days", "3 days overdue" — the API's wording. */
  dueLabel: string;
  progress: number;
  dueOdometer: number;
  dueDate: string;
  governedBy: "distance" | "time";
  lastDoneOn: string;
  lastDoneOdometer: number;
}

/** `GET /vehicles/{id}/health`. */
export interface VehicleHealth {
  vehicleId: string;
  evaluatedOn: string;
  items: PmsItem[];
  status: PmsStatus;
  overdueCount: number;
  dueSoonCount: number;
  nextItem: PmsItem | null;
  healthScore: number;
  thresholds: { dueSoonKm: number; dueSoonDays: number };
}

export interface MeterReading {
  id: string;
  value: number | null;
  readOn: string;
  source: string;
  recordedBy: string | null;
  voidsReadingId: string | null;
  voidReason: string | null;
  createdAt: string;
}

/** `GET /fleet/summary` (and the dashboard's `summary`). */
export interface FleetSummary {
  evaluatedOn: string;
  total: number;
  compliant: number;
  dueSoon: number;
  overdue: number;
  inService: number;
  down: number;
  complianceRate: number;
  avgHealthScore: number;
  totalOdometer: number;
  documents: { expired: number; expiring: number; ok: number };
  expiringDocuments: { windowDays: number; total: number; byKind: { label: string; count: number }[] };
  thresholds: {
    dueSoonKm: number;
    dueSoonDays: number;
    odometerStaleDays: number;
    dashboardExpiryWindowDays: number;
    badgeWarningDays: number;
    documentExpiryWarningDays: number;
  };
}

/* --------------------------------------------------------- work orders */

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

/** The brief's five-stage workflow, projected by the API over the nine statuses. */
export type LifecycleStage =
  | "draft"
  | "pending_approval"
  | "approved"
  | "in_progress"
  | "ready_for_billing"
  | "completed"
  | "declined"
  | "cancelled";

export type WorkOrderType = "preventive" | "corrective" | "inspection";

export type Priority = "low" | "medium" | "high" | "critical";

/** How much a line's absence would matter, worst-first. */
export type LineUrgency = "safety_critical" | "recommended" | "optional";

/** Whether the shop or the fleet's own stock supplies the part. */
export type PartsSource = "own_stock" | "supplier_provided";

export type LineApprovalStatus = "pending" | "approved" | "declined" | "deferred";

export type ApproverBand = "auto" | "operations" | "fleet_manager";

/** One entry in a work order's status history (append-only). */
export interface WorkOrderEvent {
  id: string;
  status: WorkOrderStatus;
  at: string;
  actor: string;
}

/** A part fitted, recorded at close-out. */
export interface PartLine {
  id: string;
  partNumber: string;
  name: string;
  quantity: number;
  /** Pesos. */
  unitCost: number;
}

/**
 * One priced line of a work order. Costs are the API's stored prices
 * (pesos here): the historical amount the customer authorised.
 */
export interface WorkOrderLine {
  id: string;
  serviceTaskId: string | null;
  description: string;
  category: TaskCategory | "other";
  quantity: number;
  unitPartRate: number;
  labourHours: number;
  labourRate: number;
  partCost: number;
  labourCost: number;
  /** partCost + labourCost, from the API. */
  lineCost: number;
  urgency: LineUrgency;
  partsSource: PartsSource;
  approvalStatus: LineApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  declineReason: string | null;
  photoUrls: string[];
}

export type ApprovalAction =
  | "sent_for_approval"
  | "auto_approved"
  | "approved"
  | "declined"
  | "deferred"
  | "escalated"
  | "variance_approved";

/** One entry in a work order's approval log (append-only). */
export interface ApprovalLogEntry {
  id: string;
  lineId: string | null;
  action: ApprovalAction;
  actorName: string;
  at: string;
  note: string | null;
  /** Pesos. */
  amountAtTime: number;
}

/** Billing totals, pesos (the API rounds each once, in centavos). */
export interface WorkOrderTotals {
  partsTotal: number;
  labourTotal: number;
  subTotal: number;
  miscTotal: number;
  taxTotal: number;
  vatRatePct: number;
  grandTotal: number;
}

export interface WorkOrderApproval {
  pendingValue: number;
  approvedValue: number;
  declinedValue: number;
  requiredApprover: ApproverBand;
  pendingApprovalEnteredAt: string | null;
  approvalWaitHours: number | null;
  slaHours: number;
  /** While pending: business hours waited so far (the API's count). */
  waitingHours: number | null;
  slaBreached: boolean;
  /** Whether the caller may decide the pending lines (capability + band). */
  canApprove: boolean;
}

/** A vehicle as screen endpoints attach it to an order. */
export interface VehicleRef {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
}

export interface WorkOrder {
  id: string;
  /** Issued at draft → pending_approval; "" while a draft. */
  reference: string;
  /** What to show: the reference, or the API's draft label. */
  displayReference: string;
  fleetClientId: string;
  vehicleId: string;
  title: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  lifecycleStage: LifecycleStage;
  /** The moves the API's state machine allows from here. */
  nextStatuses: WorkOrderStatus[];
  priority: Priority;
  branchId: string | null;
  bayId: string | null;
  technicianId: string | null;
  technician: string;
  /** A third-party subcontractor; "" in-house. */
  vendor: string;
  inHouse: boolean;
  openedOn: string;
  scheduledFor: string | null;
  scheduledTime: string | null;
  completedOn: string | null;
  collectedAt: string | null;
  odometerAtIntake: number | null;
  odometerAtService: number | null;
  findings: string;
  notes: string;
  cancellationReason: string | null;
  /** The estimate's aggregates (pesos). */
  laborCost: number;
  partsCost: number;
  totals: WorkOrderTotals;
  approvedTotals: WorkOrderTotals;
  approval: WorkOrderApproval;
  lines: WorkOrderLine[];
  taskIds: string[];
  parts: PartLine[];
  history: WorkOrderEvent[];
  approvalLog: ApprovalLogEntry[];
  /** Present on screen endpoints that attach them. */
  vehicle: VehicleRef | null;
  customerName: string | null;
  createdAt: string;
}

/* ----------------------------------------------------- approval settings */

/** Approval policy (pesos for money). Org defaults, branch and account overrides fold in the API. */
export interface ApprovalSettings {
  autoApproveUnder: number;
  opsApprovalUnder: number;
  slaHours: number;
  varianceThresholdPct: number;
  defaultPartsSource: PartsSource;
  monthlyBudget: number;
  /** 0 is a real setting (a non-VAT-registered provider). */
  vatRatePct: number;
  miscFeeFlat: number;
  defaultLabourRate: number;
}

/* -------------------------------------------------------------- parts */

/** A spare part one customer account stocks for its own fleet. */
export interface Part {
  id: string;
  fleetClientId: string;
  sku: string;
  name: string;
  category: TaskCategory | "other";
  unit: string;
  unitCost: number;
  currentStock: number;
  reorderPoint: number;
  needsReorder: boolean;
  preferredVendor: string;
  leadTimeDays: number;
  active: boolean;
  usages: { serviceTaskId: string; quantityPerService: number }[];
}

export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";

export interface PurchaseOrderLine {
  id: string;
  partId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  serviceTaskIds: string[];
  vehicleIds: string[];
}

export interface PurchaseOrder {
  id: string;
  fleetClientId: string;
  reference: string;
  vendor: string;
  status: PurchaseOrderStatus;
  nextStatuses: PurchaseOrderStatus[];
  /** Whether issuing is within the caller's approval band (the API's answer). */
  canSend: boolean;
  createdOn: string;
  createdBy: string;
  notes: string;
  total: number;
  lines: PurchaseOrderLine[];
  sentAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  events: { status: PurchaseOrderStatus; at: string; actorName: string; note: string | null }[];
}

/* ---------------------------------------------------------- documents */

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
  fleetClientId: string;
  name: string;
  kind: DocumentKind;
  kindLabel: string;
  vehicleId: string | null;
  workOrderId: string | null;
  uploadedBy: string;
  uploadedOn: string;
  sizeBytes: number;
  mimeType: string;
  /** Whether a file is stored (seeded records may carry metadata only). */
  hasFile: boolean;
  expiresOn: string | null;
  /** The API's verdict on the expiry date. */
  expiryStatus: ComplianceStatus;
  referenceNumber: string | null;
  issuedOn: string | null;
  issuingBody: string | null;
  notes: string;
}

/* ------------------------------------------------------------- alerts */

export type AlertKind =
  | "pms_overdue"
  | "pms_due_soon"
  | "document_expiry"
  | "work_order_overdue"
  | "approval_sla_breach"
  | "driver_licence_expiry";

export type AlertSeverity = "critical" | "warning" | "info";

/** Derived by the API on every read; ids are identity (read/dismiss keys). */
export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  vehicleId: string | null;
  href: string;
  daysRemaining: number;
  read: boolean;
  dismissed: boolean;
}
