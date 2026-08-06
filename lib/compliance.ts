import { differenceInCalendarDays, parseISO } from "date-fns";
import type { DocumentKind, FleetDocument, Vehicle } from "@/types";
import { DOCUMENT_KIND_LABEL } from "@/lib/documents";

/**
 * Roadworthiness-relevant document kinds — an expired one can take a vehicle
 * off the road. `warranty` deliberately isn't here: it's informational (worth
 * a heads-up via the generic document-expiry alert) but a lapsed warranty
 * never stops a truck at a checkpoint the way an expired registration does.
 */
export const COMPLIANCE_DOC_KINDS: DocumentKind[] = [
  "lto_registration",
  "ctpl",
  "comprehensive_insurance",
  "emission_test",
  "ltfrb_franchise",
];

/** Dashboard tile window. */
export const DASHBOARD_EXPIRY_WINDOW_DAYS = 60;
/** Vehicle card / detail badge window. */
export const BADGE_WARNING_DAYS = 30;

export type ComplianceStatus = "expired" | "expiring" | "ok";

/**
 * Worst compliance state across a vehicle's roadworthiness documents and its
 * driver's licence. One expired anything is enough to read `expired` —
 * compliance doesn't average out.
 */
export function vehicleComplianceStatus(
  vehicle: Vehicle,
  documents: FleetDocument[],
  today = new Date()
): ComplianceStatus {
  const expiryDates: string[] = documents
    .filter(
      (doc) =>
        doc.vehicleId === vehicle.id &&
        doc.expiresOn &&
        COMPLIANCE_DOC_KINDS.includes(doc.kind)
    )
    .map((doc) => doc.expiresOn as string);

  if (vehicle.driverLicenceExpiry) expiryDates.push(vehicle.driverLicenceExpiry);

  if (expiryDates.length === 0) return "ok";

  const minDaysRemaining = Math.min(
    ...expiryDates.map((date) => differenceInCalendarDays(parseISO(date), today))
  );

  if (minDaysRemaining < 0) return "expired";
  if (minDaysRemaining <= BADGE_WARNING_DAYS) return "expiring";
  return "ok";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Same three-way read as `vehicleComplianceStatus`, for a single document row. */
export function documentExpiryStatus(
  doc: FleetDocument,
  today = new Date()
): ComplianceStatus {
  if (!doc.expiresOn) return "ok";
  const days = differenceInCalendarDays(parseISO(doc.expiresOn), today);
  if (days < 0) return "expired";
  if (days <= BADGE_WARNING_DAYS) return "expiring";
  return "ok";
}

export interface ExpiringDocumentSummary {
  total: number;
  /** Count per kind label — only kinds with at least one entry are present. */
  byKind: { label: string; count: number }[];
}

/**
 * Everything (compliance documents, driver licences) expiring inside a
 * window, for the dashboard tile. Already-expired items count too — "expired"
 * is the most urgent case of "expiring," not a separate bucket to miss.
 */
export function expiringDocumentSummary(
  vehicles: Vehicle[],
  documents: FleetDocument[],
  windowDays: number,
  today = new Date()
): ExpiringDocumentSummary {
  const counts = new Map<DocumentKind, number>();

  for (const doc of documents) {
    if (!doc.expiresOn || !COMPLIANCE_DOC_KINDS.includes(doc.kind)) continue;
    if (differenceInCalendarDays(parseISO(doc.expiresOn), today) > windowDays) continue;
    counts.set(doc.kind, (counts.get(doc.kind) ?? 0) + 1);
  }

  let licenceCount = 0;
  for (const vehicle of vehicles) {
    if (!vehicle.driverLicenceExpiry) continue;
    if (differenceInCalendarDays(parseISO(vehicle.driverLicenceExpiry), today) > windowDays) continue;
    licenceCount += 1;
  }

  const byKind = [...counts.entries()].map(([kind, count]) => ({
    label: DOCUMENT_KIND_LABEL[kind],
    count,
  }));
  if (licenceCount > 0) byKind.push({ label: "Driver licence", count: licenceCount });

  return {
    total: byKind.reduce((total, entry) => total + entry.count, 0),
    byKind: byKind.sort((a, b) => b.count - a.count),
  };
}

/**
 * PH LTO registration renewal runs on the plate's last digit: 1–9 renew in
 * January–September, 0 renews in October. Motorcycles and a few older series
 * vary, but this is the schedule that applies to the light commercial and
 * passenger classes this fleet runs.
 */
export function plateEndingRenewalMonth(plateNumber: string): string | null {
  const digits = plateNumber.match(/\d/g);
  if (!digits || digits.length === 0) return null;

  const lastDigit = Number(digits[digits.length - 1]);
  const monthIndex = lastDigit === 0 ? 9 : lastDigit - 1;
  return MONTH_NAMES[monthIndex];
}
