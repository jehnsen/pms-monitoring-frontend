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
  partsCost: number;
  /** Task template ids covered by this order. */
  taskIds: string[];
  notes: string;
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

export interface FleetState {
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
}
