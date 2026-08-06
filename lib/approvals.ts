import { addDays, isSameDay, isWeekend, startOfDay } from "date-fns";
import type {
  ApprovalSettings,
  LineApprovalStatus,
  UserRole,
  WorkOrderLine,
  WorkOrderStatus,
} from "@/types";

export const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = {
  autoApproveUnder: 5_000,
  opsApprovalUnder: 50_000,
  slaHours: 4,
  varianceThresholdPct: 15,
  defaultPartsSource: "supplier_provided",
  monthlyBudget: 150_000,
};

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;

export function lineCost(line: WorkOrderLine) {
  return line.partCost + line.labourCost;
}

/** Sum of `partCost + labourCost` across lines carrying one approval status. */
export function sumLinesByStatus(lines: WorkOrderLine[], status: LineApprovalStatus) {
  return lines
    .filter((line) => line.approvalStatus === status)
    .reduce((total, line) => total + lineCost(line), 0);
}

export const pendingValue = (lines: WorkOrderLine[]) => sumLinesByStatus(lines, "pending");
export const approvedValue = (lines: WorkOrderLine[]) => sumLinesByStatus(lines, "approved");
export const declinedValue = (lines: WorkOrderLine[]) => sumLinesByStatus(lines, "declined");

export type ApproverBand = "auto" | "operations" | "fleet_manager";

/**
 * Which band a work order's pending value falls into. Evaluated against the
 * order's total pending value, not any single line — a ₱3,000 line inside a
 * ₱60,000 order still needs a Fleet Manager, because approval fatigue is what
 * kills this feature if the auto-approve band isn't real.
 */
export function requiredApprover(
  pendingValue: number,
  settings: ApprovalSettings
): ApproverBand {
  if (pendingValue < settings.autoApproveUnder) return "auto";
  if (pendingValue <= settings.opsApprovalUnder) return "operations";
  return "fleet_manager";
}

/**
 * Whether `role` may approve/decline lines given the order's current pending
 * value. The one place the threshold bands are evaluated for a person, so
 * Settings and every approval button in the UI read the same logic.
 */
export function canApprove(
  role: UserRole,
  orderPendingValue: number,
  settings: ApprovalSettings
): boolean {
  if (role === "fleet_manager") return true;
  if (role === "operations" || role === "purchasing_officer") {
    return orderPendingValue <= settings.opsApprovalUnder;
  }
  return false;
}

type ApprovalStageStatus = Extract<
  WorkOrderStatus,
  "pending_approval" | "approved" | "partially_approved" | "declined"
>;

/**
 * The order's status is always a function of its lines while it's still in
 * the approval stage — never set directly. Any line still `pending` keeps
 * the whole order waiting; once every line is decided, the order reads
 * `approved` (all approved), `declined` (nothing approved — `deferred` lines
 * count as not-approved here, since nothing on the order can proceed yet),
 * or `partially_approved` (a genuine mix).
 */
export function deriveOrderStatus(lines: WorkOrderLine[]): ApprovalStageStatus {
  if (lines.length === 0) return "approved";
  if (lines.some((line) => line.approvalStatus === "pending")) return "pending_approval";

  const approved = lines.filter((line) => line.approvalStatus === "approved");
  if (approved.length === lines.length) return "approved";
  if (approved.length === 0) return "declined";
  return "partially_approved";
}

/** Whether the actual cost at close-out has drifted far enough to need re-approval. */
export function varianceExceeds(
  approvedTotal: number,
  actualTotal: number,
  thresholdPct: number
) {
  return actualTotal > approvedTotal * (1 + thresholdPct / 100);
}

/**
 * Working hours between two instants, Mon–Fri 08:00–18:00. Used both for the
 * SLA-breach check on lines still waiting and for the "approval wait time"
 * metric stamped once a line is resolved — weekends and after-hours don't
 * count against either, since nobody is expected to be approving purchases
 * at midnight on a Sunday.
 */
export function businessHoursBetween(from: Date, to: Date): number {
  if (to <= from) return 0;

  let hours = 0;
  let cursor = startOfDay(from);
  const lastDay = startOfDay(to);

  while (cursor <= lastDay) {
    if (!isWeekend(cursor)) {
      const dayStart = new Date(cursor);
      dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(BUSINESS_END_HOUR, 0, 0, 0);

      const windowStart = isSameDay(cursor, from) && from > dayStart ? from : dayStart;
      const windowEnd = isSameDay(cursor, to) && to < dayEnd ? to : dayEnd;

      const overlapMs = Math.max(0, windowEnd.getTime() - windowStart.getTime());
      hours += overlapMs / 3_600_000;
    }
    cursor = addDays(cursor, 1);
  }

  return Math.round(hours * 10) / 10;
}
