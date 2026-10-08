import { vi } from "vitest";

/**
 * The instant every authoring script pretends it is.
 *
 * A Thursday morning inside business hours, in Manila. Everything date-shaped
 * in lib/ goes through date-fns in the *process's local* timezone, so the
 * timezone is pinned as well as the clock — otherwise a fixture generated on a
 * UTC CI runner would disagree with one generated in Manila.
 */
export const FROZEN_AT = "2026-10-08T10:00:00+08:00";
export const TIMEZONE = "Asia/Manila";

export function freezeClock(): Date {
  process.env.TZ = TIMEZONE;
  // Only Date is faked; setTimeout and friends stay real so vitest still works.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FROZEN_AT));

  const now = new Date();
  // Asia/Manila is UTC+8 all year (no DST since 1978), so this is a complete check
  // that the TZ assignment took effect before anything read the clock.
  if (now.getTimezoneOffset() !== -480 || now.toISOString() !== "2026-10-08T02:00:00.000Z") {
    throw new Error(
      `Clock not frozen to ${FROZEN_AT} in ${TIMEZONE} (got ${now.toString()}). ` +
        "Something read the clock before freezeClock() ran."
    );
  }
  return now;
}
