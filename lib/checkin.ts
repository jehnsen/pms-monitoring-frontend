import type { FleetClient, Vehicle, VehicleHealth } from "@/types";
import { isOdometerStale, odometerAgeDays } from "@/lib/pms";

/**
 * Counter check-in: turning a plate number into everything the shop already
 * knows about the vehicle in front of it.
 *
 * The rule this module exists to enforce is that the system never asks for
 * data it already holds. A plate is the one thing the advisor can read off the
 * bumper, so it is the only required input; customer, vehicle metadata, and
 * the last odometer reading are all looked up rather than typed.
 *
 * Everything here is pure — the caller supplies the candidate vehicles, which
 * `lib/store.ts` has already narrowed to the caller's tenant scope. That
 * matters: a plate lookup that searched the raw fleet would happily confirm the
 * existence of another client's vehicle, which is the sibling-client leak
 * described in CLAUDE.md.
 */

/**
 * Plates get typed with and without spaces and dashes, and in either case.
 * Matching on a normalised form means "ABC 1234", "abc-1234", and "ABC1234"
 * are one vehicle rather than three near-misses.
 */
export function normalisePlate(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/** VINs are fixed-format and case-insensitive; whitespace is always noise. */
export function normaliseVin(input: string): string {
  return input.replace(/\s/g, "").toUpperCase();
}

export type CheckInMatchKind = "plate" | "vin";

/** A vehicle already on file, with the data the check-in form should hydrate from. */
export interface CheckInHydration {
  outcome: "existing";
  /** Which identifier matched, so the UI can say why it found this vehicle. */
  matchedOn: CheckInMatchKind;
  vehicle: Vehicle;
  /** The owning fleet client — the "customer" half of the check-in. Null if unresolvable. */
  client: FleetClient | null;
  /** Last recorded reading, to pre-fill the odometer field. */
  lastOdometer: number;
  lastOdometerReadAt: string;
  /**
   * How many days old that reading is, and whether it is stale enough that the
   * advisor should re-read the dash rather than accept the pre-filled figure.
   * Pre-filling a months-old reading unchallenged is how a bad odometer gets
   * into the PMS engine and silently shifts every due date.
   */
  odometerAgeDays: number;
  odometerStale: boolean;
}

/** No vehicle on file — the caller should open a create-vehicle flow. */
export interface CheckInNewVehicle {
  outcome: "new";
  /** Normalised, ready to seed the new-vehicle form. */
  plateNumber: string;
  vin: string | null;
}

/** The input was too short or empty to look anything up. */
export interface CheckInIdle {
  outcome: "idle";
}

export type CheckInResult = CheckInHydration | CheckInNewVehicle | CheckInIdle;

/**
 * Below this length an input is still being typed. Lookups on one or two
 * characters would match half the fleet and flicker the form as the advisor
 * types, so nothing resolves until there is enough to be meaningful.
 */
export const MIN_LOOKUP_LENGTH = 3;

/**
 * Resolves a typed plate or VIN against the fleet.
 *
 * Plate is tried first and VIN second — the advisor is far more likely to be
 * holding a plate, and a VIN is long enough that a partial plate can't collide
 * with one. Both are exact matches on the normalised form: a prefix match would
 * make "ABC1" resolve to a vehicle the advisor hasn't finished naming yet, and
 * hydrating the wrong customer is worse than hydrating nothing.
 */
export function lookupVehicle(
  input: string,
  vehicles: Vehicle[],
  clients: FleetClient[] = [],
  today = new Date()
): CheckInResult {
  const raw = input.trim();
  if (raw.length < MIN_LOOKUP_LENGTH) return { outcome: "idle" };

  const plate = normalisePlate(raw);
  const vin = normaliseVin(raw);

  const byPlate = vehicles.find((v) => normalisePlate(v.plateNumber) === plate);
  const matched = byPlate ?? vehicles.find((v) => normaliseVin(v.vin) === vin);

  if (!matched) {
    // A 17-character input is a VIN, not a plate — seeding the plate field with
    // it would just have to be cleared again.
    const looksLikeVin = vin.length === 17;
    return {
      outcome: "new",
      plateNumber: looksLikeVin ? "" : plate,
      vin: looksLikeVin ? vin : null,
    };
  }

  return {
    outcome: "existing",
    matchedOn: byPlate ? "plate" : "vin",
    vehicle: matched,
    client: clients.find((c) => c.id === matched.fleetClientId) ?? null,
    lastOdometer: matched.odometer,
    lastOdometerReadAt: matched.odometerReadAt,
    odometerAgeDays: odometerAgeDays(matched, today),
    odometerStale: isOdometerStale(matched, today),
  };
}

/**
 * The check-in form's field values, hydrated from a match.
 *
 * Deliberately a flat, UI-agnostic shape: this module decides *what* the form
 * should say, and the component decides how to render it. That keeps the
 * "never ask twice" rule testable without mounting anything.
 */
export interface CheckInFormState {
  vehicleId: string | null;
  plateNumber: string;
  vin: string;
  make: string;
  model: string;
  year: number | null;
  vehicleClass: Vehicle["vehicleClass"] | null;
  fuelType: Vehicle["fuelType"] | null;
  /** Customer-facing identity: the fleet client and its named contact. */
  customerName: string;
  customerContact: string;
  customerEmail: string;
  /** Who actually drives it — the person likely standing at the counter. */
  assignedTo: string;
  odometer: number | null;
  /** True when the odometer was pre-filled and should be confirmed, not trusted. */
  odometerNeedsConfirmation: boolean;
  /** False when nothing matched and the caller must create the vehicle. */
  isExistingVehicle: boolean;
}

export const EMPTY_CHECK_IN_FORM: CheckInFormState = {
  vehicleId: null,
  plateNumber: "",
  vin: "",
  make: "",
  model: "",
  year: null,
  vehicleClass: null,
  fuelType: null,
  customerName: "",
  customerContact: "",
  customerEmail: "",
  assignedTo: "",
  odometer: null,
  odometerNeedsConfirmation: false,
  isExistingVehicle: false,
};

/**
 * Projects a lookup result into form state.
 *
 * On a hit, every field the fleet already knows is filled and the advisor
 * confirms rather than types. On a miss, only the identifier that was typed
 * carries over into the new-vehicle form — the rest is genuinely unknown, and
 * guessing a make from a plate would be fabrication.
 */
export function hydrateCheckInForm(result: CheckInResult): CheckInFormState {
  if (result.outcome === "idle") return EMPTY_CHECK_IN_FORM;

  if (result.outcome === "new") {
    return {
      ...EMPTY_CHECK_IN_FORM,
      plateNumber: result.plateNumber,
      vin: result.vin ?? "",
    };
  }

  const { vehicle, client } = result;
  return {
    vehicleId: vehicle.id,
    plateNumber: vehicle.plateNumber,
    vin: vehicle.vin,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vehicleClass: vehicle.vehicleClass,
    fuelType: vehicle.fuelType,
    customerName: client?.name ?? "",
    customerContact: client?.contactName ?? "",
    customerEmail: client?.contactEmail ?? "",
    assignedTo: vehicle.assignedTo,
    odometer: result.lastOdometer,
    // A fresh reading can be accepted as-is; a stale one is a prompt to walk
    // out and look at the dash.
    odometerNeedsConfirmation: result.odometerStale,
    isExistingVehicle: true,
  };
}

/**
 * The service history worth surfacing at check-in: what is already overdue or
 * due soon on this vehicle, so the advisor can offer the work while the
 * vehicle is on the premises rather than booking it back in next month.
 *
 * Returns the health engine's own ordering (most urgent first) — this is a
 * projection for the counter, not a second opinion on urgency.
 */
export function suggestedWorkAtCheckIn(health: VehicleHealth | null, limit = 5) {
  if (!health) return [];
  return health.items.filter((item) => item.status !== "ok").slice(0, limit);
}
