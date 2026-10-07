import "server-only";

import type {
  ApprovalLogEntry,
  ApprovalSettings,
  FleetClient,
  PartLine,
  Vehicle,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
} from "@/types";
import type { Tx } from "@/server/db-port";
import { DEFAULT_APPROVAL_SETTINGS } from "@/lib/approvals";
import { approvalSettingsForClient } from "@/lib/tenancy";
import { nextReference } from "@/lib/work-order-machine";
import {
  approvalLogEntryToRow,
  catalogueIndex,
  toApprovalLogEntry,
  toApprovalSettings,
  toPartLine,
  toVehicle,
  toWorkOrder,
  toWorkOrderEvent,
  toWorkOrderLine,
  workOrderLineToRow,
  workOrderPartRows,
  workOrderTaskRows,
  workOrderToRow,
  type CatalogueIndex,
} from "@/lib/mappers";
import { CommandError } from "@/server/commands/result";
import type { CommandScope } from "@/server/commands/context";

/**
 * Row access for work orders, on top of the transaction port.
 *
 * Reads assemble through `lib/mappers.ts` — the same mapping the browser's
 * reads use — so what a command returns is the canonical shape the store
 * swaps in, not a server-specific variant of it.
 */

/** Loads one order with every child collection, optionally locking its row. */
export async function readWorkOrder(
  tx: Tx,
  orderId: string,
  options: { lock: boolean }
): Promise<WorkOrder | null> {
  const [row] = await tx.select("pms_work_orders", { id: orderId }, { forUpdate: options.lock });
  if (!row) return null;

  const [eventRows, lineRows, logRows, taskRows, partRows] = await Promise.all([
    tx.select("pms_work_order_events", { work_order_id: orderId }, { orderBy: "seq" }),
    tx.select("pms_work_order_lines", { work_order_id: orderId }, { orderBy: "seq" }),
    tx.select("pms_approval_log", { work_order_id: orderId }, { orderBy: "seq" }),
    tx.select("pms_work_order_tasks", { work_order_id: orderId }),
    tx.select("pms_work_order_parts", { work_order_id: orderId }, { orderBy: "seq" }),
  ]);

  const serviceTaskIds = [
    ...new Set(lineRows.map((l) => l.service_task_id).filter(Boolean) as string[]),
  ];
  const [taskNameRows, technicianRows, vendorRows] = await Promise.all([
    tx.select("pms_service_tasks", { id: serviceTaskIds }),
    row.technician_id ? tx.select("pms_technicians", { id: row.technician_id }) : [],
    row.vendor_id ? tx.select("pms_vendors", { id: row.vendor_id }) : [],
  ]);
  const taskNames = new Map(taskNameRows.map((t) => [String(t.id), String(t.name ?? "")]));

  return toWorkOrder(row, {
    events: eventRows.map(toWorkOrderEvent),
    lines: lineRows.map((l) => toWorkOrderLine(l, taskNames)),
    approvalLog: logRows.map(toApprovalLogEntry),
    taskIds: taskRows.map((t) => String(t.service_task_id)),
    parts: partRows.map(toPartLine),
    technicianName: technicianRows[0] ? String(technicianRows[0].name ?? "") : null,
    vendorName: vendorRows[0] ? String(vendorRows[0].name ?? "") : null,
  });
}

/**
 * Locks and loads an order the caller may act on, or fails.
 *
 * RLS already hides another tenant's order from `pms_server` acting as this
 * user; the TypeScript check repeats it so the rule holds on the in-memory
 * test double too, and so "not yours" and "not found" read the same — a
 * caller cannot probe for ids that exist elsewhere.
 */
export async function lockOwnedOrder(
  c: CommandScope,
  orderId: string
): Promise<{ order: WorkOrder; vehicle: Vehicle; client: FleetClient }> {
  const order = await readWorkOrder(c.tx, orderId, { lock: true });
  const vehicle = order ? await readVehicle(c.tx, order.vehicleId, false) : null;
  const client = vehicle ? c.fleetClients.find((fc) => fc.id === vehicle.fleetClientId) : null;
  if (!order || !vehicle || !client || !c.visibleClientIds.has(client.id)) {
    throw new CommandError("out_of_scope", "That work order isn't available to you.");
  }
  return { order, vehicle, client };
}

export async function readVehicle(tx: Tx, vehicleId: string, lock: boolean) {
  const [row] = await tx.select("pms_vehicles", { id: vehicleId }, { forUpdate: lock });
  return row ? toVehicle(row) : null;
}

/** A client's effective bands: its sparse overrides folded over the provider's. */
export async function effectiveSettings(tx: Tx, client: FleetClient): Promise<ApprovalSettings> {
  const [row] = await tx.select("pms_approval_settings", { provider_id: client.providerId });
  const providerDefaults = row
    ? toApprovalSettings(row, DEFAULT_APPROVAL_SETTINGS)
    : DEFAULT_APPROVAL_SETTINGS;
  return approvalSettingsForClient(client, providerDefaults);
}

export async function catalogues(
  tx: Tx,
  providerId: string
): Promise<{ technicians: CatalogueIndex; vendors: CatalogueIndex }> {
  const [technicians, vendors] = await Promise.all([
    tx.select("pms_technicians", { provider_id: providerId }),
    tx.select("pms_vendors", { provider_id: providerId }),
  ]);
  return { technicians: catalogueIndex(technicians), vendors: catalogueIndex(vendors) };
}

/** Every id must be a task in the provider's own catalogue. */
export async function requireServiceTasks(tx: Tx, providerId: string, taskIds: string[]) {
  if (taskIds.length === 0) return;
  const rows = await tx.select("pms_service_tasks", { id: taskIds, provider_id: providerId });
  if (rows.length !== taskIds.length) {
    throw new CommandError("validation", "One of those service tasks isn't in the catalogue.");
  }
}

/**
 * Issues the next order number.
 *
 * Takes a transaction-scoped advisory lock first, so two commands numbering
 * at once queue rather than both reading the same maximum; the unique index
 * on `reference` remains the backstop. `nextReference` is unchanged — it is
 * simply fed the global maximum rather than a tenant-scoped list. Phase 2
 * replaces all of this with `pms_document_series` (R8).
 */
export async function issueReference(tx: Tx, year: number): Promise<string> {
  await tx.advisoryLock("pms_work_orders.reference");
  const highest = await tx.highestWorkOrderReference(year);
  return nextReference(highest ? [{ reference: highest }] : [], year);
}

/* ------------------------------------------------------------------ writes */

export function insertEvent(tx: Tx, orderId: string, event: WorkOrderEvent) {
  return tx.insert("pms_work_order_events", {
    id: event.id,
    work_order_id: orderId,
    status: event.status,
    at: event.at,
    actor: event.actor,
  });
}

export function insertApprovalLog(tx: Tx, orderId: string, entries: ApprovalLogEntry[]) {
  if (entries.length === 0) return Promise.resolve();
  return tx.insert(
    "pms_approval_log",
    entries.map((entry) => approvalLogEntryToRow(entry, orderId))
  );
}

export function insertLines(tx: Tx, orderId: string, lines: WorkOrderLine[]) {
  if (lines.length === 0) return Promise.resolve();
  return tx.insert(
    "pms_work_order_lines",
    lines.map((line) => workOrderLineToRow(line, orderId))
  );
}

/** Rewrites one line's inputs, extended amounts, and approval fields. */
export function updateLine(tx: Tx, orderId: string, line: WorkOrderLine) {
  const { id: _id, work_order_id: _order, ...patch } = workOrderLineToRow(line, orderId);
  return tx.update("pms_work_order_lines", { id: line.id, work_order_id: orderId }, patch);
}

export async function replaceTasks(tx: Tx, orderId: string, taskIds: string[]) {
  await tx.delete("pms_work_order_tasks", { work_order_id: orderId });
  const rows = workOrderTaskRows(taskIds, orderId);
  if (rows.length > 0) await tx.insert("pms_work_order_tasks", rows);
}

/**
 * Replaces the fitted parts. SKUs resolve to catalogue rows within the
 * order's own client only — SKUs are per-client, and a bare match across
 * clients would attach one tenant's part to another tenant's job.
 */
export async function replaceParts(
  tx: Tx,
  orderId: string,
  fleetClientId: string,
  parts: PartLine[]
) {
  await tx.delete("pms_work_order_parts", { work_order_id: orderId });
  if (parts.length === 0) return;

  const skus = [...new Set(parts.map((p) => p.partNumber).filter(Boolean))];
  const catalogueRows = await tx.select("pms_parts", { fleet_client_id: fleetClientId, sku: skus });
  const partsBySku = new Map(catalogueRows.map((p) => [String(p.sku), String(p.id)]));
  await tx.insert("pms_work_order_parts", workOrderPartRows(parts, orderId, partsBySku));
}

export function insertOrder(
  tx: Tx,
  order: WorkOrder,
  index: { technicians: CatalogueIndex; vendors: CatalogueIndex }
) {
  return tx.insert("pms_work_orders", workOrderToRow(order, index));
}

/** Writes header fields. `vehicleId` is never patchable — it is the tenancy anchor. */
export function updateOrder(
  tx: Tx,
  orderId: string,
  patch: Partial<WorkOrder>,
  index?: { technicians: CatalogueIndex; vendors: CatalogueIndex }
) {
  const row = workOrderToRow({ ...patch, id: undefined, vehicleId: undefined }, index);
  return tx.update("pms_work_orders", { id: orderId }, row);
}
