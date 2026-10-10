import type { Equipment, EquipmentBoard, EquipmentOptions, EquipmentReport, PackageProfileLine } from "@/types/equipment";

/**
 * The seam between the API's equipment resources and `types/equipment.ts`:
 * snake_case → camelCase, centavos → pesos (display only), defaults for
 * nullable fields. Nothing is worked out here.
 */

/** Every equipment query key starts with this. */
export const EQUIPMENT_ROOT = "equipment";

// The API's payloads are read field by field below; this is their loose shape.
type Raw = Record<string, any>; // eslint-disable-line

const pesos = (cents: number | null | undefined) => (cents ?? 0) / 100;

const toReport = (raw: Raw): EquipmentReport => ({
  lifetime: raw.lifetime ?? { hours: 0, cycles: 0, jobs: 0 },
  service: raw.service
    ? {
        level: raw.service.level,
        levelLabel: raw.service.level_label ?? "",
        progress: raw.service.progress,
        binding: raw.service.binding,
        triggers: (raw.service.triggers ?? []).map((trigger: Raw) => ({
          key: trigger.key,
          unit: trigger.unit,
          used: trigger.used,
          interval: trigger.interval,
          ratio: trigger.ratio,
          remaining: trigger.remaining,
          dueAt: trigger.due_at ?? null,
          dueOn: trigger.due_on ?? null,
        })),
        hoursSince: raw.service.hours_since,
        cyclesSince: raw.service.cycles_since,
        daysSince: raw.service.days_since,
      }
    : null,
  forecast: raw.forecast ? { days: raw.forecast.days, dueOn: raw.forecast.due_on ?? null, ratePerDay: raw.forecast.rate_per_day ?? null } : null,
  life: raw.life
    ? { life: raw.life.life, used: raw.life.used, remaining: raw.life.remaining, ratio: raw.life.ratio, level: raw.life.level, levelLabel: raw.life.level_label ?? "" }
    : null,
  reliability: {
    services: raw.reliability?.services ?? 0,
    repairs: raw.reliability?.repairs ?? 0,
    downtimeHours: raw.reliability?.downtime_hours ?? 0,
    maintenanceCost: pesos(raw.reliability?.maintenance_cost_cents),
    totalCost: pesos(raw.reliability?.total_cost_cents),
    mtbfHours: raw.reliability?.mtbf_hours ?? null,
    availabilityPct: raw.reliability?.availability_pct ?? 100,
    costPerHour: raw.reliability?.cost_per_hour_cents == null ? null : pesos(raw.reliability.cost_per_hour_cents),
    lastServicedAt: raw.reliability?.last_serviced_at ?? null,
  },
  utilization: {
    windowDays: raw.utilization?.window_days ?? 30,
    hours: raw.utilization?.hours ?? 0,
    jobs: raw.utilization?.jobs ?? 0,
    capacityHours: raw.utilization?.capacity_hours ?? 0,
    pct: raw.utilization?.pct ?? 0,
  },
  health: raw.health ?? { score: 0, band: "critical" },
});

export const toEquipment = (raw: Raw): Equipment => ({
  id: raw.id,
  branchId: raw.branch_id,
  name: raw.name,
  category: raw.category,
  categoryLabel: raw.category_label,
  brand: raw.brand ?? "",
  model: raw.model ?? "",
  serialNumber: raw.serial_number ?? "",
  bay: raw.bay ?? null,
  status: raw.status,
  statusLabel: raw.status_label,
  conditionRating: raw.condition_rating,
  conditionLabel: raw.condition_label,
  purchaseDate: raw.purchase_date ?? null,
  purchaseCost: pesos(raw.purchase_cost_cents),
  warrantyUntil: raw.warranty_until ?? null,
  expectedLifeHours: raw.expected_life_hours ?? null,
  meterType: raw.meter_type,
  countUnit: raw.count_unit === "cups" ? "cups" : "cycles",
  baselineHours: raw.baseline_hours ?? "0",
  baselineCycles: raw.baseline_cycles ?? 0,
  serviceIntervalHours: raw.service_interval_hours ?? null,
  serviceIntervalCycles: raw.service_interval_cycles ?? null,
  serviceIntervalDays: raw.service_interval_days ?? null,
  lastServiceAt: raw.last_service_at ?? null,
  maintenanceTask: raw.maintenance_task ?? "",
  notes: raw.notes ?? "",
  isActive: Boolean(raw.is_active),
  report: toReport(raw.report ?? {}),
  usageLogs: (raw.usage_logs ?? []).map((log: Raw) => ({
    id: log.id,
    hours: log.hours,
    cycles: log.cycles,
    usedAt: log.used_at,
    note: log.note ?? "",
    loggedByName: log.logged_by_name,
  })),
  maintenanceLogs: (raw.maintenance_logs ?? []).map((log: Raw) => ({
    id: log.id,
    kind: log.kind,
    kindLabel: log.kind_label,
    performedAt: log.performed_at,
    performedBy: log.performed_by ?? "",
    cost: pesos(log.cost_cents),
    partsCost: pesos(log.parts_cost_cents),
    totalCost: pesos(log.total_cost_cents ?? log.cost_cents),
    issuedParts: (log.issued_parts ?? []).map((part: Raw) => ({
      itemId: part.item_id,
      sku: part.sku,
      name: part.name,
      uom: part.uom,
      quantity: part.quantity,
      value: pesos(part.value_cents),
    })),
    downtimeHours: log.downtime_hours,
    parts: log.parts ?? "",
    notes: log.notes ?? "",
    meterHours: log.meter_hours ?? null,
    meterCycles: log.meter_cycles ?? null,
    resetsService: Boolean(log.resets_service),
    recordedByName: log.recorded_by_name,
  })),
});

export const toBoard = (raw: Raw): EquipmentBoard => ({
  branchId: raw.branch_id,
  summary: {
    total: raw.summary.total,
    active: raw.summary.active,
    overdue: raw.summary.overdue,
    dueSoon: raw.summary.due_soon,
    down: raw.summary.down,
    replaceWatch: raw.summary.replace_watch,
    untracked: raw.summary.untracked,
    assetValue: pesos(raw.summary.asset_value_cents),
    maintenanceSpend: pesos(raw.summary.maintenance_spend_cents),
    avgHealth: raw.summary.avg_health ?? null,
  },
  tools: (raw.tools ?? []).map(toEquipment),
});

export const toOptions = (raw: Raw): EquipmentOptions => ({
  categories: raw.categories ?? [],
  statuses: raw.statuses ?? [],
  conditions: raw.conditions ?? [],
  meterTypes: raw.meter_types ?? [],
  maintenanceKinds: raw.maintenance_kinds ?? [],
  categoryPresets: raw.category_presets ?? {},
});

export const toProfileLine = (raw: Raw): PackageProfileLine => ({
  id: raw.id,
  packageId: raw.package_id,
  packageName: raw.package_name,
  equipmentId: raw.equipment_id,
  equipmentName: raw.equipment_name,
  hoursPerJob: raw.hours_per_job,
});
