import { addDays, addMonths, differenceInCalendarDays } from "date-fns";

/** A task enters the warning band this far ahead of either limit. */
export const DUE_SOON_KM = 750;
export const DUE_SOON_DAYS = 21;

export type IntervalGovernor = "distance" | "time";

export type IntervalStatusValue = "on_schedule" | "due_soon" | "overdue";

export interface IntervalInput {
  /** When the interval was last completed. */
  lastCompletedAt: Date;
  /** Odometer reading at that completion, in km. */
  lastCompletedOdometer: number;
  distanceIntervalKm: number;
  timeIntervalMonths: number;
  /** Most recent odometer reading, in km. */
  currentOdometer: number;
  /** When that reading was taken — readings are not always same-day. */
  currentOdometerReadAt: Date;
  avgKmPerDay: number;
  today: Date;
}

export interface IntervalStatus {
  /** Odometer value at which the distance limit falls due. */
  distanceDueAt: number;
  /** Calendar date on which the distance limit falls (or fell) due. */
  distanceDueOn: Date;
  timeDueAt: Date;
  governedBy: IntervalGovernor;
  /** The earlier of the two limits — the one that actually governs. */
  projectedDue: Date;
  status: IntervalStatusValue;
  /** Distance past the limit, or null when it has not been reached. */
  kmPast: number | null;
  /** Days past the governing limit, or null when it is still ahead. */
  daysOverdue: number | null;
  /** Odometer projected to today from the last reading. */
  estimatedOdometerNow: number;
  /** Signed days to the governing limit: negative once past. */
  daysRemaining: number;
  /** Signed km to the distance limit: negative once past. */
  kmRemaining: number;
  /** 0–1 through the interval; above 1 once breached. */
  progress: number;
}

/**
 * Projects one preventive-maintenance interval onto the calendar.
 *
 * An interval carries a distance limit and a time limit and falls due on
 * whichever arrives FIRST. To compare them at all, both have to be expressed as
 * dates measured from the same anchor — the last completion. The distance limit
 * becomes a date by dividing the interval by the vehicle's average daily use.
 *
 * Anchoring is the whole point. An earlier version measured the distance limit
 * backwards from today (`kmRemaining / avgKmPerDay`) while measuring the time
 * limit forwards from the last completion. Those agree only while both limits
 * are still ahead; once an interval is breached the two are counted from
 * different origins, and `min()` over them selects the LATER limit — which
 * understates how long the vehicle has been running past due.
 */
export function computeIntervalStatus(input: IntervalInput): IntervalStatus {
  const {
    lastCompletedAt,
    lastCompletedOdometer,
    distanceIntervalKm,
    timeIntervalMonths,
    currentOdometer,
    currentOdometerReadAt,
    avgKmPerDay,
    today,
  } = input;

  const distanceDueAt = lastCompletedOdometer + distanceIntervalKm;
  const timeDueAt = addMonths(lastCompletedAt, timeIntervalMonths);

  // A vehicle that is not moving can never reach a distance limit, so the time
  // limit governs by default rather than dividing by zero.
  const dailyKm = avgKmPerDay > 0 ? avgKmPerDay : 0;
  const daysToCoverInterval =
    dailyKm > 0 ? Math.round(distanceIntervalKm / dailyKm) : Number.POSITIVE_INFINITY;

  const distanceDueOn = Number.isFinite(daysToCoverInterval)
    ? addDays(lastCompletedAt, daysToCoverInterval)
    : // Far enough out that the time limit always wins the comparison.
      addMonths(lastCompletedAt, timeIntervalMonths * 100);

  // Both dates now share the same anchor, so the earlier one governs in every
  // state — ahead of the limit, on it, or long past it.
  const governedBy: IntervalGovernor =
    distanceDueOn.getTime() <= timeDueAt.getTime() ? "distance" : "time";
  const projectedDue = governedBy === "distance" ? distanceDueOn : timeDueAt;

  // Readings are not always taken today; roll the odometer forward so distance
  // comparisons are against an estimate of where the vehicle actually is.
  const daysSinceReading = Math.max(
    0,
    differenceInCalendarDays(today, currentOdometerReadAt)
  );
  const estimatedOdometerNow = Math.round(
    currentOdometer + daysSinceReading * dailyKm
  );

  const kmRemaining = distanceDueAt - estimatedOdometerNow;
  const daysRemaining = differenceInCalendarDays(projectedDue, today);

  const kmPast = kmRemaining < 0 ? -kmRemaining : null;
  const daysOverdue = daysRemaining < 0 ? -daysRemaining : null;

  let status: IntervalStatusValue;
  if (kmPast !== null || daysOverdue !== null) {
    status = "overdue";
  } else if (kmRemaining <= DUE_SOON_KM || daysRemaining <= DUE_SOON_DAYS) {
    status = "due_soon";
  } else {
    status = "on_schedule";
  }

  const distanceProgress =
    distanceIntervalKm > 0
      ? (estimatedOdometerNow - lastCompletedOdometer) / distanceIntervalKm
      : 0;
  const elapsedDays = differenceInCalendarDays(today, lastCompletedAt);
  const intervalDays = differenceInCalendarDays(timeDueAt, lastCompletedAt);
  const timeProgress = intervalDays > 0 ? elapsedDays / intervalDays : 0;

  return {
    distanceDueAt,
    distanceDueOn,
    timeDueAt,
    governedBy,
    projectedDue,
    status,
    kmPast,
    daysOverdue,
    estimatedOdometerNow,
    daysRemaining,
    kmRemaining,
    progress: Math.max(distanceProgress, timeProgress, 0),
  };
}
