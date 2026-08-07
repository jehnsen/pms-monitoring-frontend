import type { Technician } from "@/types";

/**
 * The provider's technicians.
 *
 * Keyed by name rather than an id because `WorkOrder.technician` has always
 * stored the name, and rewriting every seeded and stored order to carry an id
 * would buy nothing — the roster is small and names are unique on one floor.
 */
export const TECHNICIANS: Technician[] = [
  { name: "Arnel Pascual", specialty: "engine", homeBayId: "bay-1" },
  { name: "Jomar Dizon", specialty: "brakes", homeBayId: "bay-2" },
  { name: "Kristine Abad", specialty: "drivetrain", homeBayId: "bay-3" },
  { name: "Lito Sarmiento", specialty: "tires", homeBayId: "bay-4" },
  { name: "Michelle Garcia", specialty: "electrical", homeBayId: "bay-5" },
  { name: "Renato Ilagan", specialty: "general", homeBayId: "bay-1" },
];

export const TECHNICIAN_NAMES = TECHNICIANS.map((tech) => tech.name);

export const TECHNICIAN_BY_NAME = new Map(
  TECHNICIANS.map((tech) => [tech.name, tech])
);
