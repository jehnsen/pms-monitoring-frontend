/**
 * The CRM (Phase 11), as the screens use it. Every figure and flag here is the
 * API's: a customer's spend and balance, a task's `overdue`, a package's
 * credits left, a segment's size, a campaign's progress, the NPS. Unlike the
 * older seams, money stays in CENTAVOS here (`…Cents`), exactly as the API
 * sends it; `pesos()` in `lib/api/crm.ts` formats it for display.
 */

export interface Option {
  value: string;
  label: string;
}

export interface CrmOptions {
  staff: { id: string; name: string; role: string }[];
  leadStages: { value: string; label: string; open: boolean }[];
  taskKinds: Option[];
}

export interface CrmCustomerRow {
  id: string;
  displayName: string;
  accountType: string;
  status: string;
  tags: string[];
  spendCents: number;
  lastVisitOn: string | null;
  tierName: string | null;
  openTasks: number;
}

export interface CrmNote {
  id: string;
  customerAccountId: string;
  vehicleId: string | null;
  body: string;
  pinned: boolean;
  authorName: string;
  createdAt: string;
}

export interface CrmTask {
  id: string;
  title: string;
  details: string | null;
  kind: string;
  status: "open" | "done" | "cancelled";
  customerAccountId: string | null;
  customerName: string | null;
  leadId: string | null;
  leadName: string | null;
  vehicleId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueOn: string | null;
  remindAt: string | null;
  overdue: boolean;
  reminderDue: boolean;
  completedAt: string | null;
  completedByName: string | null;
  createdByName: string;
  createdAt: string;
}

export interface TaskSummary {
  open: number;
  overdue: number;
  remindersDue: number;
  bookingRequests: number;
  unassigned: number;
}

export interface CrmLead {
  id: string;
  branchId: string | null;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  stage: string;
  stageLabel: string;
  isOpen: boolean;
  valueCents: number;
  ownerId: string | null;
  ownerName: string | null;
  nextStep: string | null;
  nextStepOn: string | null;
  nextStepOverdue: boolean;
  source: string | null;
  isDealer: boolean;
  notes: string | null;
  lostReason: string | null;
  customerAccountId: string | null;
  tasks?: CrmTask[];
}

export interface PipelineBoard {
  stages: { value: string; label: string; open: boolean; count: number; valueCents: number; leads: CrmLead[] }[];
  summary: { open: number; openValueCents: number; won: number; wonValueCents: number; lost: number };
}

export interface CrmSettings {
  quietStartMinutes: number;
  quietEndMinutes: number;
  reminderCooldownDays: number;
  lapsedAfterDays: number;
  campaignHourlyLimit: number;
  feedbackEnabled: boolean;
  loyaltyEnabled: boolean;
  loyaltyCentsPerPoint: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: "email" | "sms";
  channelLabel: string;
  purpose: string;
  purposeLabel: string;
  subject: string | null;
  body: string;
  placeholders: string[];
  isActive: boolean;
}

export interface TemplateMeta {
  channels: Option[];
  purposes: (Option & { consent: string | null })[];
  standardPlaceholders: string[];
}

export interface ReminderRuleRow {
  kind: string;
  label: string;
  hasLeadDays: boolean;
  rule: { id: string; enabled: boolean; templateId: string; templateName: string; leadDays: number | null } | null;
}

export interface CrmMessage {
  id: string;
  customerAccountId: string;
  customerName: string | null;
  channel: string;
  purpose: string;
  purposeLabel: string;
  toAddress: string | null;
  toName: string | null;
  subject: string | null;
  body: string;
  status: "queued" | "sent" | "failed" | "skipped";
  skipReason: string | null;
  sourceType: string;
  sendAfter: string | null;
  sentAt: string | null;
  failedReason: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface FeedbackAnswer {
  id: string;
  customerAccountId: string;
  customerName: string | null;
  invoiceId: string | null;
  workOrderId: string | null;
  detailingBookingId: string | null;
  respondedAt: string | null;
  score: number | null;
  band: "promoter" | "passive" | "detractor" | null;
  comment: string | null;
}

export interface NpsSummary {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null;
  requested: number;
}

export interface MembershipTier {
  id: string;
  name: string;
  discountPct: string;
  priorityBooking: boolean;
  freeAddonIds: string[];
  perks: string | null;
  isActive: boolean;
  position: number;
  members: number;
}

export interface Membership {
  id: string;
  tierId: string;
  tierName: string;
  discountPct: string;
  priorityBooking: boolean;
  perks: string | null;
  startedOn: string;
  expiresOn: string | null;
  status: string;
  inForce: boolean;
}

export interface PrepaidPlan {
  id: string;
  name: string;
  priceCents: number;
  credits: number;
  detailingPackageId: string | null;
  validDays: number | null;
  isActive: boolean;
}

export interface PrepaidPackage {
  id: string;
  reference: string;
  customerAccountId: string;
  customerName: string | null;
  planName: string;
  priceCents: number;
  creditsTotal: number;
  creditsUsed: number;
  creditsLeft: number;
  unearnedCents: number;
  detailingPackageId: string | null;
  soldOn: string;
  expiresOn: string | null;
  expired: boolean;
  usable: boolean;
  paymentMethod: string;
  soldByName: string;
}

export interface CustomerBenefits {
  customerAccountId: string;
  membership: Membership | null;
  packages: PrepaidPackage[];
  points: number;
}

export interface CrmSegment {
  id: string;
  name: string;
  description: string | null;
  filters: SegmentFilters;
  size: number | null;
}

/** In the API's field names: this object is sent back as it is. */
export interface SegmentFilters {
  min_spend_cents?: number;
  max_spend_cents?: number;
  visited_within_days?: number;
  not_visited_for_days?: number;
  makes?: string[];
  size_classes?: string[];
  tier_ids?: string[];
  branch_ids?: string[];
  account_type?: string;
  tags?: string[];
}

export interface CampaignProgress {
  audience: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  skippedByReason: Record<string, number>;
  remaining: number;
}

export interface CrmCampaign {
  id: string;
  name: string;
  segmentId: string;
  segmentName: string;
  templateId: string;
  templateName: string;
  channel: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  hourlyLimit: number | null;
  canEdit: boolean;
  canSchedule: boolean;
  canCancel: boolean;
  progress: CampaignProgress | null;
}

export interface TimelineEntry {
  at: string;
  kind: string;
  id: string;
  title: string;
  detail: string;
  href: string | null;
  branchName: string | null;
  amountCents: number | null;
}

export interface Customer360 {
  account: {
    id: string;
    displayName: string;
    accountType: string;
    status: string;
    tags: string[];
    isDealer: boolean;
    email: string | null;
    mobile: string | null;
    contactName: string | null;
    paymentTermsDays: number;
    creditLimitCents: number | null;
    source: string | null;
    customerSince: string;
  };
  summary: {
    vehicles: number;
    jobs: number;
    openJobs: number;
    bookings: number;
    billedCents: number;
    paidCents: number;
    balanceCents: number;
    lastVisitOn: string | null;
    points: number;
    openTasks: number;
    lastScore: number | null;
  };
  contacts: { id: string; name: string; role: string | null; mobile: string | null; email: string | null; isPrimary: boolean; receivesReminders: boolean }[];
  vehicles: { id: string; plateNumber: string; make: string | null; model: string | null; year: number | null; sizeClass: string | null; status: string; archived: boolean }[];
  workOrders: { id: string; reference: string; title: string; status: string; plateNumber: string | null; branchName: string | null; openedOn: string | null; completedOn: string | null; totalCents: number }[];
  invoices: { id: string; number: string; status: string; branchName: string | null; issueDate: string | null; dueDate: string | null; totalDueCents: number; balanceCents: number }[];
  payments: { id: string; number: string; status: string; methodLabel: string; amountCents: number; receivedOn: string; branchName: string | null }[];
  bookings: { id: string; reference: string; packageName: string; status: string; statusLabel: string; vehicleLabel: string | null; scheduledDate: string; branchName: string | null; packagePriceCents: number }[];
  consents: { purpose: string; label: string; granted: boolean | null; capturedAt: string | null; channel: string | null }[];
  notes: CrmNote[];
  tasks: CrmTask[];
  messages: CrmMessage[];
  feedback: FeedbackAnswer[];
  membership: Membership | null;
  memberships: Membership[];
  packages: PrepaidPackage[];
  timeline: TimelineEntry[];
}

/** What a message's public link shows. */
export interface ReminderLink {
  shop: string;
  shopPhone: string | null;
  customerName: string | null;
  headline: string;
  vehicle: { plateNumber: string; label: string } | null;
  booking: { mode: "online" | "request"; branchSlug: string | null };
  requested: boolean;
}

export interface FeedbackLink {
  shop: string;
  customerName: string;
  answered: boolean;
  score: number | null;
  band: string | null;
}

export interface UnsubscribeLink {
  shop: string;
  channel: string;
  purposeLabel: string;
  unsubscribed: boolean;
}
