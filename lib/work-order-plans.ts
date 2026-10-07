import type {
  ApprovalLogEntry,
  ApprovalSettings,
  PartLine,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
  WorkOrderStatus,
} from "@/types";
import { computeTotals, recalcLine, roundMoney } from "@/lib/billing";
import {
  approvedValue,
  businessHoursBetween,
  deriveOrderStatus,
  lineCost,
  requiredApprover,
  varianceExceeds,
} from "@/lib/approvals";
import { assignOnApproval, checkTransition, hasReference } from "@/lib/work-order-machine";

/**
 * What each work-order command *does*, as pure functions.
 *
 * A server command (server/commands/work-orders.ts) loads and locks rows, calls
 * one of these, and writes what it returns. The browser store calls the same
 * functions to draw its optimistic state — so the preview and the committed
 * result are computed by the same code and only differ if the server's view of
 * the order (or the user's authority) differs from the browser's.
 *
 * Nothing here reads a clock, generates an id, or touches a database: `now`,
 * `newId` and the actor are passed in. That is what makes the rules unit-
 * testable and the commands deterministic under test (Standing Rule R4).
 */

/** Why a plan was refused. Commands map this onto their result codes. */
export class PlanError extends Error {
  constructor(
    readonly kind: "validation" | "invalid_transition" | "forbidden",
    message: string
  ) {
    super(message);
    this.name = "PlanError";
  }
}

export interface PlanActor {
  /** The auth user id — what the approval log records as `actorId`. */
  id: string;
  /** Display name, recorded on events and log entries. */
  name: string;
}

export interface PlanContext {
  actor: PlanActor;
  /** The order's owning client — stamped on every approval-log entry. */
  fleetClientId: string;
  /** The provider that owns that client — assigned on approval. */
  providerId: string;
  now: Date;
  newId: () => string;
}

function event(ctx: PlanContext, status: WorkOrderStatus): WorkOrderEvent {
  return { id: ctx.newId(), status, at: ctx.now.toISOString(), actor: ctx.actor.name };
}

function transitionOrThrow(order: WorkOrder, to: WorkOrderStatus) {
  const check = checkTransition(order, to);
  if (!check.ok) throw new PlanError("invalid_transition", check.reason);
  return check;
}

/* ------------------------------------------------------------------ lines */

/**
 * What a caller may say about a line: what it is and its quantities and
 * rates. Never its extended amounts and never its approval state.
 */
export interface LineIntent {
  description: string;
  category: WorkOrderLine["category"];
  quantity: number;
  unitPartRate: number;
  labourHours: number;
  labourRate: number;
  urgency: WorkOrderLine["urgency"];
  partsSource: WorkOrderLine["partsSource"];
  photoUrls: string[];
  serviceTaskId?: string | null;
}

/**
 * A new pending line, priced from its inputs.
 *
 * Built field by field rather than by spreading the intent, so a `partCost`
 * or `approvalStatus` smuggled onto the input object cannot survive into the
 * line. `recalcLine` is then the only thing that sets the extended amounts.
 */
export function priceLine(intent: LineIntent, id: string): WorkOrderLine {
  return recalcLine({
    id,
    serviceTaskId: intent.serviceTaskId ?? null,
    description: intent.description,
    category: intent.category,
    quantity: intent.quantity,
    unitPartRate: intent.unitPartRate,
    labourHours: intent.labourHours,
    labourRate: intent.labourRate,
    partCost: 0,
    labourCost: 0,
    urgency: intent.urgency,
    partsSource: intent.partsSource,
    approvalStatus: "pending",
    approvedBy: null,
    approvedAt: null,
    declineReason: null,
    photoUrls: [...intent.photoUrls],
  });
}

/**
 * The order-level estimate implied by its lines. An order with lines carries
 * their sum (rounded once per total, R6); a line-less order keeps whatever
 * estimate it was given, since there is nothing to derive it from.
 */
export function estimateFromLines(
  lines: WorkOrderLine[],
  fallback: { laborCost: number; partsCost: number }
): { laborCost: number; partsCost: number } {
  if (lines.length === 0) return fallback;
  return {
    laborCost: roundMoney(lines.reduce((sum, line) => sum + line.labourCost, 0)),
    partsCost: roundMoney(lines.reduce((sum, line) => sum + line.partCost, 0)),
  };
}

/* ----------------------------------------------------------------- create */

/** The header fields a caller supplies for a new order. */
export interface NewOrderHeader {
  vehicleId: string;
  title: string;
  type: WorkOrder["type"];
  priority: WorkOrder["priority"];
  openedOn: string;
  scheduledFor: string;
  scheduledTime: string | null;
  bayId: string | null;
  odometerAtService: number;
  technician: string;
  vendor: string;
  laborCost: number;
  partsCost: number;
  findings: string;
  taskIds: string[];
  notes: string;
}

/**
 * Where a new order opens.
 *
 * Every job is a purchase before it is a repair: under the auto-approve
 * ceiling it opens already approved, otherwise it opens with the client. The
 * band runs on the pre-tax line value — nobody approves VAT. A draft is the
 * shop's own scratch space and is neither priced against a band nor numbered.
 */
export function openingStatus(
  lines: WorkOrderLine[],
  settings: ApprovalSettings,
  asDraft: boolean
): { status: WorkOrderStatus; autoApprove: boolean } {
  if (asDraft) return { status: "draft", autoApprove: false };
  const total = lines.reduce((sum, line) => sum + lineCost(line), 0);
  const autoApprove = requiredApprover(total, settings) === "auto";
  return { status: autoApprove ? "approved" : "pending_approval", autoApprove };
}

export function planNewWorkOrder(args: {
  id: string;
  header: NewOrderHeader;
  lines: WorkOrderLine[];
  settings: ApprovalSettings;
  asDraft: boolean;
  /** "" for a draft; otherwise the number issued for this order. */
  reference: string;
  ctx: PlanContext;
}): WorkOrder {
  const { header, settings, ctx } = args;
  const { status: opening, autoApprove } = openingStatus(args.lines, settings, args.asDraft);
  const at = ctx.now.toISOString();

  const lines: WorkOrderLine[] = autoApprove
    ? args.lines.map((line) => ({
        ...line,
        approvalStatus: "approved",
        approvedBy: "System (auto-approval)",
        approvedAt: at,
      }))
    : args.lines;

  // Same derivation the approval stage uses, so an auto-approved order reads
  // exactly as one approved line by line would.
  const status = args.asDraft ? opening : deriveOrderStatus(lines);

  const approvalLog: ApprovalLogEntry[] = autoApprove
    ? lines.map((line) => ({
        id: ctx.newId(),
        fleetClientId: ctx.fleetClientId,
        lineId: line.id,
        action: "auto_approved",
        actorId: "system",
        actorName: "System (auto-approval)",
        at,
        note: null,
        amountAtTime: lineCost(line),
      }))
    : [];

  const estimate = estimateFromLines(lines, {
    laborCost: header.laborCost,
    partsCost: header.partsCost,
  });

  return {
    ...header,
    ...estimate,
    id: args.id,
    reference: args.reference,
    status,
    completedOn: null,
    // Auto-approval is still approval: the job is assigned on the spot.
    assignedProviderId: autoApprove
      ? assignOnApproval({ vendor: header.vendor }, ctx.providerId).assignedProviderId
      : null,
    collectedAt: null,
    collectedBy: null,
    parts: [],
    lines,
    approvalLog,
    pendingApprovalEnteredAt: status === "pending_approval" ? at : null,
    approvalWaitHours: null,
    history: [event(ctx, status)],
  };
}

/* ------------------------------------------------------------ draft edits */

export type DraftPatch = Partial<
  Pick<
    WorkOrder,
    | "title"
    | "type"
    | "priority"
    | "scheduledFor"
    | "scheduledTime"
    | "bayId"
    | "technician"
    | "vendor"
    | "notes"
    | "taskIds"
    | "laborCost"
    | "partsCost"
  >
>;

/**
 * Edits an order that has not been quoted yet. A declined quotation can be
 * revised: editing it moves it back to `draft` (the machine's declined ->
 * draft edge) so it can be re-sent, keeping its number and line history.
 */
export function planDraftEdit(
  order: WorkOrder,
  patch: DraftPatch,
  ctx: PlanContext
): { order: WorkOrder; event: WorkOrderEvent | null } {
  if (order.status !== "draft" && order.status !== "declined") {
    throw new PlanError(
      "invalid_transition",
      "Only a draft or a declined quotation can be edited."
    );
  }

  const reopening = order.status === "declined";
  if (reopening) transitionOrThrow(order, "draft");
  const reopened = reopening ? event(ctx, "draft") : null;

  // A priced order's estimate follows its lines; only a line-less one accepts
  // a typed-in figure.
  const estimate = estimateFromLines(order.lines, {
    laborCost: patch.laborCost ?? order.laborCost,
    partsCost: patch.partsCost ?? order.partsCost,
  });

  return {
    order: {
      ...order,
      ...patch,
      ...estimate,
      status: "draft",
      history: reopened ? [...order.history, reopened] : order.history,
    },
    event: reopened,
  };
}

/**
 * Adds, edits, and removes lines on a draft. Existing lines are re-priced
 * from their new inputs through `recalcLine`; nothing else may write their
 * extended amounts. Once quoted, lines are the client's to decide on and are
 * no longer editable — an approved amount is the historical price.
 */
export function planRecordLines(
  order: WorkOrder,
  upserts: (LineIntent & { id?: string | null })[],
  removeIds: string[],
  newId: () => string
): {
  order: WorkOrder;
  inserted: WorkOrderLine[];
  updated: WorkOrderLine[];
  removed: string[];
} {
  if (order.status !== "draft") {
    throw new PlanError(
      "invalid_transition",
      "Lines can only be changed while the work order is a draft."
    );
  }

  const existing = new Map(order.lines.map((line) => [line.id, line]));
  for (const id of removeIds) {
    if (!existing.has(id)) throw new PlanError("validation", "That line isn't on this work order.");
  }

  const inserted: WorkOrderLine[] = [];
  const updated: WorkOrderLine[] = [];
  const byId = new Map(order.lines.map((line) => [line.id, line]));

  for (const intent of upserts) {
    if (intent.id) {
      const current = existing.get(intent.id);
      if (!current) throw new PlanError("validation", "That line isn't on this work order.");
      // Re-priced, but its identity and (pending) approval state are kept.
      const repriced = priceLine(intent, current.id);
      byId.set(current.id, repriced);
      updated.push(repriced);
    } else {
      const created = priceLine(intent, newId());
      byId.set(created.id, created);
      inserted.push(created);
    }
  }
  for (const id of removeIds) byId.delete(id);

  const lines = [...byId.values()];
  return {
    order: {
      ...order,
      ...estimateFromLines(lines, { laborCost: order.laborCost, partsCost: order.partsCost }),
      lines,
    },
    inserted,
    updated,
    removed: removeIds,
  };
}

/* -------------------------------------------------------- send for approval */

/**
 * The provider's half of the approval loop. The draft leaves the shop: every
 * line is put back to `pending` so the client decides on the full set, the
 * order earns its number now (a re-sent order keeps the one it already has),
 * and the send is written into the append-only approval log.
 */
export function planSendForApproval(
  order: WorkOrder,
  issueReference: () => string,
  ctx: PlanContext
): {
  order: WorkOrder;
  resetLineIds: string[];
  logEntry: ApprovalLogEntry;
  event: WorkOrderEvent;
  referenceIssued: boolean;
} {
  if (order.status === "pending_approval") {
    throw new PlanError("invalid_transition", "This quotation is already with the client.");
  }
  transitionOrThrow(order, "pending_approval");

  const at = ctx.now.toISOString();
  const resetLineIds = order.lines
    .filter((line) => line.approvalStatus !== "pending")
    .map((line) => line.id);
  const lines = order.lines.map((line) =>
    line.approvalStatus === "pending" ? line : { ...line, approvalStatus: "pending" as const }
  );

  const referenceIssued = !hasReference(order);
  const reference = referenceIssued ? issueReference() : order.reference;

  const logEntry: ApprovalLogEntry = {
    id: ctx.newId(),
    fleetClientId: ctx.fleetClientId,
    lineId: null,
    action: "sent_for_approval",
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    at,
    note: `Quotation sent for ${lines.length} ${lines.length === 1 ? "line" : "lines"}.`,
    amountAtTime: lines.reduce((total, line) => total + lineCost(line), 0),
  };
  const sent = event(ctx, "pending_approval");

  return {
    order: {
      ...order,
      reference,
      lines,
      status: "pending_approval",
      pendingApprovalEnteredAt: at,
      approvalWaitHours: null,
      approvalLog: [...order.approvalLog, logEntry],
      history: [...order.history, sent],
    },
    resetLineIds,
    logEntry,
    event: sent,
    referenceIssued,
  };
}

/* --------------------------------------------------------- line decisions */

export interface LineDecision {
  lineId: string;
  decision: "approved" | "declined" | "deferred";
  note?: string | null;
}

/**
 * Approves, declines, or defers lines. The order's status is never set — it
 * is re-derived from the full line set — and leaving `pending_approval`
 * stamps how long it actually waited, in business hours. Approval (partial
 * included) assigns the job to the owning provider.
 *
 * Only an order that is with the client can be decided on: approving lines on
 * a draft would move it past `pending_approval` without ever issuing it a
 * number.
 */
export function applyLineDecisions(
  order: WorkOrder,
  decisions: LineDecision[],
  ctx: PlanContext
): {
  order: WorkOrder;
  changedLines: WorkOrderLine[];
  logEntries: ApprovalLogEntry[];
  event: WorkOrderEvent | null;
} {
  if (order.status !== "pending_approval") {
    throw new PlanError("invalid_transition", "This work order isn't awaiting approval.");
  }
  if (decisions.length === 0) throw new PlanError("validation", "No decisions were given.");

  const seen = new Set<string>();
  for (const { lineId, decision, note } of decisions) {
    if (seen.has(lineId)) throw new PlanError("validation", "A line was decided twice.");
    seen.add(lineId);
    const line = order.lines.find((candidate) => candidate.id === lineId);
    if (!line) throw new PlanError("validation", "That line isn't on this work order.");
    if (line.approvalStatus !== "pending") {
      throw new PlanError("invalid_transition", `"${line.description}" has already been decided.`);
    }
    if (decision === "declined" && !note?.trim()) {
      throw new PlanError("validation", "Give a reason for declining.");
    }
  }

  const at = ctx.now.toISOString();
  const byLine = new Map(decisions.map((d) => [d.lineId, d]));
  const changedLines: WorkOrderLine[] = [];

  const lines = order.lines.map((line) => {
    const decided = byLine.get(line.id);
    if (!decided) return line;
    const next: WorkOrderLine = {
      ...line,
      approvalStatus: decided.decision,
      approvedBy: ctx.actor.name,
      approvedAt: at,
      declineReason: decided.decision === "declined" ? decided.note?.trim() ?? "" : null,
    };
    changedLines.push(next);
    return next;
  });

  const logEntries: ApprovalLogEntry[] = changedLines.map((line) => ({
    id: ctx.newId(),
    fleetClientId: ctx.fleetClientId,
    lineId: line.id,
    action: line.approvalStatus as ApprovalLogEntry["action"],
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    at,
    note: byLine.get(line.id)?.note?.trim() || null,
    amountAtTime: lineCost(line),
  }));

  const status = deriveOrderStatus(lines);
  if (status !== order.status) transitionOrThrow(order, status);

  const leavingPending = status !== "pending_approval" && order.pendingApprovalEnteredAt;
  const approvalWaitHours = leavingPending
    ? businessHoursBetween(new Date(order.pendingApprovalEnteredAt as string), ctx.now)
    : order.approvalWaitHours;

  const approvedNow = status === "approved" || status === "partially_approved";
  const assignedProviderId =
    approvedNow && !order.assignedProviderId
      ? assignOnApproval(order, ctx.providerId).assignedProviderId
      : order.assignedProviderId;

  const changed = status !== order.status ? event(ctx, status) : null;

  return {
    order: {
      ...order,
      lines,
      status,
      assignedProviderId,
      pendingApprovalEnteredAt: status === "pending_approval" ? order.pendingApprovalEnteredAt : null,
      approvalWaitHours,
      approvalLog: [...order.approvalLog, ...logEntries],
      history: changed ? [...order.history, changed] : order.history,
    },
    changedLines,
    logEntries,
    event: changed,
  };
}

/* ------------------------------------------------------ simple transitions */

/**
 * A status move with no side effects beyond the fields given — schedule,
 * start, cancel. The machine decides legality; this only records it.
 */
export function planTransition(
  order: WorkOrder,
  to: Extract<WorkOrderStatus, "scheduled" | "in_progress" | "cancelled">,
  fields: Partial<Pick<WorkOrder, "scheduledFor" | "scheduledTime" | "bayId">>,
  ctx: PlanContext
): { order: WorkOrder; event: WorkOrderEvent } {
  transitionOrThrow(order, to);
  const moved = event(ctx, to);
  return {
    order: { ...order, ...fields, status: to, history: [...order.history, moved] },
    event: moved,
  };
}

/* ---------------------------------------------------- completion & close */

export interface CompletionDetail {
  odometer?: number;
  findings?: string;
  parts?: PartLine[];
  taskIds?: string[];
}

/** The service record — findings, reading, parts fitted, tasks covered. */
export function applyCompletionDetail(order: WorkOrder, detail: CompletionDetail): WorkOrder {
  return {
    ...order,
    odometerAtService: detail.odometer ?? order.odometerAtService,
    findings: detail.findings ?? order.findings,
    parts: detail.parts ?? order.parts,
    taskIds: detail.taskIds ?? order.taskIds,
  };
}

/**
 * Records the service record on a job that is still being worked. Does not
 * close it — closing is what resets the PMS clock, and is its own decision.
 */
export function planRecordCompletion(order: WorkOrder, detail: CompletionDetail): WorkOrder {
  if (order.status !== "in_progress") {
    throw new PlanError(
      "invalid_transition",
      "A service record can only be recorded on a job in progress."
    );
  }
  return applyCompletionDetail(order, detail);
}

/**
 * Actual versus authorised, both pre-tax like the approval bands. Actual
 * labour comes from the approved lines — `order.laborCost` is only the
 * creation-time estimate and goes stale once lines are itemised.
 */
export function closeVariance(order: WorkOrder, settings: ApprovalSettings) {
  const partsTotal = roundMoney(
    order.parts.reduce((total, part) => total + part.quantity * part.unitCost, 0)
  );
  const labourTotal = computeTotals(order.lines, settings, ["approved"]).labourTotal;
  const actualTotal = roundMoney(labourTotal + partsTotal);
  const approvedTotal = approvedValue(order.lines);
  return {
    actualTotal,
    approvedTotal,
    breaches: varianceExceeds(approvedTotal, actualTotal, settings.varianceThresholdPct),
  };
}

/**
 * Closes a job. If the actual cost has drifted past the approved amount by
 * more than the variance threshold, closing is refused unless the variance is
 * explicitly re-approved, which is itself logged.
 *
 * `completedOn` is the business (Manila) date — the caller passes it in.
 */
export function planClose(
  order: WorkOrder,
  detail: CompletionDetail,
  settings: ApprovalSettings,
  options: { varianceApproved: boolean; completedOn: string },
  ctx: PlanContext
): { order: WorkOrder; varianceEntry: ApprovalLogEntry | null; event: WorkOrderEvent } {
  transitionOrThrow(order, "closed");

  const recorded = applyCompletionDetail(order, detail);
  const { actualTotal, approvedTotal, breaches } = closeVariance(recorded, settings);

  if (breaches && !options.varianceApproved) {
    throw new PlanError(
      "validation",
      `Actual cost (₱${actualTotal.toLocaleString()}) exceeds the approved ₱${approvedTotal.toLocaleString()} by more than ${settings.varianceThresholdPct}% — re-approve the variance before closing.`
    );
  }

  const varianceEntry: ApprovalLogEntry | null = breaches
    ? {
        id: ctx.newId(),
        fleetClientId: ctx.fleetClientId,
        lineId: null,
        action: "variance_approved",
        actorId: ctx.actor.id,
        actorName: ctx.actor.name,
        at: ctx.now.toISOString(),
        note: `Actual ₱${actualTotal.toLocaleString()} vs approved ₱${approvedTotal.toLocaleString()}.`,
        amountAtTime: actualTotal,
      }
    : null;

  const closed = event(ctx, "closed");
  return {
    order: {
      ...recorded,
      status: "closed",
      completedOn: options.completedOn,
      approvalLog: varianceEntry ? [...recorded.approvalLog, varianceEntry] : recorded.approvalLog,
      history: [...recorded.history, closed],
    },
    varianceEntry,
    event: closed,
  };
}

/* -------------------------------------------------------------- collection */

/** Whether an order can be handed back: closed, and not already collected. */
export function isCollectable(order: Pick<WorkOrder, "status" | "collectedAt">): boolean {
  return order.status === "closed" && !order.collectedAt;
}
