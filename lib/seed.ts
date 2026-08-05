import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  formatISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import type {
  FleetDocument,
  FleetState,
  PartLine,
  Priority,
  TaskState,
  Vehicle,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderType,
} from "@/types";
import { SERVICE_TASKS } from "@/lib/service-tasks";

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

/** How far through its intervals a vehicle should sit when the demo loads. */
type WearProfile = "overdue" | "due_soon" | "healthy";

interface VehicleSpec {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleClass: Vehicle["vehicleClass"];
  fuelType: Vehicle["fuelType"];
  color: string;
  odometer: number;
  avgDailyKm: number;
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
    year: 2022,
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Super White",
    odometer: 84_320,
    avgDailyKm: 96,
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
    year: 2023,
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Meteor Grey",
    odometer: 51_940,
    avgDailyKm: 78,
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
    year: 2021,
    vehicleClass: "van",
    fuelType: "diesel",
    color: "Attitude Black",
    odometer: 112_780,
    avgDailyKm: 118,
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
    year: 2020,
    vehicleClass: "van",
    fuelType: "diesel",
    color: "White",
    odometer: 148_610,
    avgDailyKm: 132,
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
    year: 2023,
    vehicleClass: "sedan",
    fuelType: "gasoline",
    color: "Platinum Silver",
    odometer: 32_450,
    avgDailyKm: 54,
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
    year: 2022,
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Silky Pearl",
    odometer: 69_880,
    avgDailyKm: 88,
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
    year: 2023,
    vehicleClass: "suv",
    fuelType: "diesel",
    color: "Phantom Brown",
    odometer: 44_120,
    avgDailyKm: 72,
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
    year: 2021,
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Galaxy Black",
    odometer: 97_530,
    avgDailyKm: 104,
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
    year: 2024,
    vehicleClass: "sedan",
    fuelType: "gasoline",
    color: "Lunar Silver",
    odometer: 18_240,
    avgDailyKm: 46,
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
    year: 2022,
    vehicleClass: "van",
    fuelType: "diesel",
    color: "White",
    odometer: 126_990,
    avgDailyKm: 145,
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
    year: 2021,
    vehicleClass: "sedan",
    fuelType: "gasoline",
    color: "Polar White",
    odometer: 61_370,
    avgDailyKm: 58,
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
    year: 2020,
    vehicleClass: "truck",
    fuelType: "diesel",
    color: "White",
    odometer: 187_450,
    avgDailyKm: 156,
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
    year: 2024,
    vehicleClass: "suv",
    fuelType: "diesel",
    color: "Absolute Black",
    odometer: 21_680,
    avgDailyKm: 62,
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
    year: 2021,
    vehicleClass: "van",
    fuelType: "gasoline",
    color: "Silky Silver",
    odometer: 78_910,
    avgDailyKm: 84,
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
    year: 2022,
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "Rock Grey",
    odometer: 58_240,
    avgDailyKm: 76,
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
    year: 2024,
    vehicleClass: "sedan",
    fuelType: "hybrid",
    color: "Celestite Grey",
    odometer: 14_760,
    avgDailyKm: 42,
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

/**
 * Places each task somewhere inside (or past) its interval according to the
 * vehicle's wear profile, and back-dates the matching service record.
 */
function buildTaskState(
  spec: VehicleSpec,
  random: () => number,
  today: Date
): Record<string, TaskState> {
  const taskState: Record<string, TaskState> = {};

  // One or two intervals per "overdue" vehicle are pushed past 1.0; the rest of
  // that vehicle's schedule stays healthy so the detail page still looks real.
  const breachCount = spec.profile === "overdue" ? 1 + Math.floor(random() * 2) : 0;
  const warnCount = spec.profile === "due_soon" ? 1 + Math.floor(random() * 2) : 0;
  const breachIndexes = new Set<number>();
  while (breachIndexes.size < breachCount + warnCount) {
    breachIndexes.add(Math.floor(random() * SERVICE_TASKS.length));
  }
  const flagged = [...breachIndexes];
  const breached = new Set(flagged.slice(0, breachCount));
  const warned = new Set(flagged.slice(breachCount));

  SERVICE_TASKS.forEach((task, index) => {
    let progress: number;
    if (breached.has(index)) progress = 1.05 + random() * 0.45;
    else if (warned.has(index)) progress = 0.9 + random() * 0.08;
    else progress = 0.12 + random() * 0.6;

    const kmProgress = progress;
    // Time rarely tracks distance exactly — nudge them apart so the "governed
    // by" column has something to say.
    const timeProgress = progress * (0.82 + random() * 0.34);

    const lastDoneOdometer = Math.max(
      0,
      Math.round(spec.odometer - kmProgress * task.intervalKm)
    );
    const elapsedDays = Math.round(timeProgress * task.intervalMonths * 30.44);

    taskState[task.id] = {
      lastDoneOdometer,
      lastDoneOn: iso(subDays(today, elapsedDays)),
    };
  });

  return taskState;
}

function buildVehicles(today: Date): Vehicle[] {
  return VEHICLE_SPECS.map((spec, index) => {
    const random = mulberry32(1000 + index * 37);
    const ageYears = today.getFullYear() - spec.year;

    return {
      id: `veh-${String(index + 1).padStart(3, "0")}`,
      plateNumber: spec.plateNumber,
      make: spec.make,
      model: spec.model,
      year: spec.year,
      vin: makeVin(random),
      vehicleClass: spec.vehicleClass,
      fuelType: spec.fuelType,
      color: spec.color,
      odometer: spec.odometer,
      avgDailyKm: spec.avgDailyKm,
      status: spec.status,
      assignedTo: spec.assignedTo,
      department: spec.department,
      location: spec.location,
      acquiredOn: iso(subDays(today, ageYears * 365 + Math.floor(random() * 200))),
      registrationExpiry: iso(addDays(today, Math.floor(random() * 330) - 30)),
      insuranceExpiry: iso(addDays(today, Math.floor(random() * 300) + 20)),
      taskState: buildTaskState(spec, random, today),
    } satisfies Vehicle;
  });
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

function buildWorkOrders(vehicles: Vehicle[], today: Date): WorkOrder[] {
  const orders: WorkOrder[] = [];
  const random = mulberry32(90210);
  let counter = 1;

  const push = (order: Omit<WorkOrder, "id" | "reference">) => {
    const id = `wo-${String(counter).padStart(4, "0")}`;
    orders.push({
      ...order,
      id,
      reference: `WO-${today.getFullYear()}-${String(counter).padStart(4, "0")}`,
    });
    counter += 1;
  };

  // Twelve months of completed history — this is what the cost trend reads from.
  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
    // Dates are drawn inside the calendar month itself rather than by 30-day
    // arithmetic, which would otherwise push most of "this month" back into the
    // previous bucket and leave the current month reading zero.
    const monthStart = startOfMonth(subMonths(today, monthsAgo));
    const monthEnd = monthsAgo === 0 ? today : endOfMonth(monthStart);
    const spanDays = differenceInCalendarDays(monthEnd, monthStart);

    let perMonth = 3 + Math.floor(random() * 4);
    if (monthsAgo === 0) {
      // The current month is only partly elapsed; scale the volume to match.
      const elapsed = (spanDays + 1) / differenceInCalendarDays(
        endOfMonth(monthStart),
        monthStart
      );
      perMonth = Math.max(1, Math.round(perMonth * elapsed));
    }

    for (let n = 0; n < perMonth; n++) {
      const vehicle = vehicles[Math.floor(random() * vehicles.length)];
      const completedOn = addDays(
        monthStart,
        Math.floor(random() * (spanDays + 1))
      );
      const daysAgo = Math.max(0, differenceInCalendarDays(today, completedOn));
      const isCorrective = random() < 0.32;
      const task = SERVICE_TASKS[Math.floor(random() * SERVICE_TASKS.length)];
      const job = CORRECTIVE_JOBS[Math.floor(random() * CORRECTIVE_JOBS.length)];

      const catalogue = isCorrective
        ? pickSome(GENERIC_PARTS, 1 + Math.floor(random() * 3), random)
        : (PART_CATALOGUE[task.id] ?? []);
      const parts = buildParts(catalogue, random, `h${counter}`);
      const partsCost = partsTotal(parts);

      const laborCost = isCorrective
        ? Math.round((800 + random() * 4_500) / 50) * 50
        : Math.round((task.estimatedHours * 650 * (0.85 + random() * 0.4)) / 50) * 50;

      push({
        vehicleId: vehicle.id,
        title: isCorrective ? job.title : task.name,
        type: isCorrective ? "corrective" : "preventive",
        status: "completed",
        priority: isCorrective ? job.priority : "medium",
        openedOn: iso(subDays(completedOn, 1 + Math.floor(random() * 4))),
        scheduledFor: iso(completedOn),
        completedOn: iso(completedOn),
        odometerAtService: Math.max(
          0,
          Math.round(vehicle.odometer - daysAgo * vehicle.avgDailyKm)
        ),
        technician: TECHNICIANS[Math.floor(random() * TECHNICIANS.length)],
        vendor: VENDORS[Math.floor(random() * VENDORS.length)],
        laborCost,
        partsCost,
        parts,
        findings: isCorrective
          ? CORRECTIVE_FINDINGS[Math.floor(random() * CORRECTIVE_FINDINGS.length)]
          : PREVENTIVE_FINDINGS[Math.floor(random() * PREVENTIVE_FINDINGS.length)],
        taskIds: isCorrective ? [] : [task.id],
        notes: isCorrective
          ? "Diagnosed and repaired. Road tested before release."
          : "Completed per PMS schedule. Next interval logged.",
      });
    }
  }

  // Live board: whatever is currently open, scheduled, or on a lift.
  const active: {
    vehicleIndex: number;
    status: WorkOrderStatus;
    type: WorkOrderType;
    priority: Priority;
    title: string;
    dayOffset: number;
    taskIds: string[];
  }[] = [
    {
      vehicleIndex: 2,
      status: "in_progress",
      type: "preventive",
      priority: "high",
      title: "Engine oil & filter change",
      dayOffset: 0,
      taskIds: ["oil-filter"],
    },
    {
      vehicleIndex: 11,
      status: "in_progress",
      type: "corrective",
      priority: "critical",
      title: "Rear brake caliper seized",
      dayOffset: 0,
      taskIds: [],
    },
    {
      vehicleIndex: 7,
      status: "open",
      type: "corrective",
      priority: "critical",
      title: "Transmission overheating under load",
      dayOffset: 1,
      taskIds: [],
    },
    {
      vehicleIndex: 0,
      status: "scheduled",
      type: "preventive",
      priority: "high",
      title: "Brake pad & rotor inspection",
      dayOffset: 2,
      taskIds: ["brake-inspection"],
    },
    {
      vehicleIndex: 3,
      status: "scheduled",
      type: "preventive",
      priority: "medium",
      title: "Engine oil & filter change",
      dayOffset: 4,
      taskIds: ["oil-filter"],
    },
    {
      vehicleIndex: 9,
      status: "scheduled",
      type: "preventive",
      priority: "medium",
      title: "Tire rotation & pressure check",
      dayOffset: 6,
      taskIds: ["tire-rotation"],
    },
    {
      vehicleIndex: 5,
      status: "open",
      type: "inspection",
      priority: "medium",
      title: "Annual roadworthiness inspection",
      dayOffset: 9,
      taskIds: ["safety-inspection"],
    },
    {
      vehicleIndex: 1,
      status: "scheduled",
      type: "preventive",
      priority: "low",
      title: "Cabin filter replacement",
      dayOffset: 12,
      taskIds: ["cabin-filter"],
    },
  ];

  for (const entry of active) {
    const vehicle = vehicles[entry.vehicleIndex];
    const scheduledFor = addDays(today, entry.dayOffset);
    const estimate = entry.taskIds
      .map((id) => SERVICE_TASKS.find((task) => task.id === id))
      .filter(Boolean);
    const partsCost = estimate.length
      ? Math.round(estimate.reduce((t, task) => t + (task?.estimatedCost ?? 0), 0))
      : Math.round((2_000 + random() * 14_000) / 50) * 50;
    const laborCost = estimate.length
      ? Math.round(estimate.reduce((t, task) => t + (task?.estimatedHours ?? 0), 0) * 650)
      : Math.round((1_200 + random() * 5_000) / 50) * 50;

    push({
      vehicleId: vehicle.id,
      title: entry.title,
      type: entry.type,
      status: entry.status,
      priority: entry.priority,
      openedOn: iso(subDays(today, 1 + Math.floor(random() * 5))),
      scheduledFor: iso(scheduledFor),
      completedOn: null,
      odometerAtService: vehicle.odometer,
      technician: TECHNICIANS[Math.floor(random() * TECHNICIANS.length)],
      vendor: VENDORS[Math.floor(random() * VENDORS.length)],
      laborCost,
      partsCost,
      // Open work carries an estimate, not a record: parts and findings are
      // filled in at completion.
      parts: [],
      findings: "",
      taskIds: entry.taskIds,
      notes:
        entry.status === "in_progress"
          ? "Vehicle on the lift. Parts drawn from stock."
          : "Awaiting bay slot confirmation.",
    });
  }

  return orders.sort(
    (a, b) => parseDate(b.scheduledFor) - parseDate(a.scheduledFor)
  );
}

function parseDate(value: string) {
  return new Date(value).getTime();
}

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

  // Invoices and reports against roughly half the closed jobs.
  const completed = orders.filter((order) => order.status === "completed");
  for (const order of completed) {
    if (random() > 0.55) continue;
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

    if (random() > 0.5) {
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
  const vehicles = buildVehicles(today);
  const workOrders = buildWorkOrders(vehicles, today);

  return {
    vehicles,
    workOrders,
    documents: buildDocuments(vehicles, workOrders, today),
    alerts: { readIds: [], dismissedIds: [] },
  };
}
