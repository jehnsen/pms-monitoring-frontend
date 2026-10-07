/**
 * Business dates are Asia/Manila calendar dates (Standing Rule R9).
 *
 * The browser happened to run in Manila, so `formatISO(now, { representation:
 * "date" })` gave the right day. A server usually runs in UTC, where that same
 * call reports *yesterday* for anything stamped before 08:00 Manila time — a
 * job closed at 7am would be recorded as completed the previous day and shift
 * every PMS due date behind it. Server code stamps dates through this instead.
 */

export const BUSINESS_TIME_ZONE = "Asia/Manila";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" for the Manila calendar day containing `instant`. */
export function businessDate(instant: Date): string {
  return formatter.format(instant);
}

/** The Manila calendar year containing `instant` — order numbers are per year. */
export function businessYear(instant: Date): number {
  return Number(businessDate(instant).slice(0, 4));
}
