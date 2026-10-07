import "server-only";

import { BUSINESS_TIME_ZONE } from "@/lib/business-date";

/**
 * Pins the server process to Manila time (Standing Rule R9).
 *
 * Dates are stamped through `lib/business-date.ts` explicitly, but some
 * domain functions — `businessHoursBetween`'s 08:00–18:00 window, `date-fns`'
 * `startOfDay` — read the process's local zone. Hosts default to UTC, which
 * would shift the business day by eight hours. Node re-reads `TZ` on
 * assignment, so setting it here, before any command runs, makes those
 * functions mean what they mean in the browser. Set `TZ=Asia/Manila` in the
 * deployment environment as well; this is the fallback if that is missed.
 */
if (process.env.TZ !== BUSINESS_TIME_ZONE) {
  process.env.TZ = BUSINESS_TIME_ZONE;
}
