import type {
  Capability,
} from "@/lib/rbac";
import type { UserRole, WorkOrder, WorkOrderStatus } from "@/types";

/**
 * The work order lifecycle, as one explicit machine.
 *
 * Transitions were previously implied by whichever store action happened to
 * guard against whichever status — `scheduleWorkOrder` checking for
 * `approved`, `sendForApproval` checking for `draft`, and so on. That works
 * until a new screen calls a different action and quietly moves an order
 * somewhere it should never have gone. Declaring the edges in one table means
 * a transition is legal or it isn't, and both the store and the UI read the
 * same answer.
 *
 * The lifecycle the brief describes —
 *
 *   Draft -> Pending Approval -> Approved/In Progress -> Ready for Billing -> Completed
 *
 * — is the happy path through the nine statuses this codebase already stores.
 * The mapping is deliberate rather than a rename, because the extra statuses
 * carry real distinctions that collapsing them would destroy:
 *
 *   Draft             draft
 *   Pending Approval  pending_approval
 *   Approved          approved | partially_approved  (a partial is a genuine
 *                     answer — "do the brakes, skip the shocks" — not a
 *                     half-finished approval)
 *   In Progress       scheduled | in_progress
 *   Ready for Billing closed with collectedAt still null
 *   Completed         closed with collectedAt set
 *
 * `declined` and `cancelled` sit outside the happy path and stay distinct:
 * a decline is a purchasing decision on the lines, a cancellation is the job
 * being abandoned. See `WorkOrderStatus` in `types/index.ts`.
 */

/** The coarse stage a user sees, derived from the stored status. */
export type LifecycleStage =
  | "draft"
  | "pending_approval"
  | "approved"
  | "in_progress"
  | "ready_for_billing"
  | "completed"
  | "declined"
  | "cancelled";

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  in_progress: "In progress",
  ready_for_billing: "Ready for billing",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

/**
 * Collapses the stored status into the stage the brief's workflow speaks in.
 *
 * Note the two `closed` cases: revenue is recognised on collection, not
 * completion (see `revenueBetween` in `lib/shop.ts`), so "the job is done" and
 * "the customer has the vehicle back" are different moments and the counter
 * works the gap between them.
 */
export function lifecycleStage(order: Pick<WorkOrder, "status" | "collectedAt">): LifecycleStage {
  switch (order.status) {
    case "draft":
      return "draft";
    case "pending_approval":
      return "pending_approval";
    case "approved":
    case "partially_approved":
      return "approved";
    case "scheduled":
    case "in_progress":
      return "in_progress";
    case "closed":
      return order.collectedAt ? "completed" : "ready_for_billing";
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * The legal edges. A status missing from a source's list cannot be reached
 * from it, full stop.
 *
 * `approved`/`partially_approved` are reachable from `pending_approval` but are
 * never *set* directly — `deriveOrderStatus` in `lib/approvals.ts` computes
 * them from the line set. They appear here so the edge is legal when that
 * derivation produces them.
 */
const TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  draft: ["pending_approval", "approved", "cancelled"],
  // `approved` is reachable directly for orders under the auto-approve ceiling.
  pending_approval: ["approved", "partially_approved", "declined", "cancelled"],
  approved: ["scheduled", "in_progress", "cancelled"],
  partially_approved: ["scheduled", "in_progress", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["closed", "cancelled"],
  // A declined quotation can be revised and re-sent rather than re-raised from
  // scratch — the alternative is losing the line history behind a new id.
  declined: ["draft", "cancelled"],
  // Terminal. Collection is tracked by `collectedAt`, not by a further status,
  // so that closing the books can't be undone by a status write.
  closed: [],
  cancelled: [],
};

/** Which capability a caller needs to drive an order into `to`. */
const REQUIRED_CAPABILITY: Partial<Record<WorkOrderStatus, Capability>> = {
  pending_approval: "workorder:update",
  approved: "workorder:approve",
  partially_approved: "workorder:approve",
  declined: "workorder:approve",
  scheduled: "workorder:update",
  in_progress: "workorder:update",
  closed: "workorder:complete",
  cancelled: "workorder:update",
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: WorkOrderStatus): readonly WorkOrderStatus[] {
  return TRANSITIONS[from];
}

/** The capability a transition into `to` demands, if any. */
export function capabilityFor(to: WorkOrderStatus): Capability | null {
  return REQUIRED_CAPABILITY[to] ?? null;
}

export type TransitionCheck =
  | { ok: true; capability: Capability | null }
  | { ok: false; reason: string };

/**
 * The single gate for "may this actor move this order there".
 *
 * Capability is checked by the caller against `lib/rbac.ts` — this returns
 * which capability is needed rather than resolving it, so the module stays a
 * pure function of the machine and doesn't need a session. As with everything
 * else on the client, this is a UI affordance: RLS and the store's tenancy
 * guards are the real boundary.
 */
export function checkTransition(
  order: Pick<WorkOrder, "status" | "lines">,
  to: WorkOrderStatus
): TransitionCheck {
  const from = order.status;

  if (from === to) {
    return { ok: false, reason: `This work order is already ${STAGE_LABEL[lifecycleStage({ status: to, collectedAt: null })].toLowerCase()}.` };
  }

  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: `A ${from.replace(/_/g, " ")} work order cannot become ${to.replace(/_/g, " ")}.`,
    };
  }

  // Nothing can be quoted, approved, or worked without something on it to bill.
  if (to === "pending_approval" && order.lines.length === 0) {
    return { ok: false, reason: "Add at least one line before sending this for approval." };
  }

  return { ok: true, capability: capabilityFor(to) };
}

/* ------------------------------------------------------------ order numbers */

/**
 * Order numbers are assigned at `draft -> pending_approval`, not at creation.
 *
 * A draft is the shop's own scratch space and may never leave it; burning a
 * sequential number on one leaves permanent gaps in the book and invites the
 * question "where did WO-2026-0031 go". The number is issued at the moment the
 * order becomes real to someone outside the shop.
 */
export const DRAFT_REFERENCE = "";

export function hasReference(order: Pick<WorkOrder, "reference">): boolean {
  return order.reference.trim().length > 0;
}

/** What to show for an order that hasn't been numbered yet. */
export function displayReference(order: Pick<WorkOrder, "reference">): string {
  return hasReference(order) ? order.reference : "Draft — not yet numbered";
}

const REFERENCE_PATTERN = /^WO-(\d{4})-(\d+)$/;

/**
 * Issues the next order number for a year.
 *
 * Derived from the highest number actually issued, not from a count of orders.
 * Counting is what the previous implementation did, and it was wrong twice
 * over: the list it counted was already narrowed to the caller's tenant scope,
 * so two fleet clients under one provider both produced `WO-2026-0001`; and a
 * deleted or filtered-out order made the count go backwards and collide with a
 * live number. Scanning for the maximum is gap-tolerant and stable under both.
 *
 * `existing` must be every order under the provider, unscoped by client —
 * the sequence belongs to the shop's book, which spans its clients.
 *
 * This is still a client-side generator and therefore not a uniqueness
 * guarantee: two advisors numbering simultaneously can race. The database
 * carries a unique index on `(reference)` so the loser's write fails and rolls
 * back rather than silently duplicating — see migration 0007.
 */
export function nextReference(
  existing: Pick<WorkOrder, "reference">[],
  year = new Date().getFullYear()
): string {
  let highest = 0;

  for (const order of existing) {
    const match = REFERENCE_PATTERN.exec(order.reference);
    if (!match) continue;
    if (Number(match[1]) !== year) continue;
    highest = Math.max(highest, Number(match[2]));
  }

  return `WO-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/* ------------------------------------------------------- approval assignment */

/**
 * What approval stamps onto an order besides its status.
 *
 * The brief calls for the job to be assigned to the default service provider
 * on approval. In this codebase that provider is the tenancy root, not a
 * `pms_vendors` row: `WorkOrder.vendor` means a *third-party* shop the work is
 * sent out to, and writing the provider's own name there would put it in the
 * vendor-spend analytics beside real subcontractors. So an approved job with no
 * external vendor is assigned to the owning provider and left in-house, with
 * `vendor` untouched.
 */
export interface ApprovalAssignment {
  assignedProviderId: string;
  /** Left as-is when the advisor already chose a subcontractor. */
  vendor: string;
}

export function assignOnApproval(
  order: Pick<WorkOrder, "vendor">,
  providerId: string
): ApprovalAssignment {
  return {
    assignedProviderId: providerId,
    vendor: order.vendor,
  };
}

/** Whether the work stays on the provider's own floor. */
export function isInHouse(order: Pick<WorkOrder, "vendor">): boolean {
  return order.vendor.trim().length === 0;
}
