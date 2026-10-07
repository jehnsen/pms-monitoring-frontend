import "server-only";

import type { FleetClient, PartLine, Vehicle, WorkOrder } from "@/types";
import { applyCompletion } from "@/lib/pms";
import { canApprove, pendingValue } from "@/lib/approvals";
import { businessDate, businessYear } from "@/lib/business-date";
import { capabilityFor, checkTransition, hasReference } from "@/lib/work-order-machine";
import { vehicleToRow } from "@/lib/mappers";
import {
  applyLineDecisions,
  isCollectable,
  openingStatus,
  planClose,
  planDraftEdit,
  planNewWorkOrder,
  planRecordCompletion,
  planRecordLines,
  planSendForApproval,
  planTransition,
  priceLine,
  type CompletionDetail,
  type NewOrderHeader,
  type PlanContext,
} from "@/lib/work-order-plans";
import {
  requireCapability,
  runCommand,
  type CommandDeps,
  type CommandScope,
  type VerifiedUser,
} from "@/server/commands/context";
import { CommandError, type CommandResult } from "@/server/commands/result";
import * as v from "@/server/commands/validate";
import {
  catalogues,
  effectiveSettings,
  insertApprovalLog,
  insertEvent,
  insertLines,
  insertOrder,
  issueReference,
  lockOwnedOrder,
  readVehicle,
  readWorkOrder,
  replaceParts,
  replaceTasks,
  requireServiceTasks,
  updateLine,
  updateOrder,
} from "@/server/commands/work-order-repo";

/**
 * Work-order and approval commands — the only writers of pms_work_orders and
 * its child tables (migration 0010 revoked the browser's write grants).
 *
 * Every command has the same shape (Standing Rule R3):
 *
 *   runCommand(label, deps, user, capability, async (c) => {
 *     parse the input            — server/commands/validate.ts
 *     lock what is read          — SELECT ... FOR UPDATE via lockOwnedOrder
 *     decide                     — a pure planner from lib/work-order-plans.ts
 *     write rows + event + log   — all inside this one transaction
 *     return canonical rows      — re-read and mapped through lib/mappers.ts
 *   })
 *
 * The caller never supplies an id for a new row, an extended cost, a status,
 * or an approval stamp. It says what it wants (a vehicle, quantities and
 * rates, a decision on a line id); the server derives the rest.
 */

export type WorkOrderData = { order: WorkOrder };

function planContext(c: CommandScope, client: FleetClient): PlanContext {
  return {
    actor: c.actor,
    fleetClientId: client.id,
    providerId: client.providerId,
    now: c.now,
    newId: c.newId,
  };
}

/** Re-reads an order after writing it — the row the browser should hold. */
async function canonical(c: CommandScope, orderId: string): Promise<WorkOrder> {
  const order = await readWorkOrder(c.tx, orderId, { lock: false });
  if (!order) throw new CommandError("conflict", "That work order could not be read back.");
  return order;
}

function orderIdOf(input: unknown) {
  const o = v.obj(input);
  return { o, orderId: v.id(o, "orderId") };
}

/* ================================================================= create */

/**
 * Raises a work order. Under the client's auto-approve ceiling it opens
 * approved (and numbered, and assigned); otherwise it opens with the client
 * for approval. `asDraft` opens it as the shop's unnumbered scratch space.
 *
 * Bands are the vehicle's *client's* effective bands — its overrides folded
 * over the provider's defaults — whoever is raising the order.
 */
export function createWorkOrder(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<WorkOrderData>> {
  return runCommand("createWorkOrder", deps, user, "workorder:create", async (c) => {
    const o = v.obj(input);
    const vehicleId = v.id(o, "vehicleId");
    const lineIntents = v.list(o, "lines", 100).map(v.lineIntent);
    const asDraft = v.bool(o, "asDraft");

    const vehicle = await readVehicle(c.tx, vehicleId, false);
    const client = vehicle && c.fleetClients.find((fc) => fc.id === vehicle.fleetClientId);
    if (!vehicle || !client || !c.visibleClientIds.has(client.id)) {
      throw new CommandError("out_of_scope", "That vehicle isn't in your fleet.");
    }

    const header: NewOrderHeader = {
      vehicleId: vehicle.id,
      title: v.text(o, "title", { required: true, max: 300 }),
      type: v.oneOf(o, "type", v.WORK_ORDER_TYPES),
      priority: v.oneOf(o, "priority", v.PRIORITIES, "medium"),
      openedOn: v.date(o, "openedOn") || businessDate(c.now),
      scheduledFor: v.date(o, "scheduledFor"),
      scheduledTime: v.time(o, "scheduledTime"),
      bayId: v.optionalText(o, "bayId", 100) || null,
      odometerAtService: Math.round(
        v.num(o, "odometerAtService", { min: 0, fallback: vehicle.odometer })
      ),
      technician: v.text(o, "technician", { max: 200 }),
      vendor: v.text(o, "vendor", { max: 200 }),
      laborCost: v.num(o, "laborCost", { min: 0, fallback: 0 }),
      partsCost: v.num(o, "partsCost", { min: 0, fallback: 0 }),
      findings: v.text(o, "findings", { max: 5000 }),
      taskIds: v.idList(o, "taskIds"),
      notes: v.text(o, "notes", { max: 5000 }),
    };

    const lineTaskIds = lineIntents.map((l) => l.serviceTaskId).filter(Boolean) as string[];
    await requireServiceTasks(c.tx, client.providerId, [
      ...new Set([...header.taskIds, ...lineTaskIds]),
    ]);

    const settings = await effectiveSettings(c.tx, client);
    const lines = lineIntents.map((intent) => priceLine(intent, c.newId()));
    const { status } = openingStatus(lines, settings, asDraft);
    const reference = status === "draft" ? "" : await issueReference(c.tx, businessYear(c.now));

    const order = planNewWorkOrder({
      id: c.newId(),
      header,
      lines,
      settings,
      asDraft,
      reference,
      ctx: planContext(c, client),
    });

    // Parent first, so every child's foreign key has something to point at.
    await insertOrder(c.tx, order, await catalogues(c.tx, client.providerId));
    await insertLines(c.tx, order.id, order.lines);
    await replaceTasks(c.tx, order.id, order.taskIds);
    await insertEvent(c.tx, order.id, order.history[0]);
    await insertApprovalLog(c.tx, order.id, order.approvalLog);

    return { order: await canonical(c, order.id) };
  });
}

/* ============================================================ draft edits */

/** Edits a draft's header. Editing a declined quotation reopens it as a draft. */
export function updateDraft(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<WorkOrderData>> {
  return runCommand("updateDraft", deps, user, "workorder:update", async (c) => {
    const { o, orderId } = orderIdOf(input);
    const patch = v.draftPatch(v.obj(o.patch ?? {}, "patch"));

    const { order, client } = await lockOwnedOrder(c, orderId);
    if (patch.taskIds) await requireServiceTasks(c.tx, client.providerId, patch.taskIds);

    const plan = planDraftEdit(order, patch, planContext(c, client));

    const { taskIds, technician, vendor, ...header } = patch;
    const namesChanged = technician !== undefined || vendor !== undefined;
    await updateOrder(
      c.tx,
      order.id,
      {
        ...header,
        ...(technician !== undefined ? { technician } : {}),
        ...(vendor !== undefined ? { vendor } : {}),
        status: plan.order.status,
        laborCost: plan.order.laborCost,
        partsCost: plan.order.partsCost,
      },
      // Names resolve to catalogue FKs only when they are what changed;
      // otherwise the existing FKs are left alone.
      namesChanged ? await catalogues(c.tx, client.providerId) : undefined
    );
    if (taskIds) await replaceTasks(c.tx, order.id, taskIds);
    if (plan.event) await insertEvent(c.tx, order.id, plan.event);

    return { order: await canonical(c, order.id) };
  });
}

/**
 * Adds, edits and removes a draft's lines. The caller sends quantities and
 * rates; every extended amount is recomputed here through `recalcLine`.
 */
export function recordLines(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<WorkOrderData>> {
  return runCommand("recordLines", deps, user, "workorder:update", async (c) => {
    const { o, orderId } = orderIdOf(input);
    const upserts = v.list(o, "upserts", 100).map(v.lineIntent);
    const removeIds = v.idList(o, "removeIds");

    const { order, client } = await lockOwnedOrder(c, orderId);
    const lineTaskIds = upserts.map((l) => l.serviceTaskId).filter(Boolean) as string[];
    await requireServiceTasks(c.tx, client.providerId, [...new Set(lineTaskIds)]);

    const plan = planRecordLines(order, upserts, removeIds, c.newId);

    if (plan.removed.length > 0) {
      await c.tx.delete("pms_work_order_lines", { id: plan.removed, work_order_id: order.id });
    }
    await insertLines(c.tx, order.id, plan.inserted);
    for (const line of plan.updated) await updateLine(c.tx, order.id, line);
    await updateOrder(c.tx, order.id, {
      laborCost: plan.order.laborCost,
      partsCost: plan.order.partsCost,
    });

    return { order: await canonical(c, order.id) };
  });
}

/* ============================================================== approval */

/** Quotes a draft to its client: numbers it, resets its lines, logs the send. */
export function sendForApproval(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<WorkOrderData>> {
  return runCommand("sendForApproval", deps, user, null, async (c) => {
    const { orderId } = orderIdOf(input);
    const { order, client } = await lockOwnedOrder(c, orderId);
    requireCapability(c, capabilityFor("pending_approval"));

    // Only take the numbering lock for a send that is actually going ahead and
    // needs a number; the planner repeats the legality check authoritatively.
    const legal =
      order.status !== "pending_approval" && checkTransition(order, "pending_approval").ok;
    const issued =
      legal && !hasReference(order) ? await issueReference(c.tx, businessYear(c.now)) : "";

    const plan = planSendForApproval(order, () => issued, planContext(c, client));

    await updateOrder(c.tx, order.id, {
      status: plan.order.status,
      reference: plan.order.reference,
      pendingApprovalEnteredAt: plan.order.pendingApprovalEnteredAt,
      approvalWaitHours: null,
    });
    if (plan.resetLineIds.length > 0) {
      await c.tx.update(
        "pms_work_order_lines",
        { id: plan.resetLineIds, work_order_id: order.id },
        { approval_status: "pending" }
      );
    }
    await insertApprovalLog(c.tx, order.id, [plan.logEntry]);
    await insertEvent(c.tx, order.id, plan.event);

    return { order: await canonical(c, order.id) };
  });
}

/**
 * Approves, declines or defers lines. Authority is checked twice: the
 * capability, and the approval band against the order's current pending value
 * (`canApprove`) — an Operations user cannot approve a Fleet Manager-sized
 * order by calling the command directly.
 */
export function decideLines(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<WorkOrderData>> {
  return runCommand("decideLines", deps, user, "workorder:approve", async (c) => {
    const { o, orderId } = orderIdOf(input);
    const decisions = v.list(o, "decisions", 100).map(v.lineDecision);

    const { order, client } = await lockOwnedOrder(c, orderId);
    const settings = await effectiveSettings(c.tx, client);
    if (!canApprove(c.session.role, pendingValue(order.lines), settings)) {
      throw new CommandError(
        "forbidden",
        "This order's pending value is above your approval band — it needs a Fleet Manager."
      );
    }

    const plan = applyLineDecisions(order, decisions, planContext(c, client));

    for (const line of plan.changedLines) await updateLine(c.tx, order.id, line);
    await updateOrder(c.tx, order.id, {
      status: plan.order.status,
      assignedProviderId: plan.order.assignedProviderId,
      pendingApprovalEnteredAt: plan.order.pendingApprovalEnteredAt,
      approvalWaitHours: plan.order.approvalWaitHours,
    });
    await insertApprovalLog(c.tx, order.id, plan.logEntries);
    if (plan.event) await insertEvent(c.tx, order.id, plan.event);

    return { order: await canonical(c, order.id) };
  });
}

/* =========================================================== the floor */

function transitionCommand(
  label: string,
  to: "scheduled" | "in_progress" | "cancelled",
  readFields: (o: Record<string, unknown>) => Partial<
    Pick<WorkOrder, "scheduledFor" | "scheduledTime" | "bayId">
  >
) {
  return (
    deps: CommandDeps,
    user: VerifiedUser | null,
    input: unknown
  ): Promise<CommandResult<WorkOrderData>> =>
    runCommand(label, deps, user, null, async (c) => {
      const { o, orderId } = orderIdOf(input);
      const fields = readFields(o);
      const { order, client } = await lockOwnedOrder(c, orderId);
      requireCapability(c, capabilityFor(to));

      const plan = planTransition(order, to, fields, planContext(c, client));
      await updateOrder(c.tx, order.id, { ...fields, status: to });
      await insertEvent(c.tx, order.id, plan.event);

      return { order: await canonical(c, order.id) };
    });
}

/** Approved work onto the calendar (and optionally a bay and arrival slot). */
export const schedule = transitionCommand("schedule", "scheduled", (o) => ({
  scheduledFor: v.date(o, "scheduledFor", { required: true }),
  ...(o.scheduledTime !== undefined ? { scheduledTime: v.time(o, "scheduledTime") } : {}),
  ...(o.bayId !== undefined ? { bayId: v.optionalText(o, "bayId", 100) || null } : {}),
}));

/** The job goes on the lift. */
export const start = transitionCommand("start", "in_progress", () => ({}));

/** Abandons the job. Distinct from a declined quotation, and terminal. */
export const cancel = transitionCommand("cancel", "cancelled", () => ({}));

/* ========================================================= close-out */

function completionInput(c: CommandScope, o: Record<string, unknown>): CompletionDetail {
  const detail = v.completionDetail(o);
  return {
    ...detail,
    // Fitted parts are new rows; their ids are the server's to assign.
    parts: detail.parts?.map((part): PartLine => ({ ...part, id: c.newId() })),
  };
}

async function writeServiceRecord(
  c: CommandScope,
  order: WorkOrder,
  client: FleetClient,
  detail: CompletionDetail
) {
  if (detail.taskIds) {
    await requireServiceTasks(c.tx, client.providerId, detail.taskIds);
    await replaceTasks(c.tx, order.id, detail.taskIds);
  }
  if (detail.parts) await replaceParts(c.tx, order.id, client.id, detail.parts);
}

/**
 * Records the service record — findings, odometer, parts fitted, tasks
 * covered — on a job still in progress, without closing it.
 */
export function complete(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<WorkOrderData>> {
  return runCommand("complete", deps, user, "workorder:complete", async (c) => {
    const { o, orderId } = orderIdOf(input);
    const detail = completionInput(c, o);
    const { order, client } = await lockOwnedOrder(c, orderId);

    const recorded = planRecordCompletion(order, detail);
    await updateOrder(c.tx, order.id, {
      odometerAtService: recorded.odometerAtService,
      findings: recorded.findings,
    });
    await writeServiceRecord(c, order, client, detail);

    return { order: await canonical(c, order.id) };
  });
}

/**
 * Closes a job — and with it resets the vehicle's PMS clock for every task
 * the order covered, in the same transaction. Accepts the service record
 * inline so "finish and close" is one atomic step. Refused past the variance
 * threshold unless `varianceApproved`, which is then logged.
 */
export function close(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<{ order: WorkOrder; vehicle: Vehicle }>> {
  return runCommand("close", deps, user, null, async (c) => {
    const { o, orderId } = orderIdOf(input);
    const detail = completionInput(c, o);
    const varianceApproved = v.bool(o, "varianceApproved");

    const { order, client } = await lockOwnedOrder(c, orderId);
    requireCapability(c, capabilityFor("closed"));
    const vehicle = await readVehicle(c.tx, order.vehicleId, true);
    if (!vehicle) throw new CommandError("out_of_scope", "That vehicle isn't in your fleet.");

    const settings = await effectiveSettings(c.tx, client);
    const plan = planClose(
      order,
      detail,
      settings,
      { varianceApproved, completedOn: businessDate(c.now) },
      planContext(c, client)
    );
    const serviced = applyCompletion(vehicle, plan.order);

    await updateOrder(c.tx, order.id, {
      status: "closed",
      completedOn: plan.order.completedOn,
      odometerAtService: plan.order.odometerAtService,
      findings: plan.order.findings,
    });
    await writeServiceRecord(c, order, client, detail);
    if (plan.varianceEntry) await insertApprovalLog(c.tx, order.id, [plan.varianceEntry]);
    await insertEvent(c.tx, order.id, plan.event);
    await c.tx.update(
      "pms_vehicles",
      { id: vehicle.id },
      vehicleToRow({
        taskState: serviced.taskState,
        odometer: serviced.odometer,
        odometerReadAt: serviced.odometerReadAt,
        status: serviced.status,
      })
    );

    const after = await readVehicle(c.tx, vehicle.id, false);
    return { order: await canonical(c, order.id), vehicle: after ?? serviced };
  });
}

/**
 * Hands vehicles back at the counter. Only closed, not-yet-collected orders
 * the caller may see are collected; anything else in the list is skipped, as
 * the counter workflow expects. Revenue is recognised from this moment.
 */
export function markCollected(
  deps: CommandDeps,
  user: VerifiedUser | null,
  input: unknown
): Promise<CommandResult<{ orders: WorkOrder[] }>> {
  return runCommand("markCollected", deps, user, "workorder:update", async (c) => {
    const o = v.obj(input);
    // Sorted so two counters collecting overlapping sets lock in one order
    // and cannot deadlock each other.
    const orderIds = v.idList(o, "orderIds").sort();
    const at = c.now.toISOString();

    const collected: WorkOrder[] = [];
    for (const orderId of orderIds) {
      const order = await readWorkOrder(c.tx, orderId, { lock: true });
      if (!order || !isCollectable(order)) continue;
      const vehicle = await readVehicle(c.tx, order.vehicleId, false);
      if (!vehicle || !c.visibleClientIds.has(vehicle.fleetClientId)) continue;

      await updateOrder(c.tx, order.id, { collectedAt: at, collectedBy: c.actor.name });
      collected.push(await canonical(c, order.id));
    }
    return { orders: collected };
  });
}
