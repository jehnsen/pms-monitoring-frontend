import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Vehicle } from "@/types";
import { formatDate, formatKm } from "@/lib/utils";

/** Above this multiple of the average daily rate, a reading is probably a typo. */
export const ODOMETER_RATE_HIGH_MULTIPLIER = 3;
/** Below this multiple, a reading is probably an old value re-entered. */
export const ODOMETER_RATE_LOW_MULTIPLIER = 0.1;

export interface OdometerValidation {
  status: "invalid" | "warning" | "ok";
  /** Set when `status === "invalid"` — blocks submission. */
  error: string | null;
  /** Set when `status === "warning"` — allowed, but needs confirmation. */
  warning: string | null;
  /** km/day implied by this reading against the vehicle's last one, or null when rejected. */
  impliedDailyKm: number | null;
}

/**
 * Shared by the odometer-log dialog and the work-order close modal so the two
 * can't drift apart on what counts as a bad reading.
 */
export function validateOdometerReading({
  vehicle,
  reading,
  readAt = new Date(),
}: {
  vehicle: Vehicle;
  reading: number;
  readAt?: Date;
}): OdometerValidation {
  if (reading < vehicle.odometer) {
    return {
      status: "invalid",
      error: `Cannot be lower than the last recorded reading of ${formatKm(
        vehicle.odometer
      )} on ${formatDate(vehicle.odometerReadAt)}.`,
      warning: null,
      impliedDailyKm: null,
    };
  }

  // Same-day re-readings would otherwise divide by zero; treat them as a
  // one-day gap so a same-day jump is still measured against the average.
  const daysSince = Math.max(
    1,
    differenceInCalendarDays(readAt, parseISO(vehicle.odometerReadAt))
  );
  const impliedDailyKm = (reading - vehicle.odometer) / daysSince;

  if (vehicle.avgDailyKm > 0) {
    const high = vehicle.avgDailyKm * ODOMETER_RATE_HIGH_MULTIPLIER;
    const low = vehicle.avgDailyKm * ODOMETER_RATE_LOW_MULTIPLIER;

    if (impliedDailyKm > high) {
      return {
        status: "warning",
        error: null,
        warning: `This implies ${formatKm(
          Math.round(impliedDailyKm)
        )} a day — over 3x this vehicle's average of ${formatKm(
          Math.round(vehicle.avgDailyKm)
        )} a day. Double-check the reading before saving.`,
        impliedDailyKm,
      };
    }

    if (impliedDailyKm < low) {
      return {
        status: "warning",
        error: null,
        warning: `This implies only ${formatKm(
          Math.round(impliedDailyKm)
        )} a day — well under this vehicle's average of ${formatKm(
          Math.round(vehicle.avgDailyKm)
        )} a day. That usually means an old reading was re-entered.`,
        impliedDailyKm,
      };
    }
  }

  return { status: "ok", error: null, warning: null, impliedDailyKm };
}
