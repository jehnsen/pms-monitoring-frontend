import { formatPesos } from "@/lib/utils";

/**
 * The seam between the API's CRM payloads and `types/crm.ts`. The CRM's
 * payloads are flat and many, so instead of a hand-written mapper per record
 * this camel-cases keys (deeply) and changes nothing else: money stays in
 * centavos, as the API sent it, and `pesos()` formats it where it is shown.
 * Nothing is worked out here.
 */

/** Every CRM query key starts with this. */
export const CRM_ROOT = "crm";

/** Keys whose VALUE is sent back to the API as it is, so its own keys stay in the API's names. */
const VERBATIM = new Set(["filters", "skipped_by_reason"]);

const camelKey = (key: string) => key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

export function camel<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => camel(item)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[camelKey(key)] = VERBATIM.has(key) ? inner : camel(inner);
    }
    return out as T;
  }
  return value as T;
}

/** Centavos, as pesos for display. */
export const pesos = (cents: number | null | undefined) => formatPesos((cents ?? 0) / 100);

/** Minutes of the day as a clock time, for the quiet-hours fields ("21:00"). */
export const minutesToClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const clockToMinutes = (clock: string) => {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** Why a message was not sent, in words. */
export const SKIP_REASON: Record<string, string> = {
  no_consent: "No consent on record",
  opted_out: "Opted out",
  no_address: "No address on this channel",
  recently_sent: "Sent recently",
};
