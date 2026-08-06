import { addDays, formatISO, subDays } from "date-fns";
import type {
  FleetDocument,
  FleetState,
  PartLine,
  Priority,
  TaskState,
  Vehicle,
  WorkOrder,
  WorkOrderEvent,
} from "@/types";
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { evaluateVehicle } from "@/lib/pms";

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
 * Parts consumed by each preventive task. Itemising these is what turns a work
 * order into a service record you can audit — "₱3,200 of parts" tells a fleet
 * manager nothing about what was actually fitted.
 */
const PART_CATALOGUE: Record<string, CatalogueEntry[]> = {
  "oil-filter": [
    { partNumber: "90915-YZZD4", name: "Engine oil filter", unitCost: 380 },
    {
      partNumber: "HX7-5W30-1L",
      name: "Fully synthetic 5W-30 engine oil (litre)",
      unitCost: 520,
      quantity: 5,
    },
    { partNumber: "90430-12031", name: "Drain plug gasket", unitCost: 65 },
  ],
  "tire-rotation": [
    { partNumber: "SVC-BAL-W", name: "Wheel balance weights (set)", unitCost: 220 },
    { partNumber: "TVS-STD", name: "Tyre valve stem", unitCost: 85, quantity: 4 },
  ],
  "brake-inspection": [
    { partNumber: "04465-0K340", name: "Front brake pad set", unitCost: 2_450 },
    { partNumber: "CER-GRS-40", name: "Ceramic caliper grease", unitCost: 180 },
  ],
  "air-filter": [
    { partNumber: "17801-0L040", name: "Engine air filter element", unitCost: 890 },
  ],
  "cabin-filter": [
    { partNumber: "87139-0N010", name: "Cabin air filter", unitCost: 720 },
  ],
  "battery-check": [
    { partNumber: "TRM-CLN-01", name: "Battery terminal cleaner", unitCost: 140 },
    { partNumber: "TRM-PRT-02", name: "Terminal protector spray", unitCost: 195 },
  ],
  "wheel-alignment": [
    { partNumber: "SVC-ALG-4W", name: "Four-wheel alignment service", unitCost: 1_800 },
    { partNumber: "CAM-BLT-A", name: "Camber adjustment bolt", unitCost: 340, quantity: 2 },
  ],
  "brake-fluid": [
    { partNumber: "DOT4-1L", name: "DOT 4 brake fluid (litre)", unitCost: 640, quantity: 2 },
    { partNumber: "BLD-NPL-K", name: "Bleeder nipple kit", unitCost: 210 },
  ],
  "transmission-fluid": [
    { partNumber: "08886-02305", name: "ATF WS transmission fluid (litre)", unitCost: 980, quantity: 5 },
    { partNumber: "35168-0K010", name: "Transmission pan gasket", unitCost: 1_150 },
    { partNumber: "35330-0K030", name: "Transmission filter", unitCost: 1_480 },
  ],
  "coolant-flush": [
    { partNumber: "08889-80015", name: "Super long-life coolant (litre)", unitCost: 540, quantity: 6 },
    { partNumber: "90916-03100", name: "Thermostat assembly", unitCost: 1_620 },
  ],
  "timing-belt": [
    { partNumber: "13568-39016", name: "Timing belt", unitCost: 4_200 },
    { partNumber: "13503-67010", name: "Timing belt tensioner", unitCost: 3_850 },
    { partNumber: "16100-39466", name: "Water pump", unitCost: 4_100 },
  ],
  "safety-inspection": [
    { partNumber: "SVC-RWI-01", name: "Roadworthiness inspection fee", unitCost: 1_200 },
    { partNumber: "WPR-BLD-22", name: "Wiper blade (pair)", unitCost: 620 },
  ],
};

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

function buildWorkOrders(built: BuiltVehicle[], today: Date): WorkOrder[] {
  const orders: WorkOrder[] = [];
  const random = mulberry32(90210);
  let counter = 1;
  let historySeq = 1;

  /**
   * Synthesizes a plausible status history from data the order already
   * carries — every job starts `open`, then optionally moves through
   * `in_progress` before landing on its current status.
   */
  const buildHistory = (
    openedOn: Date,
    status: WorkOrder["status"],
    actor: string,
    endsOn?: Date
  ): WorkOrderEvent[] => {
    const events: WorkOrderEvent[] = [
      { id: `hist-${historySeq++}`, status: "open", at: openedOn.toISOString(), actor },
    ];
    if (status !== "open") {
      events.push({
        id: `hist-${historySeq++}`,
        status,
        at: (endsOn ?? openedOn).toISOString(),
        actor,
      });
    }
    return events;
  };

  const push = (draft: Omit<WorkOrder, "id" | "reference">) => {
    orders.push({
      ...draft,
      id: `wo-${String(counter).padStart(4, "0")}`,
      reference: `WO-${today.getFullYear()}-${String(counter).padStart(4, "0")}`,
    });
    counter += 1;
  };

  const historyWindowStart = subDays(today, 365);

  // Closed preventive work comes straight from the service history, so the
  // work-order ledger and the vehicles' PMS baselines describe the same events.
  for (const { vehicle, history } of built) {
    for (const event of history) {
      if (event.on < historyWindowStart) continue;
      const task = TASK_BY_ID.get(event.taskId);
      if (!task) continue;

      const parts = buildParts(
        PART_CATALOGUE[task.id] ?? [],
        random,
        `h${counter}`
      );
      const laborCost =
        Math.round(
          (task.estimatedHours * LABOR_RATE_PER_HOUR * (0.85 + random() * 0.4)) / 50
        ) * 50;
      const technician = TECHNICIANS[Math.floor(random() * TECHNICIANS.length)];
      const openedOnDate = subDays(event.on, 1 + Math.floor(random() * 3));

      push({
        vehicleId: vehicle.id,
        title: task.name,
        type: task.id === "safety-inspection" ? "inspection" : "preventive",
        status: "completed",
        priority: task.critical ? "high" : "medium",
        openedOn: iso(openedOnDate),
        scheduledFor: iso(event.on),
        completedOn: iso(event.on),
        odometerAtService: event.odometer,
        technician,
        vendor: VENDORS[Math.floor(random() * VENDORS.length)],
        laborCost,
        partsCost: partsTotal(parts),
        parts,
        findings:
          PREVENTIVE_FINDINGS[Math.floor(random() * PREVENTIVE_FINDINGS.length)],
        taskIds: [task.id],
        notes: "Completed per PMS schedule. Next interval logged.",
        history: buildHistory(openedOnDate, "completed", technician, event.on),
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

      push({
        vehicleId: vehicle.id,
        title: job.title,
        type: "corrective",
        status: "completed",
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
        partsCost: partsTotal(parts),
        parts,
        findings:
          CORRECTIVE_FINDINGS[Math.floor(random() * CORRECTIVE_FINDINGS.length)],
        taskIds: [],
        notes: "Diagnosed and repaired. Road tested before release.",
        history: buildHistory(openedOnDate, "completed", technician, completedOn),
      });
    }
  }

  // The live board. Derived from what is genuinely due right now, so the open
  // jobs correspond to real breaches rather than an arbitrary hand-written list.
  const pending = built
    .flatMap(({ vehicle }) => {
      const health = evaluateVehicle(vehicle, today);
      return health.items
        .filter((item) => item.status !== "ok")
        .map((item) => ({ vehicle, item }));
    })
    .sort((a, b) => a.item.daysRemaining - b.item.daysRemaining)
    .slice(0, 8);

  pending.forEach(({ vehicle, item }, index) => {
    const status =
      index < 2 ? "in_progress" : index < 4 ? ("open" as const) : ("scheduled" as const);
    const technician = TECHNICIANS[Math.floor(random() * TECHNICIANS.length)];
    const openedOnDate = subDays(today, 1 + Math.floor(random() * 5));

    push({
      vehicleId: vehicle.id,
      title: item.task.name,
      type: item.task.id === "safety-inspection" ? "inspection" : "preventive",
      status,
      priority: item.status === "overdue" ? "critical" : "high",
      openedOn: iso(openedOnDate),
      scheduledFor: iso(addDays(today, Math.floor(index / 2))),
      completedOn: null,
      odometerAtService: vehicle.odometer,
      technician,
      vendor: VENDORS[Math.floor(random() * VENDORS.length)],
      laborCost: Math.round(item.task.estimatedHours * LABOR_RATE_PER_HOUR),
      partsCost: item.task.estimatedCost,
      // Open work carries an estimate, not a record: parts and findings are
      // filled in at completion.
      parts: [],
      findings: "",
      taskIds: [item.task.id],
      history: buildHistory(
        openedOnDate,
        status,
        technician,
        status === "in_progress" ? today : undefined
      ),
      notes:
        status === "in_progress"
          ? "Vehicle on the lift. Parts drawn from stock."
          : "Awaiting bay slot confirmation.",
    });
  });

  return orders.sort((a, b) =>
    (b.completedOn ?? b.scheduledFor).localeCompare(a.completedOn ?? a.scheduledFor)
  );
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

  // Statutory paperwork: every vehicle carries a registration and a policy, and
  // both expire — which is what makes them alertable.
  for (const vehicle of vehicles) {
    push({
      name: `OR-CR ${vehicle.plateNumber}.pdf`,
      kind: "registration",
      vehicleId: vehicle.id,
      workOrderId: null,
      uploadedBy: "Marisol Bautista",
      uploadedOn: iso(subDays(today, 120 + Math.floor(random() * 200))),
      sizeBytes: 180_000 + Math.floor(random() * 420_000),
      mimeType: "application/pdf",
      dataUrl: null,
      expiresOn: vehicle.registrationExpiry,
      notes: "LTO certificate of registration and official receipt.",
    });

    push({
      name: `Insurance policy ${vehicle.plateNumber}.pdf`,
      kind: "insurance",
      vehicleId: vehicle.id,
      workOrderId: null,
      uploadedBy: "Marisol Bautista",
      uploadedOn: iso(subDays(today, 90 + Math.floor(random() * 240))),
      sizeBytes: 240_000 + Math.floor(random() * 500_000),
      mimeType: "application/pdf",
      dataUrl: null,
      expiresOn: vehicle.insuranceExpiry,
      notes: "Comprehensive motor policy including third-party liability.",
    });
  }

  const completed = orders.filter((order) => order.status === "completed");
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
        notes: "Technician findings, parts fitted, and road-test result.",
      });
    }
  }

  return documents.sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn));
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
  };
}
