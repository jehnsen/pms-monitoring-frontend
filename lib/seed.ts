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
  FleetState,
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

      const partsCost = isCorrective
        ? Math.round((1_500 + random() * 18_000) / 50) * 50
        : Math.round((task.estimatedCost * (0.5 + random() * 0.5)) / 50) * 50;
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

export function createSeedState(today = new Date()): FleetState {
  const vehicles = buildVehicles(today);
  return { vehicles, workOrders: buildWorkOrders(vehicles, today) };
}
