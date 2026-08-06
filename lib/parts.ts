import type { Part, TaskCategory } from "@/types";

/**
 * The parts catalogue and its link to the PMS schedule. This is the same
 * parts data `lib/seed.ts` has always used to itemise closed work orders —
 * promoted here, with the extra attributes a demand forecast needs
 * (`sku`/`category`/`reorderPoint`/`preferredVendor`/`leadTimeDays`), so
 * "what did this job use" and "what will the next N weeks need" read from one
 * definition instead of two that can drift apart.
 *
 * `currentStock` is deliberately absent — that's the one field that actually
 * changes after seeding (consumed by jobs, replenished by receiving a
 * purchase order), so it lives on the stateful `Part` record in
 * `FleetState.parts`, not here.
 */
export interface PartDefinition {
  id: string;
  sku: string;
  name: string;
  category: TaskCategory | "other";
  unit: string;
  unitCost: number;
  reorderPoint: number;
  preferredVendor: string;
  leadTimeDays: number;
}

export const PART_VENDORS = [
  "AutoParts Central Manila",
  "Federal Parts Distribution",
  "OEM Direct Supply PH",
  "Bridgestone Tire Center",
];

export const PART_DEFINITIONS: PartDefinition[] = [
  // oil-filter
  { id: "p-oil-filter", sku: "90915-YZZD4", name: "Engine oil filter", category: "engine", unit: "piece", unitCost: 380, reorderPoint: 8, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 5 },
  { id: "p-engine-oil", sku: "HX7-5W30-1L", name: "Fully synthetic 5W-30 engine oil (litre)", category: "engine", unit: "litre", unitCost: 520, reorderPoint: 40, preferredVendor: "Federal Parts Distribution", leadTimeDays: 5 },
  { id: "p-drain-gasket", sku: "90430-12031", name: "Drain plug gasket", category: "engine", unit: "piece", unitCost: 65, reorderPoint: 10, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 3 },
  // tire-rotation
  { id: "p-wheel-weights", sku: "SVC-BAL-W", name: "Wheel balance weights (set)", category: "tires", unit: "set", unitCost: 220, reorderPoint: 6, preferredVendor: "Bridgestone Tire Center", leadTimeDays: 4 },
  { id: "p-valve-stem", sku: "TVS-STD", name: "Tyre valve stem", category: "tires", unit: "piece", unitCost: 85, reorderPoint: 20, preferredVendor: "Bridgestone Tire Center", leadTimeDays: 3 },
  // brake-inspection
  { id: "p-brake-pads", sku: "04465-0K340", name: "Front brake pad set", category: "brakes", unit: "set", unitCost: 2_450, reorderPoint: 4, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 7 },
  { id: "p-caliper-grease", sku: "CER-GRS-40", name: "Ceramic caliper grease", category: "brakes", unit: "piece", unitCost: 180, reorderPoint: 6, preferredVendor: "AutoParts Central Manila", leadTimeDays: 3 },
  // air-filter
  { id: "p-air-filter", sku: "17801-0L040", name: "Engine air filter element", category: "engine", unit: "piece", unitCost: 890, reorderPoint: 6, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 5 },
  // cabin-filter
  { id: "p-cabin-filter", sku: "87139-0N010", name: "Cabin air filter", category: "body", unit: "piece", unitCost: 720, reorderPoint: 6, preferredVendor: "AutoParts Central Manila", leadTimeDays: 5 },
  // battery-check
  { id: "p-terminal-cleaner", sku: "TRM-CLN-01", name: "Battery terminal cleaner", category: "electrical", unit: "piece", unitCost: 140, reorderPoint: 5, preferredVendor: "Federal Parts Distribution", leadTimeDays: 4 },
  { id: "p-terminal-protector", sku: "TRM-PRT-02", name: "Terminal protector spray", category: "electrical", unit: "piece", unitCost: 195, reorderPoint: 5, preferredVendor: "Federal Parts Distribution", leadTimeDays: 4 },
  // wheel-alignment
  { id: "p-alignment-service", sku: "SVC-ALG-4W", name: "Four-wheel alignment service", category: "tires", unit: "service", unitCost: 1_800, reorderPoint: 3, preferredVendor: "Bridgestone Tire Center", leadTimeDays: 2 },
  { id: "p-camber-bolt", sku: "CAM-BLT-A", name: "Camber adjustment bolt", category: "tires", unit: "piece", unitCost: 340, reorderPoint: 6, preferredVendor: "Bridgestone Tire Center", leadTimeDays: 5 },
  // brake-fluid
  { id: "p-brake-fluid", sku: "DOT4-1L", name: "DOT 4 brake fluid (litre)", category: "brakes", unit: "litre", unitCost: 640, reorderPoint: 10, preferredVendor: "AutoParts Central Manila", leadTimeDays: 4 },
  { id: "p-bleeder-kit", sku: "BLD-NPL-K", name: "Bleeder nipple kit", category: "brakes", unit: "piece", unitCost: 210, reorderPoint: 4, preferredVendor: "AutoParts Central Manila", leadTimeDays: 4 },
  // transmission-fluid
  { id: "p-atf", sku: "08886-02305", name: "ATF WS transmission fluid (litre)", category: "drivetrain", unit: "litre", unitCost: 980, reorderPoint: 15, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 10 },
  { id: "p-transmission-gasket", sku: "35168-0K010", name: "Transmission pan gasket", category: "drivetrain", unit: "piece", unitCost: 1_150, reorderPoint: 3, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 10 },
  { id: "p-transmission-filter", sku: "35330-0K030", name: "Transmission filter", category: "drivetrain", unit: "piece", unitCost: 1_480, reorderPoint: 3, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 10 },
  // coolant-flush
  { id: "p-coolant", sku: "08889-80015", name: "Super long-life coolant (litre)", category: "engine", unit: "litre", unitCost: 540, reorderPoint: 18, preferredVendor: "Federal Parts Distribution", leadTimeDays: 7 },
  { id: "p-thermostat", sku: "90916-03100", name: "Thermostat assembly", category: "engine", unit: "piece", unitCost: 1_620, reorderPoint: 3, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 7 },
  // timing-belt
  { id: "p-timing-belt", sku: "13568-39016", name: "Timing belt", category: "engine", unit: "piece", unitCost: 4_200, reorderPoint: 2, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 14 },
  { id: "p-timing-tensioner", sku: "13503-67010", name: "Timing belt tensioner", category: "engine", unit: "piece", unitCost: 3_850, reorderPoint: 2, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 14 },
  { id: "p-water-pump", sku: "16100-39466", name: "Water pump", category: "engine", unit: "piece", unitCost: 4_100, reorderPoint: 2, preferredVendor: "OEM Direct Supply PH", leadTimeDays: 14 },
  // safety-inspection
  { id: "p-rwi-fee", sku: "SVC-RWI-01", name: "Roadworthiness inspection fee", category: "safety", unit: "service", unitCost: 1_200, reorderPoint: 3, preferredVendor: "Federal Parts Distribution", leadTimeDays: 2 },
  { id: "p-wiper-blade", sku: "WPR-BLD-22", name: "Wiper blade (pair)", category: "safety", unit: "pair", unitCost: 620, reorderPoint: 6, preferredVendor: "AutoParts Central Manila", leadTimeDays: 3 },
];

export interface ServiceItemPart {
  serviceTaskId: string;
  partId: string;
  quantityPerService: number;
}

/** Which parts a service task consumes, and how many. Drives the demand forecast. */
export const SERVICE_ITEM_PARTS: ServiceItemPart[] = [
  { serviceTaskId: "oil-filter", partId: "p-oil-filter", quantityPerService: 1 },
  { serviceTaskId: "oil-filter", partId: "p-engine-oil", quantityPerService: 5 },
  { serviceTaskId: "oil-filter", partId: "p-drain-gasket", quantityPerService: 1 },

  { serviceTaskId: "tire-rotation", partId: "p-wheel-weights", quantityPerService: 1 },
  { serviceTaskId: "tire-rotation", partId: "p-valve-stem", quantityPerService: 4 },

  { serviceTaskId: "brake-inspection", partId: "p-brake-pads", quantityPerService: 1 },
  { serviceTaskId: "brake-inspection", partId: "p-caliper-grease", quantityPerService: 1 },

  { serviceTaskId: "air-filter", partId: "p-air-filter", quantityPerService: 1 },

  { serviceTaskId: "cabin-filter", partId: "p-cabin-filter", quantityPerService: 1 },

  { serviceTaskId: "battery-check", partId: "p-terminal-cleaner", quantityPerService: 1 },
  { serviceTaskId: "battery-check", partId: "p-terminal-protector", quantityPerService: 1 },

  { serviceTaskId: "wheel-alignment", partId: "p-alignment-service", quantityPerService: 1 },
  { serviceTaskId: "wheel-alignment", partId: "p-camber-bolt", quantityPerService: 2 },

  { serviceTaskId: "brake-fluid", partId: "p-brake-fluid", quantityPerService: 2 },
  { serviceTaskId: "brake-fluid", partId: "p-bleeder-kit", quantityPerService: 1 },

  { serviceTaskId: "transmission-fluid", partId: "p-atf", quantityPerService: 5 },
  { serviceTaskId: "transmission-fluid", partId: "p-transmission-gasket", quantityPerService: 1 },
  { serviceTaskId: "transmission-fluid", partId: "p-transmission-filter", quantityPerService: 1 },

  { serviceTaskId: "coolant-flush", partId: "p-coolant", quantityPerService: 6 },
  { serviceTaskId: "coolant-flush", partId: "p-thermostat", quantityPerService: 1 },

  { serviceTaskId: "timing-belt", partId: "p-timing-belt", quantityPerService: 1 },
  { serviceTaskId: "timing-belt", partId: "p-timing-tensioner", quantityPerService: 1 },
  { serviceTaskId: "timing-belt", partId: "p-water-pump", quantityPerService: 1 },

  { serviceTaskId: "safety-inspection", partId: "p-rwi-fee", quantityPerService: 1 },
  { serviceTaskId: "safety-inspection", partId: "p-wiper-blade", quantityPerService: 1 },
];

export const PART_BY_ID = new Map(PART_DEFINITIONS.map((part) => [part.id, part]));
