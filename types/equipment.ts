/**
 * Equipment monitoring (Phase 10), as the screens use it. Every figure under
 * `report` is derived by the API when the tool is read: runtime, ratios, due
 * dates and scores are never worked out here. Money is in pesos (display only).
 */

export interface Option {
  value: string;
  label: string;
}

export interface EquipmentOptions {
  categories: Option[];
  statuses: Option[];
  conditions: Option[];
  meterTypes: Option[];
  maintenanceKinds: Option[];
  /** Starting values a category suggests, in the API's field names. */
  categoryPresets: Record<string, Record<string, string | number>>;
}

export interface ServiceTrigger {
  key: "hours" | "cycles" | "days";
  unit: string;
  used: number;
  interval: number;
  ratio: number;
  remaining: number;
}

export interface EquipmentReport {
  lifetime: { hours: number; cycles: number; jobs: number };
  /** Null = no service interval set: the tool is not tracked. */
  service: {
    level: "ok" | "due_soon" | "overdue";
    levelLabel: string;
    progress: number;
    binding: ServiceTrigger["key"];
    triggers: ServiceTrigger[];
    hoursSince: number;
    cyclesSince: number;
    daysSince: number;
  } | null;
  forecast: { days: number; dueOn: string | null; ratePerDay: number | null } | null;
  life: { life: number; used: number; remaining: number; ratio: number; level: string; levelLabel: string } | null;
  reliability: {
    services: number;
    repairs: number;
    downtimeHours: number;
    maintenanceCost: number;
    totalCost: number;
    mtbfHours: number | null;
    availabilityPct: number;
    costPerHour: number | null;
    lastServicedAt: string | null;
  };
  utilization: { windowDays: number; hours: number; jobs: number; capacityHours: number; pct: number };
  health: { score: number; band: "good" | "fair" | "poor" | "critical" };
}

export interface Equipment {
  id: string;
  branchId: string;
  name: string;
  category: string;
  categoryLabel: string;
  brand: string;
  model: string;
  serialNumber: string;
  bay: { id: string; name: string } | null;
  status: string;
  statusLabel: string;
  conditionRating: string;
  conditionLabel: string;
  purchaseDate: string | null;
  purchaseCost: number;
  warrantyUntil: string | null;
  expectedLifeHours: string | null;
  meterType: string;
  baselineHours: string;
  baselineCycles: number;
  serviceIntervalHours: string | null;
  serviceIntervalCycles: number | null;
  serviceIntervalDays: number | null;
  lastServiceAt: string | null;
  maintenanceTask: string;
  notes: string;
  isActive: boolean;
  report: EquipmentReport;
  usageLogs: { id: string; hours: string; cycles: number; usedAt: string; note: string; loggedByName: string }[];
  maintenanceLogs: {
    id: string;
    kind: string;
    kindLabel: string;
    performedAt: string;
    performedBy: string;
    cost: number;
    downtimeHours: string;
    parts: string;
    notes: string;
    meterHours: string | null;
    meterCycles: number | null;
    resetsService: boolean;
    recordedByName: string;
  }[];
}

export interface EquipmentSummary {
  total: number;
  active: number;
  overdue: number;
  dueSoon: number;
  down: number;
  replaceWatch: number;
  untracked: number;
  assetValue: number;
  maintenanceSpend: number;
  avgHealth: number | null;
}

export interface EquipmentBoard {
  branchId: string;
  summary: EquipmentSummary;
  tools: Equipment[];
}

export interface PackageProfileLine {
  id: string;
  packageId: string;
  packageName: string;
  equipmentId: string;
  equipmentName: string;
  hoursPerJob: string;
}
