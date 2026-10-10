/**
 * Detailing (Phase 9), as the screens use it. Every figure here is the API's:
 * prices, plans, finish times, counts, what a slot has left, what a job is
 * waiting for. Money is in pesos (display only; the API holds centavos).
 */

export type SizeClass = "small" | "medium" | "large" | "xl";

export type BookingStatus = "pending" | "confirmed" | "on_going" | "completed" | "cancelled" | "no_show";

export interface DurationReading {
  slotBudget: number;
  minutes: number;
  days: number;
  /** "Interpreted as …": how the API reads the typed duration. */
  interpreted: string;
}

export interface SizePrice {
  sizeClass: SizeClass;
  sizeLabel: string;
  price: number;
  durationText: string | null;
  duration: DurationReading | null;
}

export interface PackageMaterial {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  uom: string;
  quantity: string;
  scalesWithSize: boolean;
}

export interface DetailingCategory {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  position: number;
}

export interface DetailingPackage {
  id: string;
  branchId: string;
  category: DetailingCategory | null;
  name: string;
  description: string;
  durationText: string;
  duration: DurationReading;
  inclusions: string[];
  isPopular: boolean;
  minDetailers: number;
  recommendedDetailers: number;
  appliesTo: "all" | "four_wheel" | "motorcycle";
  isActive: boolean;
  position: number;
  prices: SizePrice[];
  materials: PackageMaterial[];
}

export interface DetailingAddon {
  id: string;
  name: string;
  isActive: boolean;
  position: number;
  prices: { sizeClass: SizeClass; sizeLabel: string; price: number }[];
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface DetailingCatalogue {
  branchId: string;
  categories: DetailingCategory[];
  packages: DetailingPackage[];
  addons: DetailingAddon[];
  detailers: NamedRef[];
}

export interface DayAndTime {
  date: string | null;
  minutes: number | null;
  label: string | null;
}

export interface BookingDay {
  date: string;
  slots: { slot: number; label: string; released: boolean }[];
}

export interface ChecklistLine {
  index: number;
  label: string;
  done: boolean;
  doneByName: string | null;
  doneAt: string | null;
}

export interface DetailingBooking {
  id: string;
  reference: string;
  branchId: string;
  status: BookingStatus;
  statusLabel: string;
  source: "staff" | "public" | "recurring";
  customerAccountId: string;
  customer: { name: string; email: string; phone: string };
  vehicleId: string | null;
  vehicleLabel: string;
  sizeClass: SizeClass;
  sizeLabel: string;
  package: { id: string; name: string; categoryName: string; price: number; durationText: string };
  scheduledDate: string;
  startMinutes: number;
  startTime: string;
  startLabel: string;
  firstDay: string | null;
  days: BookingDay[];
  spansDays: boolean;
  finish: DayAndTime & { actual: boolean };
  minDetailers: number;
  detailersCount: number;
  detailers: NamedRef[];
  bay: NamedRef | null;
  addons: { id: string; addonId: string | null; name: string; quantity: string; unitPrice: number; lineTotal: number }[];
  totals: { package: number; addons: number; total: number };
  notes: string;
  cancellationReason: string;
  checklist: ChecklistLine[];
  checklistProgress: { done: number; total: number };
  startedAt: string | null;
  completedAt: string | null;
  inspection: { neededBeforeStart: boolean; checkInId: string | null; checkOutId: string | null; overrideReason: string; overriddenByName: string };
  qc: { status: "passed" | "failed" | null; byName: string; at: string | null; notes: string };
  materials: { consumedAt: string; cost: number } | null;
  margin: { revenue: number; materialsCost: number; margin: number; marginPct: string | null } | null;
  invoice: { id: string; number: string | null; status: string; totalDue: number; balance: number } | null;
  next: { needsInspection: boolean; canSignOff: boolean; signOffBlockedReason: string | null; canInvoice: boolean; canCheckOut: boolean; lockedByInvoice: boolean };
  statusLog: { id: string; fromStatus: BookingStatus | null; toStatus: BookingStatus; notes: string; actorName: string; changedAt: string }[];
  createdByName: string;
  createdAt: string;
}

export interface BookingSummary {
  total: number;
  byStatus: Record<BookingStatus, number>;
  today: { date: string; bookings: number; onTheFloor: number; pending: number };
}

export interface StartOption {
  startMinutes: number;
  time: string;
  label: string;
  available: boolean;
  reason: "blocked" | "capacity" | "overflow" | "past" | null;
  remaining: number;
  spansDays: boolean;
  plan: { date: string; slots: number[] }[];
  ends: DayAndTime | null;
  busyDetailerIds: string[];
}

export interface Availability {
  date: string;
  durationText: string;
  minDetailers: number;
  pool: number;
  starts: StartOption[];
}

export interface DamagePoint {
  id?: string;
  /** Thousandths of the outline's width (x) and length (y). */
  x: number;
  y: number;
  kind: "scratch" | "dent" | "chip" | "crack" | "stain" | "other";
  note: string;
}

export interface DetailingInspection {
  id: string;
  bookingId: string;
  stage: "check_in" | "check_out";
  overallRating: number;
  exteriorRating: number | null;
  interiorRating: number | null;
  exteriorCondition: string | null;
  interiorCondition: string | null;
  mileage: number | null;
  notes: string;
  damagePoints: DamagePoint[];
  photos: { id: string; documentId: string; phase: "before" | "after"; caption: string; name: string }[];
  recordedByName: string;
  recordedAt: string;
}

export interface DetailingSettings {
  branchId: string;
  saved: boolean;
  detailerPoolSize: number;
  defaultDetailersPerBooking: number;
  closingMinutes: number;
  closingTime: string;
  closingLabel: string;
  publicBookingEnabled: boolean;
  publicBookingNotice: string;
  inspectionRequired: boolean;
  sizeMultipliers: { sizeClass: SizeClass; sizeLabel: string; factor: string }[];
  activeDetailers: number;
  peakHeads: number;
}

export interface DisplayToken {
  id: string;
  name: string;
  tokenHint: string;
  isActive: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedByName: string;
  createdByName: string;
  createdAt: string;
  /** Present once, in the response that made it. */
  token?: string;
}

export interface ScheduleView {
  branchId: string;
  from: string;
  to: string;
  pool: number;
  closingMinutes: number;
  grid: { slot: number; time: string; label: string; afterClosing: boolean }[];
  days: { date: string; slots: { slot: number; held: number; remaining: number }[] }[];
  bays: (NamedRef & { focus: string | null })[];
  detailers: NamedRef[];
  blocked: { id: string; date: string; slot: number; label: string }[];
  bookings: DetailingBooking[];
}

export interface MonitorJob {
  id: string;
  reference: string;
  status: BookingStatus;
  stage: "upcoming" | "in_progress" | "done";
  customerName: string;
  vehicleLabel: string;
  sizeClass: SizeClass;
  packageName: string;
  bayName: string | null;
  detailers: string[];
  detailersCount: number;
  startMinutes: number;
  startLabel: string;
  continuesFrom: string | null;
  finish: DayAndTime & { actual: boolean };
  checklist: { done: number; total: number };
  qcStatus: string | null;
}

export interface MonitorView {
  branchId: string;
  date: string;
  generatedAt: string;
  counts: { upcoming: number; inProgress: number; done: number };
  jobs: MonitorJob[];
}

export interface RealtimeConfig {
  enabled: boolean;
  key: string | null;
  host: string | null;
  port: number | null;
  scheme: string | null;
  channel: string;
  event: string;
  pollSeconds: number;
}

/** A branch as its public page and its wall screen show it. */
export interface BranchBrand {
  slug?: string;
  name: string;
  address?: string | null;
  contactPhone?: string | null;
  logoUrl: string | null;
  themeTokens: Record<string, string> | null;
}

export interface PublicPage {
  branch: BranchBrand;
  booking: { enabled: boolean; notice: string | null; firstDate: string; lastDate: string; closingLabel: string };
  sizes: { sizeClass: SizeClass; label: string }[];
  packages: DetailingPackage[];
  captcha: { provider: string | null; siteKey: string | null };
}

export interface PublicConfirmation {
  reference: string;
  status: BookingStatus;
  statusLabel: string;
  customerName: string;
  vehicleLabel: string;
  packageName: string;
  sizeLabel: string;
  price: number;
  durationText: string;
  scheduledDate: string;
  startLabel: string;
  days: { date: string; fromLabel: string; toLabel: string }[];
}
