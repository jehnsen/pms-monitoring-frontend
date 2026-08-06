import { addDays, formatISO, parseISO, subDays } from "date-fns";
import type {
  ApprovalLogEntry,
  FleetDocument,
  FleetState,
  LineUrgency,
  Part,
  PartLine,
  PartsSource,
  Priority,
  PurchaseOrder,
  TaskState,
  Vehicle,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
  WorkOrderStatus,
} from "@/types";
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { evaluateVehicle } from "@/lib/pms";
import { DEFAULT_APPROVAL_SETTINGS, requiredApprover } from "@/lib/approvals";
import { PART_BY_ID, PART_DEFINITIONS, SERVICE_ITEM_PARTS } from "@/lib/parts";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/tenant";

/**
 * Deterministic PRNG. The demo fleet has to look lived-in — uneven odometers,
 * a few vehicles genuinely behind on service — while staying identical across
 * reloads, so every random draw comes from a fixed seed rather than Math.random.
 */
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(date: Date) {
  return formatISO(date, { representation: "date" });
}

const LABOR_RATE_PER_HOUR = 650;

/** How far through its intervals a vehicle should sit when the demo loads. */
type WearProfile = "overdue" | "due_soon" | "healthy";

/**
 * A vehicle is described by how hard it is worked and how long it has been in
 * service. **The odometer is derived, never stated.**
 *
 * Stating both an odometer and a daily rate lets them drift apart, and they had:
 * the previous fleet carried odometers roughly half what its own daily rates
 * implied. That matters beyond looking wrong — the due-date projection converts
 * a distance interval into a date using the daily rate, so an inflated rate made
 * intervals appear to fall due far earlier than the mileage justified.
 */
interface VehicleSpec {
  plateNumber: string;
  make: string;
  model: string;
  vehicleClass: Vehicle["vehicleClass"];
  fuelType: Vehicle["fuelType"];
  color: string;
  /** Rolling average distance per day. */
  avgDailyKm: number;
  /** Days the unit has been on the fleet; drives both odometer and age. */
  daysInService: number;
  /** Days since the last odometer reading was taken. */
  readingAgeDays: number;
  status: Vehicle["status"];
  assignedTo: string;
  department: string;
  location: string;
  profile: WearProfile;
}

const VEHICLE_SPECS: VehicleSpec[] = [
  {
    plateNumber: "NBA 4821",
    make: "Toyota",
    model: "Hilux 2.4 G",
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Super White",
    avgDailyKm: 48,
    daysInService: 950,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Rafael Domingo",
    department: "Field Operations",
    location: "Quezon City Hub",
    profile: "overdue",
  },
  {
    plateNumber: "CBA 1177",
    make: "Ford",
    model: "Ranger Wildtrak",
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Meteor Grey",
    avgDailyKm: 44,
    daysInService: 875,
    // Demonstrates the stale-odometer affordance out of the box — every other
    // unit reads within the last few days.
    readingAgeDays: 21,
    status: "active",
    assignedTo: "Marisol Bautista",
    department: "Field Operations",
    location: "Quezon City Hub",
    profile: "due_soon",
  },
  {
    plateNumber: "NCT 9034",
    make: "Toyota",
    model: "Innova 2.8 E",
    vehicleClass: "van",
    fuelType: "diesel",
    color: "Attitude Black",
    avgDailyKm: 50,
    daysInService: 960,
    readingAgeDays: 0,
    status: "in_service",
    assignedTo: "Joel Ramirez",
    department: "Executive Transport",
    location: "Makati Depot",
    profile: "overdue",
  },
  {
    plateNumber: "ABC 2290",
    make: "Mitsubishi",
    model: "L300 Cab & Chassis",
    vehicleClass: "van",
    fuelType: "diesel",
    color: "White",
    avgDailyKm: 55,
    daysInService: 1035,
    readingAgeDays: 1,
    status: "active",
    assignedTo: "Danilo Cruz",
    department: "Logistics",
    location: "Cavite Yard",
    profile: "due_soon",
  },
  {
    plateNumber: "NEA 7712",
    make: "Toyota",
    model: "Vios 1.3 XLE",
    vehicleClass: "sedan",
    fuelType: "gasoline",
    color: "Platinum Silver",
    avgDailyKm: 29,
    daysInService: 815,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Andrea Salcedo",
    department: "Sales",
    location: "Makati Depot",
    profile: "healthy",
  },
  {
    plateNumber: "DAX 5561",
    make: "Isuzu",
    model: "D-Max LS-A",
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Silky Pearl",
    avgDailyKm: 41,
    daysInService: 955,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Ferdinand Lopez",
    department: "Field Operations",
    location: "Laguna Site",
    profile: "due_soon",
  },
  {
    plateNumber: "NGE 3308",
    make: "Toyota",
    model: "Fortuner 2.8 V",
    vehicleClass: "suv",
    fuelType: "diesel",
    color: "Phantom Brown",
    avgDailyKm: 33,
    daysInService: 920,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Camille Ortega",
    department: "Executive Transport",
    location: "Makati Depot",
    profile: "healthy",
  },
  {
    plateNumber: "CAB 8845",
    make: "Nissan",
    model: "Navara VL 4x4",
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Galaxy Black",
    avgDailyKm: 42,
    daysInService: 1060,
    readingAgeDays: 5,
    status: "down",
    assignedTo: "Unassigned",
    department: "Field Operations",
    location: "Cavite Yard",
    profile: "overdue",
  },
  {
    plateNumber: "NHK 1926",
    make: "Honda",
    model: "City RS",
    vehicleClass: "sedan",
    fuelType: "gasoline",
    color: "Lunar Silver",
    avgDailyKm: 25,
    daysInService: 665,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Patricia Yulo",
    department: "Sales",
    location: "Quezon City Hub",
    profile: "healthy",
  },
  {
    plateNumber: "DBK 4407",
    make: "Toyota",
    model: "Hiace Commuter Deluxe",
    vehicleClass: "van",
    fuelType: "diesel",
    color: "White",
    avgDailyKm: 62,
    daysInService: 925,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Roberto Aquino",
    department: "Logistics",
    location: "Cavite Yard",
    profile: "due_soon",
  },
  {
    plateNumber: "NLM 6653",
    make: "Hyundai",
    model: "Accent 1.4 GL",
    vehicleClass: "sedan",
    fuelType: "gasoline",
    color: "Polar White",
    avgDailyKm: 27,
    daysInService: 1005,
    readingAgeDays: 3,
    status: "active",
    assignedTo: "Gabriel Tan",
    department: "Sales",
    location: "Laguna Site",
    profile: "healthy",
  },
  {
    plateNumber: "CDE 3391",
    make: "Isuzu",
    model: "N-Series NLR 55",
    vehicleClass: "truck",
    fuelType: "diesel",
    color: "White",
    avgDailyKm: 58,
    daysInService: 1185,
    readingAgeDays: 0,
    status: "in_service",
    assignedTo: "Victor Manalo",
    department: "Logistics",
    location: "Cavite Yard",
    profile: "overdue",
  },
  {
    plateNumber: "NPQ 2214",
    make: "Ford",
    model: "Everest Titanium",
    vehicleClass: "suv",
    fuelType: "diesel",
    color: "Absolute Black",
    avgDailyKm: 31,
    daysInService: 630,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Elena Villanueva",
    department: "Executive Transport",
    location: "Makati Depot",
    profile: "healthy",
  },
  {
    plateNumber: "DFG 7758",
    make: "Suzuki",
    model: "APV GLX",
    vehicleClass: "van",
    fuelType: "gasoline",
    color: "Silky Silver",
    avgDailyKm: 36,
    daysInService: 990,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Noel Fajardo",
    department: "Logistics",
    location: "Laguna Site",
    profile: "healthy",
  },
  {
    plateNumber: "NRS 5580",
    make: "Mazda",
    model: "BT-50 4x2",
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Rock Grey",
    avgDailyKm: 39,
    daysInService: 845,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Ivan Mercado",
    department: "Field Operations",
    location: "Laguna Site",
    profile: "healthy",
  },
  {
    plateNumber: "NTU 9903",
    make: "Toyota",
    model: "Corolla Altis Hybrid",
    vehicleClass: "sedan",
    fuelType: "hybrid",
    color: "Celestite Grey",
    avgDailyKm: 23,
    daysInService: 585,
    readingAgeDays: 0,
    status: "active",
    assignedTo: "Sofia Reyes",
    department: "Executive Transport",
    location: "Makati Depot",
    profile: "healthy",
  },
];

const TECHNICIANS = [
  "Arnel Pascual",
  "Jomar Dizon",
  "Kristine Abad",
  "Lito Sarmiento",
  "Michelle Garcia",
  "Renato Ilagan",
];

const VENDORS = [
  "Toyota Shaw Service Center",
  "Rapide Auto Care — Ortigas",
  "In-house Fleet Bay 2",
  "Ford Global City Service",
  "Isuzu Alabang Service",
  "Bridgestone Tire Center",
];

const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";

function makeVin(random: () => number) {
  return Array.from(
    { length: 17 },
    () => VIN_CHARS[Math.floor(random() * VIN_CHARS.length)]
  ).join("");
}

interface CatalogueEntry {
  partNumber: string;
  name: string;
  unitCost: number;
  quantity?: number;
}

/**
 * Parts consumed by each preventive task, read from the same catalogue the
 * demand forecast uses (`lib/parts.ts`) — one definition of "what does this
 * job need" for both itemising history and projecting the future.
 */
function catalogueEntriesForTask(taskId: string): CatalogueEntry[] {
  return SERVICE_ITEM_PARTS.filter((link) => link.serviceTaskId === taskId).map((link) => {
    const part = PART_BY_ID.get(link.partId);
    if (!part) throw new Error(`Unknown part id in SERVICE_ITEM_PARTS: ${link.partId}`);
    return {
      partNumber: part.sku,
      name: part.name,
      unitCost: part.unitCost,
      quantity: link.quantityPerService,
    };
  });
}

/** Parts drawn on for unplanned repairs, where the job isn't in the catalogue. */
const GENERIC_PARTS: CatalogueEntry[] = [
  { partNumber: "ASM-CMP-88", name: "A/C compressor assembly", unitCost: 14_500 },
  { partNumber: "STR-MTR-21", name: "Starter motor (reconditioned)", unitCost: 6_800 },
  { partNumber: "SUS-BSH-09", name: "Suspension bushing set", unitCost: 2_400 },
  { partNumber: "CLT-KIT-33", name: "Clutch kit", unitCost: 11_900 },
  { partNumber: "LMP-TL-07", name: "Tail light assembly", unitCost: 3_150 },
  { partNumber: "RAD-HSE-14", name: "Upper radiator hose", unitCost: 980 },
  { partNumber: "WIN-REG-52", name: "Power window regulator", unitCost: 3_650 },
  { partNumber: "SEA-KIT-11", name: "Gasket and seal kit", unitCost: 1_450 },
];

function buildParts(
  entries: CatalogueEntry[],
  random: () => number,
  prefix: string
): PartLine[] {
  return entries.map((entry, index) => ({
    id: `${prefix}-p${index + 1}`,
    partNumber: entry.partNumber,
    name: entry.name,
    quantity: entry.quantity ?? 1,
    // Small price drift so identical parts don't read as copy-paste across jobs.
    unitCost: Math.round((entry.unitCost * (0.92 + random() * 0.16)) / 5) * 5,
  }));
}

function partsTotal(parts: PartLine[]) {
  return parts.reduce((total, part) => total + part.quantity * part.unitCost, 0);
}

function pickSome<T>(pool: T[], count: number, random: () => number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < count && remaining.length; i++) {
    picked.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
  }
  return picked;
}

const PREVENTIVE_FINDINGS = [
  "All parameters within specification. No abnormal wear observed.",
  "Slight seepage noted at the housing; cleaned and monitored. No action required this interval.",
  "Component wear consistent with mileage. Replaced and road tested.",
  "Fluid discoloured but within service limits at time of change.",
  "Minor corrosion cleaned from contact surfaces before reassembly.",
];

const CORRECTIVE_FINDINGS = [
  "Fault reproduced on road test. Root cause traced to the failed component; replaced and verified.",
  "Intermittent fault confirmed under load. Wiring harness reseated and component renewed.",
  "Leak isolated to the joint. Sealing surface machined and new gasket fitted.",
  "Excessive play found on inspection, beyond manufacturer tolerance. Assembly replaced.",
  "No fault found on initial test; fault recurred under load and was traced to the mount.",
];

const CORRECTIVE_JOBS: { title: string; priority: Priority }[] = [
  { title: "Aircon compressor not engaging", priority: "high" },
  { title: "Intermittent starter fault", priority: "critical" },
  { title: "Front suspension knocking noise", priority: "medium" },
  { title: "Clutch slipping under load", priority: "high" },
  { title: "Rear tail light assembly replacement", priority: "low" },
  { title: "Windshield chip repair", priority: "low" },
  { title: "Radiator hose seepage", priority: "high" },
  { title: "Power window regulator failure", priority: "medium" },
];

/* -------------------------------------------------------------- vehicles */

interface BuiltVehicle {
  vehicle: Vehicle;
  spec: VehicleSpec;
  acquiredOn: Date;
  /** Every service the vehicle has had, oldest first. */
  history: ServiceEvent[];
}

interface ServiceEvent {
  taskId: string;
  odometer: number;
  on: Date;
}

/**
 * Walks a vehicle's mileage from delivery to today and records a service each
 * time an interval comes round.
 *
 * Deriving history from the mileage model is what makes it believable: a service
 * can only appear at a distance the vehicle had actually covered by that date,
 * so a 60,000 km transmission service can never land at 11,907 km the way the
 * previous randomly-generated history allowed.
 */
function buildHistory(
  spec: VehicleSpec,
  odometer: number,
  acquiredOn: Date,
  random: () => number
): { history: ServiceEvent[]; taskState: Record<string, TaskState> } {
  const history: ServiceEvent[] = [];
  const taskState: Record<string, TaskState> = {};

  const dayForOdometer = (km: number) =>
    addDays(acquiredOn, Math.round(km / spec.avgDailyKm));

  const spacingFor = (task: (typeof SERVICE_TASKS)[number]) =>
    Math.min(task.intervalKm, task.intervalMonths * 30.44 * spec.avgDailyKm);

  // One or two intervals per non-healthy vehicle get their most recent service
  // withheld; the rest of that vehicle's schedule stays current so the detail
  // page still looks like a real unit rather than a wreck.
  //
  // Only intervals the vehicle has actually reached are eligible. Withholding a
  // service on a 60,000 km item from a unit with 44,000 km on the clock cannot
  // produce a breach — the baseline would clamp to delivery — so flagging those
  // silently does nothing.
  const eligible = SERVICE_TASKS.filter(
    (task) => spacingFor(task) * 1.5 < odometer
  );
  const flaggedCount =
    spec.profile === "healthy" || eligible.length === 0
      ? 0
      : 1 + Math.floor(random() * 2);
  const flagged = new Set<string>();
  while (flagged.size < Math.min(flaggedCount, eligible.length)) {
    flagged.add(eligible[Math.floor(random() * eligible.length)].id);
  }

  for (const task of SERVICE_TASKS) {
    // The interval falls due on whichever limit arrives first, so the effective
    // spacing is the shorter of the two expressed in kilometres.
    const spacing = spacingFor(task);
    const completedCycles = Math.floor(odometer / spacing);

    const isFlagged = flagged.has(task.id);
    // An overdue unit skipped its most recent due service outright; a due-soon
    // one had its last service slightly early. Both are ordinary fleet
    // behaviour, and both keep every recorded service at a distance the vehicle
    // had genuinely covered.
    const cyclesToRecord =
      isFlagged && spec.profile === "overdue"
        ? completedCycles - 1
        : completedCycles;

    for (let cycle = 1; cycle <= cyclesToRecord; cycle++) {
      // Vehicles come in when a bay is free, not on the exact kilometre. The
      // spread also keeps services from landing in lockstep across the fleet,
      // which would make the cost trend lurch between empty and enormous months.
      const jitter = Math.round((random() - 0.5) * spacing * 0.22);
      const at = Math.min(
        odometer,
        Math.max(0, Math.round(cycle * spacing + jitter))
      );
      history.push({ taskId: task.id, odometer: at, on: dayForOdometer(at) });
    }

    const lastRecorded = [...history]
      .reverse()
      .find((event) => event.taskId === task.id);

    let lastDoneOdometer = lastRecorded?.odometer ?? 0;

    if (isFlagged && spec.profile === "due_soon" && lastRecorded) {
      // Nudge the most recent service earlier so the interval sits just inside
      // the warning band rather than wherever the cycle happened to land.
      const target = Math.max(
        0,
        Math.round(odometer - spacing * (0.9 + random() * 0.08))
      );
      lastRecorded.odometer = target;
      lastRecorded.on = dayForOdometer(target);
      lastDoneOdometer = target;
    }

    taskState[task.id] = {
      lastDoneOdometer,
      lastDoneOn: iso(
        lastDoneOdometer > 0 ? dayForOdometer(lastDoneOdometer) : acquiredOn
      ),
    };
  }

  history.sort((a, b) => a.odometer - b.odometer);
  return { history, taskState };
}

function buildVehicles(today: Date): BuiltVehicle[] {
  return VEHICLE_SPECS.map((spec, index) => {
    const random = mulberry32(1000 + index * 37);

    const acquiredOn = subDays(today, spec.daysInService);
    // Derived, not stated — see the note on VehicleSpec.
    const odometer = Math.round(spec.avgDailyKm * spec.daysInService);
    const odometerReadAt = subDays(today, spec.readingAgeDays);
    // The reading is what was on the clock when it was taken.
    const readingOdometer = Math.round(
      odometer - spec.readingAgeDays * spec.avgDailyKm
    );

    const { history, taskState } = buildHistory(
      spec,
      readingOdometer,
      acquiredOn,
      random
    );

    // Mostly comfortably valid; two indices are pinned so the compliance
    // badge/dashboard tile have something real to show without hoping
    // random draws land inside the window — same reasoning as the
    // stale-odometer and safety-critical-decline seed tweaks.
    const driverLicenceExpiry =
      index === 5
        ? iso(subDays(today, 8)) // expired
        : index === 7
          ? iso(addDays(today, 18)) // inside the 30-day badge window
          : iso(addDays(today, 200 + Math.floor(random() * 500)));

    const vehicle: Vehicle = {
      id: `veh-${String(index + 1).padStart(3, "0")}`,
      plateNumber: spec.plateNumber,
      make: spec.make,
      model: spec.model,
      year: acquiredOn.getFullYear(),
      vin: makeVin(random),
      vehicleClass: spec.vehicleClass,
      fuelType: spec.fuelType,
      color: spec.color,
      driverLicenceExpiry,
      odometer: readingOdometer,
      odometerReadAt: iso(odometerReadAt),
      avgDailyKm: spec.avgDailyKm,
      status: spec.status,
      assignedTo: spec.assignedTo,
      department: spec.department,
      location: spec.location,
      acquiredOn: iso(acquiredOn),
      registrationExpiry: iso(addDays(today, Math.floor(random() * 330) - 30)),
      insuranceExpiry: iso(addDays(today, Math.floor(random() * 300) + 20)),
      taskState,
    };

    return { vehicle, spec, acquiredOn, history };
  });
}

/* ----------------------------------------------------------- work orders */

const TASK_BY_ID = new Map(SERVICE_TASKS.map((task) => [task.id, task]));

const FLEET_MANAGER_NAME = "Mike Manabat";
const OPS_SUPERVISOR_NAME = "Marisol Bautista";

function buildWorkOrders(built: BuiltVehicle[], today: Date): WorkOrder[] {
  const orders: WorkOrder[] = [];
  const random = mulberry32(90210);
  let counter = 1;
  let historySeq = 1;
  let logSeq = 1;

  const evt = (status: WorkOrderStatus, at: Date, actor: string): WorkOrderEvent => ({
    id: `hist-${historySeq++}`,
    status,
    at: at.toISOString(),
    actor,
  });

  const log = (
    lineId: string,
    action: ApprovalLogEntry["action"],
    at: Date,
    actorName: string,
    amount: number,
    note: string | null = null
  ): ApprovalLogEntry => ({
    id: `alog-${logSeq++}`,
    lineId,
    action,
    actorId: actorName,
    actorName,
    at: at.toISOString(),
    note,
    amountAtTime: amount,
  });

  /** Who would plausibly have approved this, given the band it falls in. */
  const approverFor = (band: ReturnType<typeof requiredApprover>) =>
    band === "fleet_manager" ? FLEET_MANAGER_NAME : OPS_SUPERVISOR_NAME;

  const push = (draft: Omit<WorkOrder, "id" | "reference">) => {
    orders.push({
      ...draft,
      id: `wo-${String(counter).padStart(4, "0")}`,
      reference: `WO-${today.getFullYear()}-${String(counter).padStart(4, "0")}`,
    });
    counter += 1;
  };

  /**
   * A closed historical job: already fully approved (nothing else could have
   * gone ahead), auto-approved on the spot if it was cheap enough, otherwise
   * signed off by whoever the amount routes to. The full lifecycle — approval,
   * scheduling, the bay, close-out — is spread across the job's own window so
   * a real timeline shows up on every record, not just the newest ones.
   */
  function closedLine(params: {
    description: string;
    category: WorkOrderLine["category"];
    partCost: number;
    labourCost: number;
    urgency: LineUrgency;
    partsSource: PartsSource;
    openedOn: Date;
  }): { line: WorkOrderLine; approvedAt: Date; approverName: string; logEntry: ApprovalLogEntry } {
    const total = params.partCost + params.labourCost;
    const band = requiredApprover(total, DEFAULT_APPROVAL_SETTINGS);
    const auto = band === "auto";
    const approverName = auto ? "System (auto-approval)" : approverFor(band);
    // A human sits on it briefly; the system doesn't.
    const approvedAt = auto ? params.openedOn : addDays(params.openedOn, 0);

    const lineId = `line-${counter}-${historySeq}`;
    const line: WorkOrderLine = {
      id: lineId,
      description: params.description,
      category: params.category,
      partCost: params.partCost,
      labourCost: params.labourCost,
      urgency: params.urgency,
      partsSource: params.partsSource,
      approvalStatus: "approved",
      approvedBy: approverName,
      approvedAt: approvedAt.toISOString(),
      declineReason: null,
      photoUrls: [],
    };

    return {
      line,
      approvedAt,
      approverName,
      logEntry: log(
        lineId,
        auto ? "auto_approved" : "approved",
        approvedAt,
        approverName,
        total
      ),
    };
  }

  function closedHistory(params: {
    openedOn: Date;
    completedOn: Date;
    approvedAt: Date;
    auto: boolean;
    approverName: string;
    technician: string;
  }): WorkOrderEvent[] {
    const { openedOn, completedOn, approvedAt, auto, approverName, technician } = params;
    const span = Math.max(completedOn.getTime() - openedOn.getTime(), 0);
    const at = (fraction: number) => new Date(openedOn.getTime() + span * fraction);

    const events: WorkOrderEvent[] = [];
    if (!auto) events.push(evt("pending_approval", openedOn, technician));
    events.push(evt("approved", approvedAt, approverName));
    events.push(evt("scheduled", at(0.35), technician));
    events.push(evt("in_progress", at(0.7), technician));
    events.push(evt("closed", completedOn, technician));
    return events;
  }

  const historyWindowStart = subDays(today, 365);

  // Closed preventive work comes straight from the service history, so the
  // work-order ledger and the vehicles' PMS baselines describe the same events.
  for (const { vehicle, history } of built) {
    for (const event of history) {
      if (event.on < historyWindowStart) continue;
      const task = TASK_BY_ID.get(event.taskId);
      if (!task) continue;

      const parts = buildParts(
        catalogueEntriesForTask(task.id),
        random,
        `h${counter}`
      );
      const laborCost =
        Math.round(
          (task.estimatedHours * LABOR_RATE_PER_HOUR * (0.85 + random() * 0.4)) / 50
        ) * 50;
      const technician = TECHNICIANS[Math.floor(random() * TECHNICIANS.length)];
      const openedOnDate = subDays(event.on, 1 + Math.floor(random() * 3));
      const partsCost = partsTotal(parts);

      const { line, approvedAt, approverName, logEntry } = closedLine({
        description: task.name,
        category: task.category,
        partCost: partsCost,
        labourCost: laborCost,
        urgency: task.critical ? "safety_critical" : "recommended",
        partsSource: random() < 0.65 ? "supplier_provided" : "own_stock",
        openedOn: openedOnDate,
      });

      push({
        vehicleId: vehicle.id,
        title: task.name,
        type: task.id === "safety-inspection" ? "inspection" : "preventive",
        status: "closed",
        priority: task.critical ? "high" : "medium",
        openedOn: iso(openedOnDate),
        scheduledFor: iso(event.on),
        completedOn: iso(event.on),
        odometerAtService: event.odometer,
        technician,
        vendor: VENDORS[Math.floor(random() * VENDORS.length)],
        laborCost,
        partsCost,
        parts,
        findings:
          PREVENTIVE_FINDINGS[Math.floor(random() * PREVENTIVE_FINDINGS.length)],
        taskIds: [task.id],
        notes: "Completed per PMS schedule. Next interval logged.",
        lines: [line],
        approvalLog: [logEntry],
        pendingApprovalEnteredAt: null,
        approvalWaitHours: line.approvedBy === "System (auto-approval)" ? null : 0.5,
        history: closedHistory({
          openedOn: openedOnDate,
          completedOn: event.on,
          approvedAt,
          auto: approverName === "System (auto-approval)",
          approverName,
          technician,
        }),
      });
    }
  }

  // Unplanned repairs, roughly one per vehicle per year.
  for (const { vehicle, spec } of built) {
    const count = spec.profile === "healthy" ? 1 : 1 + Math.floor(random() * 2);
    for (let i = 0; i < count; i++) {
      const daysAgo = 20 + Math.floor(random() * 330);
      const completedOn = subDays(today, daysAgo);
      const job = CORRECTIVE_JOBS[Math.floor(random() * CORRECTIVE_JOBS.length)];
      const parts = buildParts(
        pickSome(GENERIC_PARTS, 1 + Math.floor(random() * 2), random),
        random,
        `c${counter}`
      );
      const laborCost = Math.round((900 + random() * 4_200) / 50) * 50;
      const technician = TECHNICIANS[Math.floor(random() * TECHNICIANS.length)];
      const openedOnDate = subDays(completedOn, 1 + Math.floor(random() * 4));
      const partsCost = partsTotal(parts);

      const { line, approvedAt, approverName, logEntry } = closedLine({
        description: job.title,
        category: "other",
        partCost: partsCost,
        labourCost: laborCost,
        urgency:
          job.priority === "critical"
            ? "safety_critical"
            : job.priority === "low"
              ? "optional"
              : "recommended",
        partsSource: "supplier_provided",
        openedOn: openedOnDate,
      });

      push({
        vehicleId: vehicle.id,
        title: job.title,
        type: "corrective",
        status: "closed",
        priority: job.priority,
        openedOn: iso(openedOnDate),
        scheduledFor: iso(completedOn),
        completedOn: iso(completedOn),
        odometerAtService: Math.max(
          0,
          Math.round(vehicle.odometer - daysAgo * spec.avgDailyKm)
        ),
        technician,
        vendor: VENDORS[Math.floor(random() * VENDORS.length)],
        laborCost,
        partsCost,
        parts,
        findings:
          CORRECTIVE_FINDINGS[Math.floor(random() * CORRECTIVE_FINDINGS.length)],
        taskIds: [],
        notes: "Diagnosed and repaired. Road tested before release.",
        lines: [line],
        approvalLog: [logEntry],
        pendingApprovalEnteredAt: null,
        approvalWaitHours: line.approvedBy === "System (auto-approval)" ? null : 0.5,
        history: closedHistory({
          openedOn: openedOnDate,
          completedOn,
          approvedAt,
          auto: approverName === "System (auto-approval)",
          approverName,
          technician,
        }),
      });
    }
  }

  // The live board: work still moving through the approval and bay pipeline.
  // Derived from what is genuinely due right now, so the jobs correspond to
  // real breaches rather than an arbitrary hand-written list. The eight slots
  // are deliberately spread across every stage of the new lifecycle, so the
  // Requests queue, the SLA-breach alert, and the vehicle-detail
  // safety-critical-decline banner all have something real to show.
  const pending = built
    .flatMap(({ vehicle }) => {
      const health = evaluateVehicle(vehicle, today);
      return health.items
        .filter((item) => item.status !== "ok")
        .map((item) => ({ vehicle, item }));
    })
    .sort((a, b) => a.item.daysRemaining - b.item.daysRemaining)
    .slice(0, 8);

  const LIVE_BOARD_PLAN: {
    status: WorkOrderStatus;
    /** Multiplier on the task's own estimate, so the amount lands in the band this row demonstrates. */
    costMultiplier: number;
    urgency: LineUrgency;
    slaBreached?: boolean;
    declineReason?: string;
    extraLine?: boolean;
  }[] = [
    // Stuck well past the SLA, and big enough to need the Fleet Manager —
    // exactly the case the escalation alert exists for.
    { status: "pending_approval", costMultiplier: 6, urgency: "safety_critical", slaBreached: true },
    // Freshly raised, still comfortably inside the SLA window.
    { status: "pending_approval", costMultiplier: 2.2, urgency: "recommended" },
    // Purchasing said no — and it was safety-critical, so it feeds the
    // vehicle-detail liability banner.
    {
      status: "declined",
      costMultiplier: 1.6,
      urgency: "safety_critical",
      declineReason: "Vendor quote well above catalogue rate; requested a second quote before authorising.",
    },
    // A genuine mix: one line approved, one declined.
    { status: "partially_approved", costMultiplier: 1.8, urgency: "recommended", extraLine: true },
    { status: "approved", costMultiplier: 1.3, urgency: "recommended" },
    { status: "approved", costMultiplier: 0.6, urgency: "optional" },
    { status: "scheduled", costMultiplier: 1, urgency: "recommended" },
    { status: "in_progress", costMultiplier: 1, urgency: "safety_critical" },
  ];

  pending.forEach(({ vehicle, item }, index) => {
    const plan = LIVE_BOARD_PLAN[index] ?? LIVE_BOARD_PLAN[LIVE_BOARD_PLAN.length - 1];
    const technician = TECHNICIANS[Math.floor(random() * TECHNICIANS.length)];
    const openedOnDate = subDays(today, 1 + Math.floor(random() * 5));

    const partCost = Math.round(item.task.estimatedCost * plan.costMultiplier);
    const labourCost = Math.round(
      item.task.estimatedHours * LABOR_RATE_PER_HOUR * plan.costMultiplier
    );
    const lineId = `line-${counter}-a`;
    const total = partCost + labourCost;
    const band = requiredApprover(total, DEFAULT_APPROVAL_SETTINGS);

    const lines: WorkOrderLine[] = [];
    const approvalLog: ApprovalLogEntry[] = [];
    let pendingApprovalEnteredAt: string | null = null;
    let approvalWaitHours: number | null = null;

    if (plan.status === "pending_approval") {
      const enteredAt = plan.slaBreached
        ? new Date(today.getTime() - 3 * 24 * 3_600_000) // several business days back — always breaches
        : new Date(today.getTime() - 60 * 60_000); // one hour ago — comfortably inside the default 4h SLA
      pendingApprovalEnteredAt = enteredAt.toISOString();
      lines.push({
        id: lineId,
        description: item.task.name,
        category: item.task.category,
        partCost,
        labourCost,
        urgency: plan.urgency,
        partsSource: DEFAULT_APPROVAL_SETTINGS.defaultPartsSource,
        approvalStatus: "pending",
        approvedBy: null,
        approvedAt: null,
        declineReason: null,
        photoUrls: [],
      });
    } else if (plan.status === "declined") {
      lines.push({
        id: lineId,
        description: item.task.name,
        category: item.task.category,
        partCost,
        labourCost,
        urgency: plan.urgency,
        partsSource: DEFAULT_APPROVAL_SETTINGS.defaultPartsSource,
        approvalStatus: "declined",
        approvedBy: approverFor(band),
        approvedAt: today.toISOString(),
        declineReason: plan.declineReason ?? "Declined.",
        photoUrls: [],
      });
      approvalLog.push(
        log(lineId, "declined", today, approverFor(band), total, plan.declineReason ?? null)
      );
      approvalWaitHours = 3.5;
    } else {
      // approved / partially_approved / scheduled / in_progress all start
      // from at least one approved line.
      const approver = band === "auto" ? "System (auto-approval)" : approverFor(band);
      lines.push({
        id: lineId,
        description: item.task.name,
        category: item.task.category,
        partCost,
        labourCost,
        urgency: plan.urgency,
        partsSource: DEFAULT_APPROVAL_SETTINGS.defaultPartsSource,
        approvalStatus: "approved",
        approvedBy: approver,
        approvedAt: openedOnDate.toISOString(),
        declineReason: null,
        photoUrls: [],
      });
      approvalLog.push(
        log(
          lineId,
          band === "auto" ? "auto_approved" : "approved",
          openedOnDate,
          approver,
          total
        )
      );
      approvalWaitHours = band === "auto" ? null : 2;

      if (plan.extraLine) {
        const extraId = `line-${counter}-b`;
        const extraApprover = OPS_SUPERVISOR_NAME;
        lines.push({
          id: extraId,
          description: "Supplementary inspection line",
          category: "other",
          partCost: 800,
          labourCost: 400,
          urgency: "optional",
          partsSource: "own_stock",
          approvalStatus: "declined",
          approvedBy: extraApprover,
          approvedAt: openedOnDate.toISOString(),
          declineReason: "Not required this visit — defer to next scheduled service.",
          photoUrls: [],
        });
        approvalLog.push(
          log(
            extraId,
            "declined",
            openedOnDate,
            extraApprover,
            1_200,
            "Not required this visit — defer to next scheduled service."
          )
        );
      }
    }

    // The decided-on-the-spot (auto) case never visibly sits in
    // pending_approval, matching the store's real runtime behaviour; every
    // other case starts there before resolving to whatever this row
    // demonstrates.
    const resolvedAt = new Date(openedOnDate.getTime() + 2 * 3_600_000);
    const history: WorkOrderEvent[] = [];

    if (plan.status === "pending_approval") {
      history.push(evt("pending_approval", parseISOOrDate(pendingApprovalEnteredAt), technician));
    } else if (plan.status === "declined") {
      history.push(evt("pending_approval", openedOnDate, technician));
      history.push(evt("declined", resolvedAt, approverFor(band)));
    } else if (plan.status === "partially_approved") {
      history.push(evt("pending_approval", openedOnDate, technician));
      history.push(evt("partially_approved", resolvedAt, OPS_SUPERVISOR_NAME));
    } else {
      // approved / scheduled / in_progress.
      const approver = band === "auto" ? "System (auto-approval)" : approverFor(band);
      if (band !== "auto") history.push(evt("pending_approval", openedOnDate, technician));
      history.push(evt("approved", resolvedAt, approver));
      if (plan.status === "scheduled" || plan.status === "in_progress") {
        history.push(evt("scheduled", addDays(openedOnDate, 1), technician));
      }
      if (plan.status === "in_progress") {
        history.push(evt("in_progress", today, technician));
      }
    }

    const linesLabourTotal = lines.reduce((total, line) => total + line.labourCost, 0);
    const linesPartTotal = lines.reduce((total, line) => total + line.partCost, 0);

    push({
      vehicleId: vehicle.id,
      title: item.task.name,
      type: item.task.id === "safety-inspection" ? "inspection" : "preventive",
      status: plan.status,
      priority: item.status === "overdue" ? "critical" : "high",
      openedOn: iso(openedOnDate),
      scheduledFor: iso(addDays(today, Math.floor(index / 2))),
      completedOn: null,
      odometerAtService: vehicle.odometer,
      technician,
      vendor: VENDORS[Math.floor(random() * VENDORS.length)],
      laborCost: linesLabourTotal,
      partsCost: linesPartTotal,
      // Open work carries an estimate, not a record: parts and findings are
      // filled in at completion.
      parts: [],
      findings: "",
      taskIds: [item.task.id],
      lines,
      approvalLog,
      pendingApprovalEnteredAt,
      approvalWaitHours,
      history,
      notes:
        plan.status === "in_progress"
          ? "Vehicle on the lift. Parts drawn from stock."
          : plan.status === "pending_approval"
            ? "Awaiting purchasing approval."
            : "Awaiting bay slot confirmation.",
    });
  });

  return orders.sort((a, b) =>
    (b.completedOn ?? b.scheduledFor).localeCompare(a.completedOn ?? a.scheduledFor)
  );
}

function parseISOOrDate(value: string | null): Date {
  return value ? new Date(value) : new Date();
}

/* ------------------------------------------------------------- documents */

/**
 * The document library. Seeded records are metadata only — `dataUrl` is null,
 * standing for a file already held elsewhere — so the demo can show a populated
 * repository without shipping megabytes of base64 into localStorage.
 */
function buildDocuments(
  vehicles: Vehicle[],
  orders: WorkOrder[],
  today: Date
): FleetDocument[] {
  const random = mulberry32(4242);
  const documents: FleetDocument[] = [];
  let counter = 1;

  const push = (
    draft: Omit<FleetDocument, "id" | "uploadedOn"> & { uploadedOn: string }
  ) => {
    documents.push({ ...draft, id: `doc-${String(counter).padStart(4, "0")}` });
    counter += 1;
  };

  const INSURERS = ["Malayan Insurance", "Standard Insurance", "Charter Ping An", "Prudential Guarantee"];

  // Statutory paperwork: every vehicle carries the PH compliance set, and
  // every one of these expires — which is what makes them alertable. Two
  // indices are pinned to a guaranteed-expired and a guaranteed-inside-the-
  // dashboard-window date, same reasoning as the driver-licence pins above.
  vehicles.forEach((vehicle, index) => {
    const ltoOffice = `LTO ${vehicle.location.replace(/ (Hub|Depot|Yard|Site)$/, "")}`;
    const insurer = INSURERS[Math.floor(random() * INSURERS.length)];

    push({
      name: `OR-CR ${vehicle.plateNumber}.pdf`,
      kind: "lto_registration",
      vehicleId: vehicle.id,
      workOrderId: null,
      uploadedBy: "Marisol Bautista",
      uploadedOn: iso(subDays(today, 120 + Math.floor(random() * 200))),
      sizeBytes: 180_000 + Math.floor(random() * 420_000),
      mimeType: "application/pdf",
      dataUrl: null,
      expiresOn: vehicle.registrationExpiry,
      referenceNumber: `OR-${1_000_000 + Math.floor(random() * 8_999_999)}`,
      issuedOn: iso(subDays(parseISO(vehicle.registrationExpiry), 365)),
      issuingBody: ltoOffice,
      notes: "LTO certificate of registration and official receipt.",
    });

    const ctplExpiry =
      index === 0 ? iso(subDays(today, 12)) : iso(addDays(today, Math.floor(random() * 300) + 20));

    push({
      name: `CTPL policy ${vehicle.plateNumber}.pdf`,
      kind: "ctpl",
      vehicleId: vehicle.id,
      workOrderId: null,
      uploadedBy: "Marisol Bautista",
      uploadedOn: iso(subDays(today, 90 + Math.floor(random() * 240))),
      sizeBytes: 150_000 + Math.floor(random() * 300_000),
      mimeType: "application/pdf",
      dataUrl: null,
      expiresOn: ctplExpiry,
      referenceNumber: `CTPL-${100_000 + Math.floor(random() * 899_999)}`,
      issuedOn: iso(subDays(parseISO(ctplExpiry), 365)),
      issuingBody: insurer,
      notes: "Compulsory third-party liability cover.",
    });

    push({
      name: `Insurance policy ${vehicle.plateNumber}.pdf`,
      kind: "comprehensive_insurance",
      vehicleId: vehicle.id,
      workOrderId: null,
      uploadedBy: "Marisol Bautista",
      uploadedOn: iso(subDays(today, 90 + Math.floor(random() * 240))),
      sizeBytes: 240_000 + Math.floor(random() * 500_000),
      mimeType: "application/pdf",
      dataUrl: null,
      expiresOn: vehicle.insuranceExpiry,
      referenceNumber: `POL-${200_000 + Math.floor(random() * 799_999)}`,
      issuedOn: iso(subDays(parseISO(vehicle.insuranceExpiry), 365)),
      issuingBody: insurer,
      notes: "Comprehensive motor policy including third-party liability.",
    });

    const emissionExpiry =
      index === 2 ? iso(addDays(today, 25)) : iso(addDays(today, Math.floor(random() * 365) - 60));

    push({
      name: `Emission test ${vehicle.plateNumber}.pdf`,
      kind: "emission_test",
      vehicleId: vehicle.id,
      workOrderId: null,
      uploadedBy: "Marisol Bautista",
      uploadedOn: iso(subDays(parseISO(emissionExpiry), 365)),
      sizeBytes: 80_000 + Math.floor(random() * 150_000),
      mimeType: "application/pdf",
      dataUrl: null,
      expiresOn: emissionExpiry,
      referenceNumber: `EMS-${10_000 + Math.floor(random() * 89_999)}`,
      issuedOn: iso(subDays(parseISO(emissionExpiry), 365)),
      issuingBody: "LTO-Accredited Private Emission Testing Center",
      notes: "Vehicle emission test result certificate.",
    });
  });

  const completed = orders.filter((order) => order.status === "closed");
  for (const order of completed) {
    if (random() > 0.4) continue;
    const vehicle = vehicles.find((v) => v.id === order.vehicleId);
    const uploadedOn = order.completedOn ?? iso(today);

    push({
      name: `Invoice ${order.reference}.pdf`,
      kind: "invoice",
      vehicleId: order.vehicleId,
      workOrderId: order.id,
      uploadedBy: "Marisol Bautista",
      uploadedOn,
      sizeBytes: 80_000 + Math.floor(random() * 220_000),
      mimeType: "application/pdf",
      dataUrl: null,
      expiresOn: null,
      referenceNumber: null,
      issuedOn: null,
      issuingBody: null,
      notes: `${order.vendor} — ${vehicle?.plateNumber ?? ""}`.trim(),
    });

    if (random() > 0.6) {
      push({
        name: `Service report ${order.reference}.pdf`,
        kind: "service_report",
        vehicleId: order.vehicleId,
        workOrderId: order.id,
        uploadedBy: order.technician,
        uploadedOn,
        sizeBytes: 120_000 + Math.floor(random() * 300_000),
        mimeType: "application/pdf",
        dataUrl: null,
        expiresOn: null,
        referenceNumber: null,
        issuedOn: null,
        issuingBody: null,
        notes: "Technician findings, parts fitted, and road-test result.",
      });
    }
  }

  return documents.sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn));
}

/* ------------------------------------------------------------------ parts */

/**
 * Stock levels for the demand-forecast catalogue. Roughly a third start
 * below their reorder point — deliberately, so the forecast has real
 * shortfalls to show rather than a table full of zeros.
 */
function buildPartsInventory(): Part[] {
  const random = mulberry32(7777);
  return PART_DEFINITIONS.map((def, index) => {
    const stockFactor = index % 3 === 0 ? 0.3 + random() * 0.5 : 1 + random() * 1.5;
    return {
      id: def.id,
      sku: def.sku,
      name: def.name,
      category: def.category,
      unit: def.unit,
      unitCost: def.unitCost,
      currentStock: Math.max(0, Math.round(def.reorderPoint * stockFactor)),
      reorderPoint: def.reorderPoint,
      preferredVendor: def.preferredVendor,
      leadTimeDays: def.leadTimeDays,
    };
  });
}

/** A couple of seeded purchase orders so `/purchase-orders` isn't empty before anyone runs the forecast. */
function buildPurchaseOrders(vehicles: Vehicle[], today: Date): PurchaseOrder[] {
  const timingBelt = PART_BY_ID.get("p-timing-belt")!;
  const tensioner = PART_BY_ID.get("p-timing-tensioner")!;
  const brakePads = PART_BY_ID.get("p-brake-pads")!;
  const sentVehicle = vehicles[0];
  const draftVehicle = vehicles[1] ?? sentVehicle;

  const sent: PurchaseOrder = {
    id: "po-seed-0001",
    reference: `PO-${today.getFullYear()}-0001`,
    vendor: timingBelt.preferredVendor,
    status: "sent",
    createdOn: iso(subDays(today, 5)),
    createdBy: "Mike Manabat",
    notes: "",
    lines: [
      {
        id: "poline-seed-1",
        partId: timingBelt.id,
        description: timingBelt.name,
        quantity: 2,
        unitCost: timingBelt.unitCost,
        serviceTaskIds: ["timing-belt"],
        vehicleIds: [sentVehicle.id],
      },
      {
        id: "poline-seed-2",
        partId: tensioner.id,
        description: tensioner.name,
        quantity: 2,
        unitCost: tensioner.unitCost,
        serviceTaskIds: ["timing-belt"],
        vehicleIds: [sentVehicle.id],
      },
    ],
  };

  const draft: PurchaseOrder = {
    id: "po-seed-0002",
    reference: `PO-${today.getFullYear()}-0002`,
    vendor: brakePads.preferredVendor,
    status: "draft",
    createdOn: iso(today),
    createdBy: "Grace Villanueva",
    notes: "",
    lines: [
      {
        id: "poline-seed-3",
        partId: brakePads.id,
        description: brakePads.name,
        quantity: 4,
        unitCost: brakePads.unitCost,
        serviceTaskIds: ["brake-inspection"],
        vehicleIds: [draftVehicle.id],
      },
    ],
  };

  return [draft, sent];
}

export function createSeedState(today = new Date()): FleetState {
  const built = buildVehicles(today);
  const vehicles = built.map((entry) => entry.vehicle);
  const workOrders = buildWorkOrders(built, today);

  return {
    vehicles,
    workOrders,
    documents: buildDocuments(vehicles, workOrders, today),
    alerts: { readIds: [], dismissedIds: [] },
    approvalSettings: DEFAULT_APPROVAL_SETTINGS,
    parts: buildPartsInventory(),
    purchaseOrders: buildPurchaseOrders(vehicles, today),
    tenant: DEFAULT_TENANT_SETTINGS,
  };
}
