"use client";

/**
 * Data access for the `pms_` tables.
 *
 * Everything that talks to Postgres lives here; `lib/store.ts` holds the React
 * store on top of it. The split exists so the query layer can be read (and
 * changed) without wading through subscription bookkeeping.
 *
 * **Scoping note.** Every query below is written as if it returned everything,
 * because RLS has already narrowed it to the caller's tenant — a select with no
 * `fleet_client_id` filter returns only rows the session may read, and a write
 * outside that scope is rejected by the policy rather than by a client-side
 * guard. `scopeFleetState` still runs on top of the result: the two agree, and
 * keeping both means the UI stays correct even if a policy is ever loosened.
 */

import type {
  ApprovalLogEntry,
  ApprovalSettings,
  FleetState,
  PurchaseOrder,
  ServiceTask,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
} from "@/types";
import { DEFAULT_APPROVAL_SETTINGS } from "@/lib/approvals";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/tenant";
import { describeError, requireSupabase } from "@/lib/supabase";
import {
  toApprovalLogEntry,
  toApprovalSettings,
  toDocument,
  toFleetClient,
  toPart,
  toPartLine,
  toProvider,
  toPurchaseOrder,
  toPurchaseOrderLine,
  toServiceTask,
  toVehicle,
  toWorkOrder,
  toWorkOrderEvent,
  toWorkOrderLine,
} from "@/lib/mappers";

/** The empty state, used for the server snapshot and as the fail-closed value. */
export const EMPTY_STATE: FleetState = {
  providers: [],
  fleetClients: [],
  vehicles: [],
  workOrders: [],
  documents: [],
  alerts: {},
  approvalSettings: DEFAULT_APPROVAL_SETTINGS,
  parts: [],
  purchaseOrders: [],
  tenant: DEFAULT_TENANT_SETTINGS,
};

type Row = Record<string, unknown>;

/**
 * PostgREST caps a response at 1000 rows by default. The seeded demo already
 * exceeds that on work-order events (~1900), so every list query pages rather
 * than silently truncating — a truncated history would quietly corrupt the
 * timeline and the analytics built on it.
 */
const PAGE = 1000;

async function selectAll(table: string, columns = "*"): Promise<Row[]> {
  const supabase = requireSupabase();
  const rows: Row[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`${table}: ${describeError(error)}`);
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  return rows;
}

/**
 * Loads the whole visible fleet.
 *
 * One query per table rather than nested selects: the work-order children are
 * ordered by their `seq` columns (append-only history must stay in order), and
 * grouping them in memory is both simpler and faster than PostgREST embedding
 * at this size.
 */
export async function fetchFleetState(): Promise<FleetState> {
  const [
    providerRows,
    clientRows,
    vehicleRows,
    orderRows,
    eventRows,
    lineRows,
    logRows,
    documentRows,
    partRows,
    poRows,
    poLineRows,
    settingsRows,
    serviceTaskRows,
    technicianRows,
    vendorRows,
    orderTaskRows,
    orderPartRows,
    poLineTaskRows,
    poLineVehicleRows,
  ] = await Promise.all([
    selectAll("pms_providers"),
    selectAll("pms_fleet_clients"),
    selectAll("pms_vehicles"),
    selectAll("pms_work_orders"),
    selectAll("pms_work_order_events"),
    selectAll("pms_work_order_lines"),
    selectAll("pms_approval_log"),
    selectAll("pms_documents"),
    selectAll("pms_parts"),
    selectAll("pms_purchase_orders"),
    selectAll("pms_purchase_order_lines"),
    selectAll("pms_approval_settings"),
    // The catalogues and junctions added in 0006. Loaded alongside the rest
    // rather than joined server-side: PostgREST embedding does not guarantee
    // child ordering, and these are small enough to index in memory.
    selectAll("pms_service_tasks"),
    selectAll("pms_technicians"),
    selectAll("pms_vendors"),
    selectAll("pms_work_order_tasks"),
    selectAll("pms_work_order_parts"),
    selectAll("pms_purchase_order_line_tasks"),
    selectAll("pms_purchase_order_line_vehicles"),
  ]);

  // Children grouped by parent, each list kept in `seq` order so append-only
  // collections read oldest-first exactly as they were written.
  const bySeq = (a: Row, b: Row) => Number(a.seq ?? 0) - Number(b.seq ?? 0);

  const eventsByOrder = new Map<string, WorkOrderEvent[]>();
  for (const row of [...eventRows].sort(bySeq)) {
    const key = String(row.work_order_id);
    const list = eventsByOrder.get(key) ?? [];
    list.push(toWorkOrderEvent(row));
    eventsByOrder.set(key, list);
  }

  // Catalogue lookups: a line's label follows its service task, so renaming a
  // task in the catalogue renames it on every line that references it.
  const taskNames = new Map<string, string>();
  for (const row of serviceTaskRows) {
    taskNames.set(String(row.id), String(row.name ?? ""));
  }

  const technicianNames = new Map<string, string>();
  for (const row of technicianRows) {
    technicianNames.set(String(row.id), String(row.name ?? ""));
  }

  const vendorNames = new Map<string, string>();
  for (const row of vendorRows) {
    vendorNames.set(String(row.id), String(row.name ?? ""));
  }

  const linesByOrder = new Map<string, WorkOrderLine[]>();
  for (const row of [...lineRows].sort(bySeq)) {
    const key = String(row.work_order_id);
    const list = linesByOrder.get(key) ?? [];
    list.push(toWorkOrderLine(row, taskNames));
    linesByOrder.set(key, list);
  }

  /** Groups junction rows into `parent id → child id[]`. */
  const groupIds = (rows: Row[], parentKey: string, childKey: string) => {
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const key = String(row[parentKey]);
      const list = grouped.get(key) ?? [];
      list.push(String(row[childKey]));
      grouped.set(key, list);
    }
    return grouped;
  };

  const taskIdsByOrder = groupIds(orderTaskRows, "work_order_id", "service_task_id");
  const taskIdsByPoLine = groupIds(
    poLineTaskRows,
    "purchase_order_line_id",
    "service_task_id"
  );
  const vehicleIdsByPoLine = groupIds(
    poLineVehicleRows,
    "purchase_order_line_id",
    "vehicle_id"
  );

  const partsByOrder = new Map<string, ReturnType<typeof toPartLine>[]>();
  for (const row of [...orderPartRows].sort(bySeq)) {
    const key = String(row.work_order_id);
    const list = partsByOrder.get(key) ?? [];
    list.push(toPartLine(row));
    partsByOrder.set(key, list);
  }

  const logByOrder = new Map<string, ApprovalLogEntry[]>();
  for (const row of [...logRows].sort(bySeq)) {
    const key = String(row.work_order_id);
    const list = logByOrder.get(key) ?? [];
    list.push(toApprovalLogEntry(row));
    logByOrder.set(key, list);
  }

  const poLinesByOrder = new Map<string, ReturnType<typeof toPurchaseOrderLine>[]>();
  for (const row of [...poLineRows].sort(bySeq)) {
    const key = String(row.purchase_order_id);
    const list = poLinesByOrder.get(key) ?? [];
    const lineId = String(row.id);
    list.push(
      toPurchaseOrderLine(
        row,
        taskIdsByPoLine.get(lineId) ?? [],
        vehicleIdsByPoLine.get(lineId) ?? [],
        taskNames
      )
    );
    poLinesByOrder.set(key, list);
  }

  const providers = providerRows.map(toProvider);

  // One row per provider; with exactly one provider visible per session, the
  // first row is that provider's. Falls back to the shipped defaults.
  const approvalSettings =
    settingsRows.length > 0
      ? toApprovalSettings(settingsRows[0], DEFAULT_APPROVAL_SETTINGS)
      : DEFAULT_APPROVAL_SETTINGS;

  const workOrders: WorkOrder[] = orderRows.map((row) => {
    const id = String(row.id);
    const technicianId = row.technician_id ? String(row.technician_id) : null;
    const vendorId = row.vendor_id ? String(row.vendor_id) : null;

    return toWorkOrder(row, {
      events: eventsByOrder.get(id) ?? [],
      lines: linesByOrder.get(id) ?? [],
      approvalLog: logByOrder.get(id) ?? [],
      taskIds: taskIdsByOrder.get(id) ?? [],
      parts: partsByOrder.get(id) ?? [],
      technicianName: technicianId ? technicianNames.get(technicianId) ?? null : null,
      vendorName: vendorId ? vendorNames.get(vendorId) ?? null : null,
    });
  });

  const purchaseOrders: PurchaseOrder[] = poRows.map((row) =>
    toPurchaseOrder(row, poLinesByOrder.get(String(row.id)) ?? [])
  );

  // Newest first, matching the order the localStorage store kept records in
  // (writes unshifted onto the front) so list screens are unchanged.
  const byOpenedDesc = (a: WorkOrder, b: WorkOrder) =>
    b.openedOn.localeCompare(a.openedOn);

  const tenantBase = providers[0];

  return {
    providers,
    fleetClients: clientRows.map(toFleetClient),
    vehicles: vehicleRows.map(toVehicle),
    workOrders: workOrders.sort(byOpenedDesc),
    documents: documentRows
      .map(toDocument)
      .sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn)),
    // Alert interactions are loaded separately, keyed by user.
    alerts: {},
    approvalSettings,
    parts: partRows.map(toPart),
    purchaseOrders: purchaseOrders.sort((a, b) =>
      b.createdOn.localeCompare(a.createdOn)
    ),
    // `providerBranding` recomputes this per scope; this is only the fallback
    // for a state with no resolvable provider.
    tenant: tenantBase
      ? {
          displayName: tenantBase.name,
          logoUrl: tenantBase.logoUrl,
          brandColor: tenantBase.brandColor,
          supportEmail: tenantBase.supportEmail,
        }
      : DEFAULT_TENANT_SETTINGS,
  };
}

/* -------------------------------------------------------------- service tasks */

/**
 * The provider's PMS interval catalogue — global to every fleet client
 * beneath it, the same way bays and technicians are shop-wide rather than
 * per-client. RLS scopes this to the caller's own provider, so no query
 * parameter is needed.
 */
export async function fetchServiceTasks(): Promise<ServiceTask[]> {
  const rows = await selectAll("pms_service_tasks");
  return rows.map(toServiceTask);
}

/* -------------------------------------------------------- alert interactions */

/** This user's read/dismiss buckets, keyed by tenant scope key. */
export async function fetchAlertInteractions(
  userId: string
): Promise<FleetState["alerts"]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("pms_alert_interactions")
    .select("scope_key, read_ids, dismissed_ids")
    .eq("user_id", userId);

  if (error) throw new Error(`alert interactions: ${describeError(error)}`);

  const buckets: FleetState["alerts"] = {};
  for (const row of data ?? []) {
    buckets[row.scope_key as string] = {
      readIds: (row.read_ids as string[]) ?? [],
      dismissedIds: (row.dismissed_ids as string[]) ?? [],
    };
  }
  return buckets;
}

export async function saveAlertInteraction(
  userId: string,
  scopeKey: string,
  readIds: string[],
  dismissedIds: string[]
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("pms_alert_interactions").upsert(
    {
      user_id: userId,
      scope_key: scopeKey,
      read_ids: readIds,
      dismissed_ids: dismissedIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,scope_key" }
  );

  if (error) throw new Error(`alert interactions: ${describeError(error)}`);
}

/* ------------------------------------------------------------------ writes */

/** Thin wrapper so callers get one consistent error shape. */
export type WriteResult = { ok: true } | { ok: false; error: string };

export async function runWrite(
  work: () => Promise<{ error: unknown } | void>
): Promise<WriteResult> {
  try {
    const result = await work();
    if (result && "error" in result && result.error) {
      return { ok: false, error: describeError(result.error) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
