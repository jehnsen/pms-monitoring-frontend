import type { Bay } from "@/types";

/**
 * The provider's service bays.
 *
 * Static, like `SERVICE_TASKS` — a bay is a property of the building, and
 * nothing in the application creates or retires one. Capacity is the working
 * hours a bay can absorb in a day and is the denominator for every utilisation
 * figure on the shop side; 9 hours against an 08:00–18:00 day leaves an hour
 * for turnaround between jobs, which is what a bay actually achieves.
 */
export const BAYS: Bay[] = [
  { id: "bay-1", name: "Bay 1", focus: "General service", capacityHoursPerDay: 9 },
  { id: "bay-2", name: "Bay 2", focus: "General service", capacityHoursPerDay: 9 },
  { id: "bay-3", name: "Bay 3", focus: "Heavy & drivetrain", capacityHoursPerDay: 9 },
  { id: "bay-4", name: "Bay 4", focus: "Tyres & alignment", capacityHoursPerDay: 9 },
  { id: "bay-5", name: "Bay 5", focus: "Diagnostics & electrical", capacityHoursPerDay: 9 },
];

export const BAY_BY_ID = new Map(BAYS.map((bay) => [bay.id, bay]));

/** Total working hours the floor can absorb in one day. */
export const TOTAL_BAY_CAPACITY_HOURS = BAYS.reduce(
  (total, bay) => total + bay.capacityHoursPerDay,
  0
);

export function bayName(bayId: string | null | undefined) {
  if (!bayId) return "Out-sourced";
  return BAY_BY_ID.get(bayId)?.name ?? "Unassigned";
}
