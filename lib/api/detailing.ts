import type {
  Availability,
  BookingSummary,
  DetailingAddon,
  DetailingBooking,
  DetailingCatalogue,
  DetailingCategory,
  DetailingInspection,
  DetailingPackage,
  DetailingSettings,
  DisplayToken,
  DurationReading,
  MonitorView,
  PublicConfirmation,
  PublicPage,
  RealtimeConfig,
  ScheduleView,
  StartOption,
  BranchBrand,
} from "@/types/detailing";

/**
 * The seam between the API's detailing resources and `types/detailing.ts`:
 * snake_case → camelCase, centavos → pesos (display only), and the defaults
 * components rely on for nullable fields. Nothing is worked out here.
 */

/** Every detailing query key starts with this, so one write refreshes them all. */
export const DETAILING_ROOT = "detailing";

type Raw = Record<string, any>;

const pesos = (cents: number | null | undefined) => (cents ?? 0) / 100;

const toDuration = (raw: Raw | null | undefined): DurationReading => ({
  slotBudget: raw?.slot_budget ?? 0,
  minutes: raw?.minutes ?? 0,
  days: raw?.days ?? 0,
  interpreted: raw?.interpreted ?? "",
});

export const toCategory = (raw: Raw): DetailingCategory => ({
  id: raw.id,
  name: raw.name,
  slug: raw.slug,
  color: raw.color ?? null,
  position: raw.position ?? 0,
});

export const toPackage = (raw: Raw): DetailingPackage => ({
  id: raw.id,
  branchId: raw.branch_id,
  category: raw.category ? toCategory(raw.category) : null,
  name: raw.name,
  description: raw.description ?? "",
  durationText: raw.duration_text,
  duration: toDuration(raw.duration),
  inclusions: raw.inclusions ?? [],
  isPopular: Boolean(raw.is_popular),
  minDetailers: raw.min_detailers,
  recommendedDetailers: raw.recommended_detailers,
  appliesTo: raw.applies_to,
  isActive: Boolean(raw.is_active),
  position: raw.position ?? 0,
  prices: (raw.prices ?? []).map((price: Raw) => ({
    sizeClass: price.size_class,
    sizeLabel: price.size_label,
    price: pesos(price.price_cents),
    durationText: price.duration_text ?? null,
    duration: price.duration ? toDuration(price.duration) : null,
  })),
  materials: (raw.materials ?? []).map((line: Raw) => ({
    id: line.id,
    itemId: line.item_id,
    itemName: line.item_name,
    sku: line.sku,
    uom: line.uom,
    quantity: line.quantity,
    scalesWithSize: Boolean(line.scales_with_size),
  })),
});

export const toAddon = (raw: Raw): DetailingAddon => ({
  id: raw.id,
  name: raw.name,
  isActive: Boolean(raw.is_active),
  position: raw.position ?? 0,
  prices: (raw.prices ?? []).map((price: Raw) => ({ sizeClass: price.size_class, sizeLabel: price.size_label, price: pesos(price.price_cents) })),
});

export const toCatalogue = (raw: Raw): DetailingCatalogue => ({
  branchId: raw.branch_id,
  categories: (raw.categories ?? []).map(toCategory),
  packages: (raw.packages ?? []).map(toPackage),
  addons: (raw.addons ?? []).map(toAddon),
  detailers: raw.detailers ?? [],
});

const toWhen = (raw: Raw | null | undefined) => ({ date: raw?.date ?? null, minutes: raw?.minutes ?? null, label: raw?.label ?? null });

export const toBooking = (raw: Raw): DetailingBooking => ({
  id: raw.id,
  reference: raw.reference,
  branchId: raw.branch_id,
  status: raw.status,
  statusLabel: raw.status_label,
  source: raw.source,
  customerAccountId: raw.customer_account_id,
  customer: { name: raw.customer?.name ?? "", email: raw.customer?.email ?? "", phone: raw.customer?.phone ?? "" },
  vehicleId: raw.vehicle_id ?? null,
  vehicleLabel: raw.vehicle_label ?? "",
  sizeClass: raw.size_class,
  sizeLabel: raw.size_label,
  package: {
    id: raw.package.id,
    name: raw.package.name,
    categoryName: raw.package.category_name ?? "",
    price: pesos(raw.package.price_cents),
    durationText: raw.package.duration_text,
  },
  scheduledDate: raw.scheduled_date,
  startMinutes: raw.start_minutes,
  startTime: raw.start_time,
  startLabel: raw.start_label,
  firstDay: raw.first_day ?? null,
  days: raw.days ?? [],
  spansDays: Boolean(raw.spans_days),
  finish: { ...toWhen(raw.finish), actual: Boolean(raw.finish?.actual) },
  minDetailers: raw.min_detailers,
  detailersCount: raw.detailers_count,
  detailers: raw.detailers ?? [],
  bay: raw.bay ?? null,
  addons: (raw.addons ?? []).map((addon: Raw) => ({
    id: addon.id,
    addonId: addon.addon_id ?? null,
    name: addon.name,
    quantity: addon.quantity,
    unitPrice: pesos(addon.unit_price_cents),
    lineTotal: pesos(addon.line_total_cents),
  })),
  totals: { package: pesos(raw.totals.package_cents), addons: pesos(raw.totals.addons_cents), total: pesos(raw.totals.total_cents) },
  notes: raw.notes ?? "",
  cancellationReason: raw.cancellation_reason ?? "",
  checklist: (raw.checklist ?? []).map((line: Raw) => ({
    index: line.index,
    label: line.label,
    done: Boolean(line.done),
    doneByName: line.done_by_name ?? null,
    doneAt: line.done_at ?? null,
  })),
  checklistProgress: raw.checklist_progress ?? { done: 0, total: 0 },
  startedAt: raw.started_at ?? null,
  completedAt: raw.completed_at ?? null,
  inspection: {
    neededBeforeStart: Boolean(raw.inspection?.needed_before_start),
    checkInId: raw.inspection?.check_in_id ?? null,
    checkOutId: raw.inspection?.check_out_id ?? null,
    overrideReason: raw.inspection?.override_reason ?? "",
    overriddenByName: raw.inspection?.overridden_by_name ?? "",
  },
  qc: { status: raw.qc?.status ?? null, byName: raw.qc?.by_name ?? "", at: raw.qc?.at ?? null, notes: raw.qc?.notes ?? "" },
  materials: raw.materials ? { consumedAt: raw.materials.consumed_at, cost: pesos(raw.materials.cost_cents) } : null,
  margin: raw.margin
    ? {
        revenue: pesos(raw.margin.revenue_cents),
        materialsCost: pesos(raw.margin.materials_cost_cents),
        margin: pesos(raw.margin.margin_cents),
        marginPct: raw.margin.margin_pct ?? null,
      }
    : null,
  invoice: raw.invoice
    ? {
        id: raw.invoice.id,
        number: raw.invoice.number ?? null,
        status: raw.invoice.status,
        totalDue: pesos(raw.invoice.total_due_cents),
        balance: pesos(raw.invoice.balance_cents),
      }
    : null,
  prepaid: raw.prepaid
    ? { packageId: raw.prepaid.package_id, reference: raw.prepaid.reference, planName: raw.prepaid.plan_name, amount: (raw.prepaid.amount_cents ?? 0) / 100, redeemedOn: raw.prepaid.redeemed_on }
    : null,
  next: {
    needsInspection: Boolean(raw.next?.needs_inspection),
    canSignOff: Boolean(raw.next?.can_sign_off),
    signOffBlockedReason: raw.next?.sign_off_blocked_reason ?? null,
    canInvoice: Boolean(raw.next?.can_invoice),
    canCheckOut: Boolean(raw.next?.can_check_out),
    canRedeem: Boolean(raw.next?.can_redeem),
    lockedByInvoice: Boolean(raw.next?.locked_by_invoice),
  },
  statusLog: (raw.status_log ?? []).map((log: Raw) => ({
    id: log.id,
    fromStatus: log.from_status ?? null,
    toStatus: log.to_status,
    notes: log.notes ?? "",
    actorName: log.actor_name,
    changedAt: log.changed_at,
  })),
  createdByName: raw.created_by_name,
  createdAt: raw.created_at,
});

export const toSummary = (raw: Raw): BookingSummary => ({
  total: raw.total,
  byStatus: raw.by_status,
  today: { date: raw.today.date, bookings: raw.today.bookings, onTheFloor: raw.today.on_the_floor, pending: raw.today.pending },
});

export const toStart = (raw: Raw): StartOption => ({
  startMinutes: raw.start_minutes ?? 0,
  time: raw.time,
  label: raw.label,
  available: Boolean(raw.available),
  reason: raw.reason ?? null,
  remaining: raw.remaining ?? 0,
  spansDays: Boolean(raw.spans_days),
  plan: raw.plan ?? [],
  ends: raw.ends ? toWhen(raw.ends) : null,
  busyDetailerIds: raw.busy_detailer_ids ?? [],
});

export const toAvailability = (raw: Raw): Availability => ({
  date: raw.date,
  durationText: raw.duration_text ?? "",
  minDetailers: raw.min_detailers ?? 1,
  pool: raw.pool ?? 0,
  starts: (raw.starts ?? []).map(toStart),
});

export const toInspection = (raw: Raw): DetailingInspection => ({
  id: raw.id,
  bookingId: raw.booking_id,
  stage: raw.stage,
  overallRating: raw.overall_rating,
  exteriorRating: raw.exterior_rating ?? null,
  interiorRating: raw.interior_rating ?? null,
  exteriorCondition: raw.exterior_condition ?? null,
  interiorCondition: raw.interior_condition ?? null,
  mileage: raw.mileage ?? null,
  notes: raw.notes ?? "",
  damagePoints: (raw.damage_points ?? []).map((point: Raw) => ({ id: point.id, x: point.x_permille, y: point.y_permille, kind: point.kind, note: point.note })),
  photos: (raw.photos ?? []).map((photo: Raw) => ({ id: photo.id, documentId: photo.document_id, phase: photo.phase, caption: photo.caption ?? "", name: photo.name })),
  recordedByName: raw.recorded_by_name,
  recordedAt: raw.recorded_at,
});

export const toSettings = (raw: Raw): DetailingSettings => ({
  branchId: raw.branch_id,
  saved: Boolean(raw.saved),
  detailerPoolSize: raw.detailer_pool_size,
  defaultDetailersPerBooking: raw.default_detailers_per_booking,
  closingMinutes: raw.closing_minutes,
  closingTime: raw.closing_time,
  closingLabel: raw.closing_label,
  publicBookingEnabled: Boolean(raw.public_booking_enabled),
  publicBookingNotice: raw.public_booking_notice ?? "",
  inspectionRequired: Boolean(raw.inspection_required),
  sizeMultipliers: (raw.size_multipliers ?? []).map((row: Raw) => ({ sizeClass: row.size_class, sizeLabel: row.size_label, factor: row.factor })),
  activeDetailers: raw.active_detailers ?? 0,
  peakHeads: raw.peak_heads ?? 0,
});

export const toDisplayToken = (raw: Raw): DisplayToken => ({
  id: raw.id,
  name: raw.name,
  tokenHint: raw.token_hint,
  isActive: Boolean(raw.is_active),
  lastUsedAt: raw.last_used_at ?? null,
  revokedAt: raw.revoked_at ?? null,
  revokedByName: raw.revoked_by_name ?? "",
  createdByName: raw.created_by_name,
  createdAt: raw.created_at,
  token: raw.token,
});

export const toSchedule = (raw: Raw): ScheduleView => ({
  branchId: raw.branch_id,
  from: raw.from,
  to: raw.to,
  pool: raw.pool,
  closingMinutes: raw.closing_minutes,
  grid: (raw.grid ?? []).map((slot: Raw) => ({ slot: slot.slot, time: slot.time, label: slot.label, afterClosing: Boolean(slot.after_closing) })),
  days: raw.days ?? [],
  bays: raw.bays ?? [],
  detailers: raw.detailers ?? [],
  blocked: raw.blocked ?? [],
  bookings: (raw.bookings ?? []).map(toBooking),
});

export const toMonitor = (raw: Raw): MonitorView => ({
  branchId: raw.branch_id,
  date: raw.date,
  generatedAt: raw.generated_at,
  counts: { upcoming: raw.counts.upcoming, inProgress: raw.counts.in_progress, done: raw.counts.done },
  jobs: (raw.jobs ?? []).map((job: Raw) => ({
    id: job.id,
    reference: job.reference,
    status: job.status,
    stage: job.stage,
    customerName: job.customer_name,
    vehicleLabel: job.vehicle_label ?? "",
    sizeClass: job.size_class,
    packageName: job.package_name,
    bayName: job.bay_name ?? null,
    detailers: job.detailers ?? [],
    detailersCount: job.detailers_count,
    startMinutes: job.start_minutes,
    startLabel: job.start_label,
    continuesFrom: job.continues_from ?? null,
    finish: { ...toWhen(job.finish), actual: Boolean(job.finish?.actual) },
    checklist: job.checklist ?? { done: 0, total: 0 },
    qcStatus: job.qc_status ?? null,
  })),
});

export const toRealtime = (raw: Raw): RealtimeConfig => ({
  enabled: Boolean(raw.enabled),
  key: raw.key ?? null,
  host: raw.host ?? null,
  port: raw.port ?? null,
  scheme: raw.scheme ?? null,
  channel: raw.channel,
  event: raw.event,
  pollSeconds: raw.poll_seconds ?? 20,
});

export const toBrand = (raw: Raw): BranchBrand => ({
  slug: raw.slug,
  name: raw.name,
  address: raw.address ?? null,
  contactPhone: raw.contact_phone ?? null,
  logoUrl: raw.logo_url ?? null,
  themeTokens: raw.theme_tokens ?? null,
});

export const toPublicPage = (raw: Raw): PublicPage => ({
  branch: toBrand(raw.branch),
  booking: {
    enabled: Boolean(raw.booking.enabled),
    notice: raw.booking.notice ?? null,
    firstDate: raw.booking.first_date,
    lastDate: raw.booking.last_date,
    closingLabel: raw.booking.closing_label,
  },
  sizes: (raw.sizes ?? []).map((size: Raw) => ({ sizeClass: size.size_class, label: size.label })),
  packages: (raw.packages ?? []).map(toPackage),
  captcha: { provider: raw.captcha?.provider ?? null, siteKey: raw.captcha?.site_key ?? null },
});

export const toConfirmation = (raw: Raw): PublicConfirmation => ({
  reference: raw.reference,
  status: raw.status,
  statusLabel: raw.status_label,
  customerName: raw.customer_name,
  vehicleLabel: raw.vehicle_label ?? "",
  packageName: raw.package_name,
  sizeLabel: raw.size_label,
  price: pesos(raw.price_cents),
  durationText: raw.duration_text,
  scheduledDate: raw.scheduled_date,
  startLabel: raw.start_label,
  days: (raw.days ?? []).map((day: Raw) => ({ date: day.date, fromLabel: day.from_label, toLabel: day.to_label })),
});
