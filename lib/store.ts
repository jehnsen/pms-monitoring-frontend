"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { formatISO, parseISO } from "date-fns";
import type {
  AlertInteraction,
  ApprovalLogEntry,
  ApprovalSettings,
  FleetClient,
  FleetDocument,
  FleetState,
  LineApprovalStatus,
  Part,
  PartLine,
  ProviderTechnician,
  ProviderVendor,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  ServiceTask,
  TaskState,
  TenantSettings,
  Vehicle,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
} from "@/types";
import { applyCompletion, evaluateFleet, summariseFleet } from "@/lib/pms";
import { buildAlerts, viewAlerts } from "@/lib/alerts";
import { useSession } from "@/lib/auth";
import { requireSupabase } from "@/lib/supabase";
import {
  alertsForScope,
  explainTenantScope,
  scopeFleetState,
  tenantScopeKey,
  visibleFleetClientIds,
} from "@/lib/tenancy";
import {
  DEFAULT_APPROVAL_SETTINGS,
  approvedValue,
  businessHoursBetween,
  deriveOrderStatus,
  lineCost,
  requiredApprover,
  varianceExceeds,
} from "@/lib/approvals";
import {
  EMPTY_STATE,
  fetchAlertInteractions,
  fetchFleetState,
  fetchServiceTasks,
  fetchTechnicians,
  fetchVendors,
  saveAlertInteraction,
} from "@/lib/fleet-data";
import {
  approvalLogEntryToRow,
  approvalSettingsToRow,
  documentToRow,
  fleetClientToRow,
  providerTechnicianToRow,
  providerVendorToRow,
  purchaseOrderLineTaskRows,
  purchaseOrderLineToRow,
  purchaseOrderLineVehicleRows,
  purchaseOrderToRow,
  serviceTaskToRow,
  vehicleToRow,
  workOrderLineToRow,
  workOrderPartRows,
  workOrderTaskRows,
  workOrderToRow,
} from "@/lib/mappers";

/**
 * The fleet store, backed by Supabase.
 *
 * This module replaced a localStorage implementation, and the seam CLAUDE.md
 * described held: `useFleet()` and `useFleetActions()` keep the same shapes, so
 * no screen changed. What differs underneath:
 *
 *  - State is loaded from Postgres once per session and cached here, still
 *    behind `useSyncExternalStore`. Reads stay synchronous for components.
 *  - Mutations are **optimistic**: local state updates immediately so the UI
 *    stays responsive, the write goes to Postgres, and a failure rolls the
 *    change back and surfaces the error. The previous implementation could not
 *    fail, so this is the one genuinely new behaviour.
 *  - Tenancy is enforced twice. The client-side guards below are unchanged, and
 *    RLS independently rejects anything they would have blocked. The guards are
 *    kept because they give an immediate, local answer without a round trip.
 *
 * `getServerSnapshot` still returns empty: due dates depend on "now", so the
 * shell renders skeletons until mount. Check `ready` before rendering data.
 */

const EMPTY = EMPTY_STATE;
/** Stable empty-array references for the server snapshot — a fresh `[]` on
 * every call would fail `useSyncExternalStore`'s reference-equality check and
 * loop. */
const EMPTY_SERVICE_TASKS: ServiceTask[] = [];
const EMPTY_TECHNICIANS: ProviderTechnician[] = [];
const EMPTY_VENDORS: ProviderVendor[] = [];

let state: FleetState = EMPTY;
/**
 * The provider's PMS interval catalogue, technician roster, and approved
 * vendor list. Held separately from `FleetState` because all three are
 * provider-wide rather than tenant data proper — the same reason bays aren't
 * part of `FleetState` either — but they share this store's load/subscribe
 * lifecycle since every screen that reads one also reads the fleet.
 */
let serviceTasks: ServiceTask[] = [];
let technicians: ProviderTechnician[] = [];
let vendors: ProviderVendor[] = [];
/** Set once a load has finished, so `ready` distinguishes "empty" from "loading". */
let loaded = false;
let loading = false;
let loadError: string | null = null;
/** The user whose data is currently held, so a switch reloads rather than reusing. */
let loadedForUser: string | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return EMPTY;
}

function getServiceTasksSnapshot() {
  return serviceTasks;
}

function getServiceTasksServerSnapshot() {
  return EMPTY_SERVICE_TASKS;
}

function getTechniciansSnapshot() {
  return technicians;
}

function getTechniciansServerSnapshot() {
  return EMPTY_TECHNICIANS;
}

function getVendorsSnapshot() {
  return vendors;
}

function getVendorsServerSnapshot() {
  return EMPTY_VENDORS;
}

/** Replaces local state and notifies subscribers. */
function commit(next: FleetState) {
  state = next;
  emit();
}

/** Replaces the cached service-task catalogue and notifies subscribers. */
function commitServiceTasks(next: ServiceTask[]) {
  serviceTasks = next;
  emit();
}

function commitTechnicians(next: ProviderTechnician[]) {
  technicians = next;
  emit();
}

function commitVendors(next: ProviderVendor[]) {
  vendors = next;
  emit();
}

/**
 * Loads everything the session may read.
 *
 * Guarded against concurrent calls, and re-run when the signed-in user changes
 * — a different account is a different tenant scope and must not reuse the
 * previous one's rows.
 */
async function load(userId: string) {
  if (loading || loadedForUser === userId) return;
  loading = true;
  loadError = null;

  try {
    const [fleet, alerts, tasks, techs, vends] = await Promise.all([
      fetchFleetState(),
      fetchAlertInteractions(userId),
      fetchServiceTasks(),
      fetchTechnicians(),
      fetchVendors(),
    ]);
    state = { ...fleet, alerts };
    serviceTasks = tasks;
    technicians = techs;
    vendors = vends;
    loaded = true;
    loadedForUser = userId;
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    // Fail closed and loudly: an empty screen must not read as "no data".
    console.error(`[store] failed to load fleet state: ${loadError}`);
    state = EMPTY;
    serviceTasks = [];
    technicians = [];
    vendors = [];
    loaded = true;
    loadedForUser = userId;
  } finally {
    loading = false;
    emit();
  }
}

/** Drops cached state on sign-out so the next account starts clean. */
function reset() {
  state = EMPTY;
  serviceTasks = [];
  technicians = [];
  vendors = [];
  loaded = false;
  loadedForUser = null;
  loadError = null;
  emit();
}

/** Forces a refetch — used after writes whose local effect is hard to model. */
export async function refreshFleetState() {
  const userId = loadedForUser;
  if (!userId) return;
  loadedForUser = null;
  await load(userId);
}

/**
 * The unscoped snapshot. Deliberately **not** exported — every consumer goes
 * through `useFleetState`, which applies the tenant scope, so a new screen gets
 * scoping by default rather than by remembering to ask for it.
 */
function useRawFleetState() {
  const { session } = useSession();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const tasks = useSyncExternalStore(
    subscribe,
    getServiceTasksSnapshot,
    getServiceTasksServerSnapshot
  );
  const techs = useSyncExternalStore(
    subscribe,
    getTechniciansSnapshot,
    getTechniciansServerSnapshot
  );
  const vends = useSyncExternalStore(
    subscribe,
    getVendorsSnapshot,
    getVendorsServerSnapshot
  );

  // The real Supabase auth uid — required by fetchAlertInteractions, whose
  // `user_id` column is `uuid`. The session's email is not a valid key here.
  const userId = session?.uid ?? null;

  useEffect(() => {
    if (userId) {
      void load(userId);
    } else if (loadedForUser) {
      // Signed out: discard the previous tenant's rows.
      reset();
    }
  }, [userId]);

  return {
    snapshot,
    serviceTasks: tasks,
    technicians: techs,
    vendors: vends,
    // Not ready until a load has actually completed for this user; otherwise
    // the first paint would render an empty fleet as though it were real.
    ready: loaded && loadedForUser === userId && userId !== null,
    error: loadError,
  };
}

/**
 * The signed-in session's tenant scope, plus the reason when there isn't one.
 * `null` scope means render nothing — never fall through to unscoped.
 */
export function useTenantScope() {
  const { session } = useSession();
  const { snapshot, ready } = useRawFleetState();

  return useMemo(() => {
    const { scope, denial } = explainTenantScope(
      session ?? null,
      snapshot.providers,
      snapshot.fleetClients
    );

    if (!scope && ready && session) {
      console.warn(
        `[tenancy] no scope resolved for ${session.email} (${denial}); rendering nothing.`
      );
    }

    return { scope, denial, ready };
  }, [session, snapshot.providers, snapshot.fleetClients, ready]);
}

/** Tenant-scoped fleet state plus a `ready` flag for skeleton rendering. */
export function useFleetState() {
  const { snapshot, ready, error } = useRawFleetState();
  const { scope } = useTenantScope();

  const scoped = useMemo(
    () => scopeFleetState(snapshot, scope),
    [snapshot, scope]
  );

  return { state: scoped, ready, scope, error };
}

/**
 * Fleet state with the PMS engine already applied. Everything returned is
 * narrowed to the caller's tenant — the `vehiclesById` / `healthById` indexes
 * included, so a component holding one cannot look up a record outside its own
 * scope.
 */
export function useFleet() {
  const { state: snapshot, ready, scope, error } = useFleetState();
  // Provider-global, not tenant-scoped data, so it comes from the raw store
  // rather than `useFleetState` — a client-side session still needs to see
  // what its vehicles are measured against and who might work on them, even
  // though only the provider can change any of it (enforced by RLS, see
  // 0004_pms_service_tasks.sql / 0006_pms_normalisation.sql).
  const { serviceTasks, technicians, vendors } = useRawFleetState();

  return useMemo(() => {
    const health = evaluateFleet(snapshot.vehicles, new Date(), serviceTasks);
    return {
      ready,
      error,
      scope,
      providers: snapshot.providers,
      fleetClients: snapshot.fleetClients,
      vehicles: snapshot.vehicles,
      workOrders: snapshot.workOrders,
      documents: snapshot.documents,
      alertState: alertsForScope(snapshot, scope),
      approvalSettings: snapshot.approvalSettings,
      parts: snapshot.parts,
      purchaseOrders: snapshot.purchaseOrders,
      tenant: snapshot.tenant,
      serviceTasks,
      technicians,
      vendors,
      health,
      healthById: new Map(health.map((h) => [h.vehicle.id, h])),
      vehiclesById: new Map(snapshot.vehicles.map((v) => [v.id, v])),
      summary: summariseFleet(health),
    };
  }, [snapshot, ready, scope, error, serviceTasks, technicians, vendors]);
}

/**
 * Live alerts, recomputed from fleet state and folded together with the user's
 * read/dismiss decisions. Still derived on every read, never stored, so they
 * cannot outlive their trigger.
 */
export function useAlerts() {
  const { ready, health, workOrders, documents, alertState, approvalSettings } =
    useFleet();

  return useMemo(() => {
    const alerts = buildAlerts(health, workOrders, documents, approvalSettings);
    return { ready, ...viewAlerts(alerts, alertState) };
  }, [ready, health, workOrders, documents, alertState, approvalSettings]);
}

/** Largest single upload accepted, in bytes. */
export const MAX_DOCUMENT_BYTES = 1_500_000;

function workOrderEvent(status: WorkOrder["status"], actor: string): WorkOrderEvent {
  return {
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status,
    at: new Date().toISOString(),
    actor,
  };
}

function approvalLogId() {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Replaces an order's covered-task junction rows.
 *
 * `taskIds` was an array column until migration 0006; it is
 * `pms_work_order_tasks` now, so a write is delete-then-insert rather than an
 * overwrite. Delete-all-then-insert (rather than diffing) keeps the write
 * idempotent and matches how the array column behaved — the set replaces
 * wholesale.
 */
async function replaceWorkOrderTasks(
  supabase: ReturnType<typeof requireSupabase>,
  orderId: string,
  taskIds: string[]
) {
  const { error: clearError } = await supabase
    .from("pms_work_order_tasks")
    .delete()
    .eq("work_order_id", orderId);
  if (clearError) throw new Error(clearError.message);

  const rows = workOrderTaskRows(taskIds, orderId);
  if (rows.length === 0) return;

  const { error } = await supabase.from("pms_work_order_tasks").insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Replaces an order's fitted-part rows — same delete-then-insert shape, for
 * what used to be the `parts` jsonb blob.
 *
 * `partsBySku` resolves each line to its catalogue row within the order's own
 * fleet client: SKUs are per-client, so matching a bare SKU across clients
 * would attach one tenant's part to another tenant's job.
 */
async function replaceWorkOrderParts(
  supabase: ReturnType<typeof requireSupabase>,
  orderId: string,
  parts: PartLine[],
  partsBySku: ReadonlyMap<string, string>
) {
  const { error: clearError } = await supabase
    .from("pms_work_order_parts")
    .delete()
    .eq("work_order_id", orderId);
  if (clearError) throw new Error(clearError.message);

  const rows = workOrderPartRows(parts, orderId, partsBySku);
  if (rows.length === 0) return;

  const { error } = await supabase.from("pms_work_order_parts").insert(rows);
  if (error) throw new Error(error.message);
}

/** SKU → part id for one fleet client's catalogue. */
function partsBySkuFor(state: FleetState, fleetClientId: string | null) {
  const index = new Map<string, string>();
  for (const part of state.parts) {
    if (fleetClientId && part.fleetClientId !== fleetClientId) continue;
    if (part.sku) index.set(part.sku, part.id);
  }
  return index;
}

/**
 * What a caller supplies for a new vehicle. The id, service history, and
 * **tenant** are the store's to set — a caller cannot choose which client a
 * vehicle lands in.
 */
export type NewVehicleDraft = Omit<Vehicle, "id" | "taskState" | "fleetClientId">;

/** The provider is taken from the session, never from the caller. */
export type NewFleetClientDraft = Omit<
  FleetClient,
  "id" | "providerId" | "createdAt"
>;

/** Likewise, the uploader does not choose which client a document files under. */
export type NewDocumentDraft = Omit<
  FleetDocument,
  "id" | "uploadedOn" | "fleetClientId"
>;

/** What a caller supplies for a new line — the approval fields are the store's to set. */
export type NewWorkOrderLine = Pick<
  WorkOrderLine,
  "description" | "category" | "partCost" | "labourCost" | "urgency" | "partsSource" | "photoUrls"
>;

type NewWorkOrderDraft = Omit<
  WorkOrder,
  | "id"
  | "reference"
  | "history"
  | "status"
  | "lines"
  | "approvalLog"
  | "pendingApprovalEnteredAt"
  | "approvalWaitHours"
  | "bayId"
  | "collectedAt"
  | "collectedBy"
  | "scheduledTime"
> & {
  bayId?: string | null;
  scheduledTime?: string | null;
};

export function useFleetActions() {
  const { session } = useSession();
  const actor = session?.name ?? "System";
  const { scope } = useTenantScope();
  const {
    serviceTasks: catalogue,
    technicians,
    vendors,
  } = useRawFleetState();

  /**
   * Writes are scoped by the same rule as reads. Unchanged from the
   * localStorage implementation — these now run *in addition to* RLS, giving an
   * immediate local answer without a round trip while the database enforces the
   * same boundary authoritatively.
   */
  const guards = useMemo(() => {
    const clientIds = (current: FleetState) =>
      new Set(visibleFleetClientIds(scope, current.fleetClients));

    const writeClientId = (current: FleetState): string | null => {
      if (!scope) return null;
      if (scope.kind === "client") return scope.fleetClientId;
      // Provider-side: unambiguous only with exactly one client. Otherwise the
      // caller must say which, and none of today's dialogs do — fail closed
      // rather than guess.
      const ids = [...clientIds(current)];
      return ids.length === 1 ? ids[0] : null;
    };

    const clientForVehicle = (
      current: FleetState,
      vehicleId: string
    ): string | null => {
      const vehicle = current.vehicles.find((v) => v.id === vehicleId);
      if (!vehicle) return null;
      return clientIds(current).has(vehicle.fleetClientId)
        ? vehicle.fleetClientId
        : null;
    };

    const clientForOrder = (current: FleetState, orderId: string): string | null => {
      const order = current.workOrders.find((o) => o.id === orderId);
      if (!order) return null;
      return clientForVehicle(current, order.vehicleId);
    };

    return { clientIds, writeClientId, clientForVehicle, clientForOrder };
  }, [scope]);

  /**
   * Applies a local change immediately, then persists it. On failure the
   * previous state is restored — the optimistic update never silently sticks
   * around after a rejected write.
   */
  const optimistic = useCallback(
    async (
      next: FleetState,
      persist: () => Promise<void>
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const previous = state;
      commit(next);
      try {
        await persist();
        return { ok: true };
      } catch (error) {
        commit(previous);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[store] write failed, rolled back: ${message}`);
        return { ok: false, error: message };
      }
    },
    []
  );

  /**
   * Every job is a purchase before it's a repair: the lines supplied here run
   * through the approval thresholds immediately. Under the auto-approve
   * ceiling every line is approved on the spot (system actor, logged) and the
   * order opens already `approved`; otherwise it opens `pending_approval` and
   * the wait-time clock starts now.
   */
  const createWorkOrder = useCallback(
    (
      draft: NewWorkOrderDraft,
      lineDrafts: NewWorkOrderLine[],
      settings: ApprovalSettings
    ): WorkOrder | null => {
      const current = state;
      const fleetClientId = guards.clientForVehicle(current, draft.vehicleId);
      if (!fleetClientId) return null;

      const seq = current.workOrders.length + 1;
      const now = new Date();
      const total = lineDrafts.reduce((sum, l) => sum + l.partCost + l.labourCost, 0);
      const autoApprove = requiredApprover(total, settings) === "auto";
      const orderId = `wo-${Date.now().toString(36)}`;

      const lines: WorkOrderLine[] = lineDrafts.map((l, index) => ({
        ...l,
        id: `line-${Date.now().toString(36)}-${index}`,
        approvalStatus: autoApprove ? "approved" : "pending",
        approvedBy: autoApprove ? "System (auto-approval)" : null,
        approvedAt: autoApprove ? now.toISOString() : null,
        declineReason: null,
      }));

      const approvalLog: ApprovalLogEntry[] = autoApprove
        ? lines.map((l) => ({
            id: approvalLogId(),
            fleetClientId,
            lineId: l.id,
            action: "auto_approved",
            actorId: "system",
            actorName: "System (auto-approval)",
            at: now.toISOString(),
            note: null,
            amountAtTime: lineCost(l),
          }))
        : [];

      const status = deriveOrderStatus(lines);
      const event = workOrderEvent(status, actor);

      const created: WorkOrder = {
        ...draft,
        id: orderId,
        reference: `WO-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`,
        bayId: draft.bayId ?? null,
        scheduledTime: draft.scheduledTime ?? null,
        // A job cannot be collected before it has been done.
        collectedAt: null,
        collectedBy: null,
        status,
        lines,
        approvalLog,
        pendingApprovalEnteredAt:
          status === "pending_approval" ? now.toISOString() : null,
        approvalWaitHours: null,
        history: [event],
      };

      void optimistic(
        { ...current, workOrders: [created, ...current.workOrders] },
        async () => {
          const supabase = requireSupabase();

          const { error: orderError } = await supabase
            .from("pms_work_orders")
            .insert(workOrderToRow(created));
          if (orderError) throw new Error(orderError.message);

          if (lines.length > 0) {
            const { error } = await supabase
              .from("pms_work_order_lines")
              .insert(lines.map((l) => workOrderLineToRow(l, orderId)));
            if (error) throw new Error(error.message);
          }

          // Covered tasks are junction rows, not a column on the order.
          await replaceWorkOrderTasks(supabase, orderId, created.taskIds);

          const { error: eventError } = await supabase
            .from("pms_work_order_events")
            .insert({
              id: event.id,
              work_order_id: orderId,
              status: event.status,
              at: event.at,
              actor: event.actor,
            });
          if (eventError) throw new Error(eventError.message);

          if (approvalLog.length > 0) {
            const { error } = await supabase
              .from("pms_approval_log")
              .insert(approvalLog.map((e) => approvalLogEntryToRow(e, orderId)));
            if (error) throw new Error(error.message);
          }
        }
      );

      return created;
    },
    [actor, guards, optimistic]
  );

  const updateWorkOrder = useCallback(
    (id: string, patch: Partial<WorkOrder>) => {
      const current = state;
      if (!guards.clientForOrder(current, id)) return;

      const order = current.workOrders.find((o) => o.id === id);
      if (!order) return;

      const statusChanged = patch.status && patch.status !== order.status;
      const event = statusChanged ? workOrderEvent(patch.status!, actor) : null;

      const updated: WorkOrder = {
        ...order,
        ...patch,
        // A patch may not re-point an order at another tenant's vehicle, which
        // would drag it across the boundary.
        vehicleId: order.vehicleId,
        history: event ? [...order.history, event] : order.history,
      };

      void optimistic(
        {
          ...current,
          workOrders: current.workOrders.map((o) => (o.id === id ? updated : o)),
        },
        async () => {
          const supabase = requireSupabase();
          const row = workOrderToRow({ ...patch, vehicleId: undefined });
          if (Object.keys(row).length > 0) {
            const { error } = await supabase
              .from("pms_work_orders")
              .update(row)
              .eq("id", id);
            if (error) throw new Error(error.message);
          }
          if (event) {
            const { error } = await supabase.from("pms_work_order_events").insert({
              id: event.id,
              work_order_id: id,
              status: event.status,
              at: event.at,
              actor: event.actor,
            });
            if (error) throw new Error(error.message);
          }
        }
      );
    },
    [actor, guards, optimistic]
  );

  /**
   * Approves, declines, or defers one line. The order's status is never set
   * directly — it is always re-derived from the full line set — and exiting
   * `pending_approval` stamps how long the line actually waited.
   */
  const decideLine = useCallback(
    (
      orderId: string,
      lineId: string,
      decision: Exclude<LineApprovalStatus, "pending">,
      note?: string
    ) => {
      const current = state;
      const fleetClientId = guards.clientForOrder(current, orderId);
      if (!fleetClientId) return;

      const order = current.workOrders.find((o) => o.id === orderId);
      if (!order) return;

      const now = new Date();
      const lines = order.lines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              approvalStatus: decision,
              approvedBy: actor,
              approvedAt: now.toISOString(),
              declineReason: decision === "declined" ? note ?? "" : null,
            }
          : line
      );
      const decidedLine = lines.find((l) => l.id === lineId);
      if (!decidedLine) return;

      const logEntry: ApprovalLogEntry = {
        id: approvalLogId(),
        fleetClientId,
        lineId,
        action: decision,
        actorId: actor,
        actorName: actor,
        at: now.toISOString(),
        note: note ?? null,
        amountAtTime: lineCost(decidedLine),
      };

      const newStatus = deriveOrderStatus(lines);
      const leavingPending =
        order.status === "pending_approval" &&
        newStatus !== "pending_approval" &&
        order.pendingApprovalEnteredAt;

      const statusChanged = newStatus !== order.status;
      const event = statusChanged ? workOrderEvent(newStatus, actor) : null;

      const approvalWaitHours = leavingPending
        ? businessHoursBetween(parseISO(order.pendingApprovalEnteredAt as string), now)
        : order.approvalWaitHours;

      const pendingEnteredAt =
        newStatus === "pending_approval" ? order.pendingApprovalEnteredAt : null;

      const updated: WorkOrder = {
        ...order,
        lines,
        approvalLog: [...order.approvalLog, logEntry],
        status: newStatus,
        pendingApprovalEnteredAt: pendingEnteredAt,
        approvalWaitHours,
        history: event ? [...order.history, event] : order.history,
      };

      void optimistic(
        {
          ...current,
          workOrders: current.workOrders.map((o) =>
            o.id === orderId ? updated : o
          ),
        },
        async () => {
          const supabase = requireSupabase();

          const { error: lineError } = await supabase
            .from("pms_work_order_lines")
            .update({
              approval_status: decision,
              approved_by: actor,
              approved_at: now.toISOString(),
              decline_reason: decision === "declined" ? note ?? "" : null,
            })
            .eq("id", lineId);
          if (lineError) throw new Error(lineError.message);

          const { error: orderError } = await supabase
            .from("pms_work_orders")
            .update({
              status: newStatus,
              pending_approval_entered_at: pendingEnteredAt,
              approval_wait_hours: approvalWaitHours,
            })
            .eq("id", orderId);
          if (orderError) throw new Error(orderError.message);

          const { error: logError } = await supabase
            .from("pms_approval_log")
            .insert(approvalLogEntryToRow(logEntry, orderId));
          if (logError) throw new Error(logError.message);

          if (event) {
            const { error } = await supabase.from("pms_work_order_events").insert({
              id: event.id,
              work_order_id: orderId,
              status: event.status,
              at: event.at,
              actor: event.actor,
            });
            if (error) throw new Error(error.message);
          }
        }
      );
    },
    [actor, guards, optimistic]
  );

  /** Approved or partially-approved work moves to the bay's calendar. */
  const scheduleWorkOrder = useCallback(
    (orderId: string, scheduledFor: string) => {
      const current = state;
      if (!guards.clientForOrder(current, orderId)) return;

      const order = current.workOrders.find((o) => o.id === orderId);
      if (
        !order ||
        (order.status !== "approved" && order.status !== "partially_approved")
      ) {
        return;
      }

      const event = workOrderEvent("scheduled", actor);
      const updated: WorkOrder = {
        ...order,
        scheduledFor,
        status: "scheduled",
        history: [...order.history, event],
      };

      void optimistic(
        {
          ...current,
          workOrders: current.workOrders.map((o) =>
            o.id === orderId ? updated : o
          ),
        },
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_work_orders")
            .update({ scheduled_for: scheduledFor, status: "scheduled" })
            .eq("id", orderId);
          if (error) throw new Error(error.message);

          const { error: eventError } = await supabase
            .from("pms_work_order_events")
            .insert({
              id: event.id,
              work_order_id: orderId,
              status: event.status,
              at: event.at,
              actor: event.actor,
            });
          if (eventError) throw new Error(eventError.message);
        }
      );
    },
    [actor, guards, optimistic]
  );

  /**
   * Closing a work order is what resets the PMS clock: every task the
   * technician ticked takes the order's odometer and completion date as its new
   * baseline. Findings and parts are recorded at the same moment — that is what
   * turns a work order into a service record.
   *
   * If actual cost has drifted past the approved amount by more than the
   * variance threshold, closing is refused unless `varianceApproved` is set.
   *
   * Still synchronous in its return: the variance check is local, so the caller
   * gets its answer immediately and the write settles behind it.
   */
  const completeWorkOrder = useCallback(
    (
      id: string,
      detail?: {
        odometer?: number;
        findings?: string;
        parts?: PartLine[];
        taskIds?: string[];
        varianceApproved?: boolean;
      }
    ): { ok: true } | { ok: false; error: string } => {
      const current = state;
      const fleetClientId = guards.clientForOrder(current, id);
      if (!fleetClientId) {
        return { ok: false, error: "That work order is not yours to close." };
      }

      const order = current.workOrders.find((o) => o.id === id);
      if (!order) return { ok: false, error: "Work order not found." };

      const parts = detail?.parts ?? order.parts;
      const partsTotal = parts.reduce((t, p) => t + p.quantity * p.unitCost, 0);
      const actualTotal = order.laborCost + partsTotal;
      const approvedTotal = approvedValue(order.lines);
      const breachesVariance = varianceExceeds(
        approvedTotal,
        actualTotal,
        current.approvalSettings.varianceThresholdPct
      );

      if (breachesVariance && !detail?.varianceApproved) {
        return {
          ok: false,
          error: `Actual cost (₱${actualTotal.toLocaleString()}) exceeds the approved ₱${approvedTotal.toLocaleString()} by more than ${
            current.approvalSettings.varianceThresholdPct
          }% — re-approve the variance before closing.`,
        };
      }

      const now = new Date();
      const varianceEntry: ApprovalLogEntry | null =
        breachesVariance && detail?.varianceApproved
          ? {
              id: approvalLogId(),
              fleetClientId,
              lineId: null,
              action: "variance_approved",
              actorId: actor,
              actorName: actor,
              at: now.toISOString(),
              note: `Actual ₱${actualTotal.toLocaleString()} vs approved ₱${approvedTotal.toLocaleString()}.`,
              amountAtTime: actualTotal,
            }
          : null;

      const event = workOrderEvent("closed", actor);
      const completed: WorkOrder = {
        ...order,
        status: "closed",
        completedOn: formatISO(now, { representation: "date" }),
        odometerAtService: detail?.odometer ?? order.odometerAtService,
        findings: detail?.findings ?? order.findings,
        parts,
        taskIds: detail?.taskIds ?? order.taskIds,
        approvalLog: varianceEntry
          ? [...order.approvalLog, varianceEntry]
          : order.approvalLog,
        history: [...order.history, event],
      };

      // Closing resets the PMS clock on the vehicle — the whole point of the
      // operation, and why the vehicle is written alongside the order.
      const updatedVehicle = current.vehicles.find(
        (v) => v.id === completed.vehicleId
      );
      const nextVehicle = updatedVehicle
        ? applyCompletion(updatedVehicle, completed)
        : null;

      void optimistic(
        {
          ...current,
          vehicles: current.vehicles.map((vehicle) =>
            vehicle.id === completed.vehicleId && nextVehicle
              ? nextVehicle
              : vehicle
          ),
          workOrders: current.workOrders.map((o) => (o.id === id ? completed : o)),
        },
        async () => {
          const supabase = requireSupabase();

          const { error: orderError } = await supabase
            .from("pms_work_orders")
            .update(
              workOrderToRow({
                status: "closed",
                completedOn: completed.completedOn,
                odometerAtService: completed.odometerAtService,
                findings: completed.findings,
              })
            )
            .eq("id", id);
          if (orderError) throw new Error(orderError.message);

          // Fitted parts and covered tasks are child rows now — written after
          // the order so their foreign key always has a parent to point at.
          await replaceWorkOrderTasks(supabase, id, completed.taskIds);
          await replaceWorkOrderParts(
            supabase,
            id,
            completed.parts,
            partsBySkuFor(current, guards.clientForOrder(current, id))
          );

          const { error: eventError } = await supabase
            .from("pms_work_order_events")
            .insert({
              id: event.id,
              work_order_id: id,
              status: event.status,
              at: event.at,
              actor: event.actor,
            });
          if (eventError) throw new Error(eventError.message);

          if (varianceEntry) {
            const { error } = await supabase
              .from("pms_approval_log")
              .insert(approvalLogEntryToRow(varianceEntry, id));
            if (error) throw new Error(error.message);
          }

          if (nextVehicle) {
            const { error } = await supabase
              .from("pms_vehicles")
              .update({
                task_state: nextVehicle.taskState,
                odometer: nextVehicle.odometer,
                odometer_read_at: nextVehicle.odometerReadAt,
              })
              .eq("id", nextVehicle.id);
            if (error) throw new Error(error.message);
          }
        }
      );

      return { ok: true };
    },
    [actor, guards, optimistic]
  );

  const updateVehicle = useCallback(
    (id: string, patch: Partial<Vehicle>) => {
      const current = state;
      if (!guards.clientForVehicle(current, id)) return;

      const vehicle = current.vehicles.find((v) => v.id === id);
      if (!vehicle) return;

      // `fleetClientId` is stripped: a patch can never move a vehicle between
      // clients, which would take its whole history with it.
      const updated = { ...vehicle, ...patch, fleetClientId: vehicle.fleetClientId };

      void optimistic(
        {
          ...current,
          vehicles: current.vehicles.map((v) => (v.id === id ? updated : v)),
        },
        async () => {
          const supabase = requireSupabase();
          const row = vehicleToRow({ ...patch, fleetClientId: undefined });
          if (Object.keys(row).length === 0) return;
          const { error } = await supabase
            .from("pms_vehicles")
            .update(row)
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [guards, optimistic]
  );

  /**
   * A new vehicle enters the fleet with a clean slate: every tracked interval
   * is seeded as "just done" at its starting odometer, so the PMS engine has a
   * baseline to project from instead of reading every task as overdue.
   */
  const addVehicle = useCallback(
    (draft: NewVehicleDraft): Vehicle | null => {
      const current = state;
      // No scope, or a provider spanning several clients with none named —
      // either way there is no unambiguous owner, so nothing is created.
      const fleetClientId = guards.writeClientId(current);
      if (!fleetClientId) return null;

      const now = formatISO(new Date(), { representation: "date" });
      const taskState: Record<string, TaskState> = {};
      for (const task of catalogue) {
        taskState[task.id] = { lastDoneOdometer: draft.odometer, lastDoneOn: now };
      }

      const created: Vehicle = {
        ...draft,
        id: `veh-${Date.now().toString(36)}`,
        fleetClientId,
        taskState,
      };

      void optimistic(
        { ...current, vehicles: [created, ...current.vehicles] },
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_vehicles")
            .insert(vehicleToRow(created));
          if (error) throw new Error(error.message);
        }
      );

      return created;
    },
    [guards, optimistic, catalogue]
  );

  /**
   * Sends a quotation to the client for approval — the provider's half of the
   * line-item approval loop. A draft sits with the shop; sending it starts the
   * client's clock, and the send is written into the append-only approval log
   * so "when did you actually send this" has an answer.
   */
  const sendForApproval = useCallback(
    (orderId: string): { ok: true } | { ok: false; error: string } => {
      const current = state;
      const fleetClientId = guards.clientForOrder(current, orderId);
      if (!fleetClientId) {
        return { ok: false, error: "That work order is not yours to send." };
      }

      const order = current.workOrders.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "Work order not found." };

      if (order.status !== "draft") {
        return {
          ok: false,
          error:
            order.status === "pending_approval"
              ? "This quotation is already with the client."
              : "Only a draft can be sent for approval.",
        };
      }

      if (order.lines.length === 0) {
        return {
          ok: false,
          error: "Add at least one line before sending this for approval.",
        };
      }

      const now = new Date();
      const lines = order.lines.map((line) =>
        line.approvalStatus === "pending"
          ? line
          : { ...line, approvalStatus: "pending" as const }
      );

      const logEntry: ApprovalLogEntry = {
        id: approvalLogId(),
        fleetClientId,
        lineId: null,
        action: "sent_for_approval",
        actorId: actor,
        actorName: actor,
        at: now.toISOString(),
        note: `Quotation sent for ${lines.length} ${
          lines.length === 1 ? "line" : "lines"
        }.`,
        amountAtTime: lines.reduce((t, l) => t + lineCost(l), 0),
      };

      const event = workOrderEvent("pending_approval", actor);
      const updated: WorkOrder = {
        ...order,
        lines,
        status: "pending_approval",
        pendingApprovalEnteredAt: now.toISOString(),
        approvalWaitHours: null,
        approvalLog: [...order.approvalLog, logEntry],
        history: [...order.history, event],
      };

      void optimistic(
        {
          ...current,
          workOrders: current.workOrders.map((o) =>
            o.id === orderId ? updated : o
          ),
        },
        async () => {
          const supabase = requireSupabase();

          const { error: orderError } = await supabase
            .from("pms_work_orders")
            .update({
              status: "pending_approval",
              pending_approval_entered_at: now.toISOString(),
              approval_wait_hours: null,
            })
            .eq("id", orderId);
          if (orderError) throw new Error(orderError.message);

          // Any line not already pending is reset, so the client decides on
          // the full set rather than inheriting a stale approval.
          const { error: lineError } = await supabase
            .from("pms_work_order_lines")
            .update({ approval_status: "pending" })
            .eq("work_order_id", orderId)
            .neq("approval_status", "pending");
          if (lineError) throw new Error(lineError.message);

          const { error: logError } = await supabase
            .from("pms_approval_log")
            .insert(approvalLogEntryToRow(logEntry, orderId));
          if (logError) throw new Error(logError.message);

          const { error: eventError } = await supabase
            .from("pms_work_order_events")
            .insert({
              id: event.id,
              work_order_id: orderId,
              status: event.status,
              at: event.at,
              actor: event.actor,
            });
          if (eventError) throw new Error(eventError.message);
        }
      );

      return { ok: true };
    },
    [actor, guards, optimistic]
  );

  /**
   * Onboards a fleet client. Provider-side only — a client cannot create its
   * own siblings — and the new client is pinned to the session's provider
   * rather than anything the caller supplies.
   */
  const addFleetClient = useCallback(
    (draft: NewFleetClientDraft): FleetClient | null => {
      if (scope?.kind !== "provider") return null;
      const current = state;

      const created: FleetClient = {
        ...draft,
        id: `fc-${Date.now().toString(36)}`,
        providerId: scope.providerId,
        createdAt: formatISO(new Date(), { representation: "date" }),
      };

      void optimistic(
        { ...current, fleetClients: [...current.fleetClients, created] },
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_fleet_clients")
            .insert(fleetClientToRow(created));
          if (error) throw new Error(error.message);
        }
      );

      return created;
    },
    [scope, optimistic]
  );

  /** Edits a client's contract terms, branding, and approval overrides. */
  const updateFleetClient = useCallback(
    (id: string, patch: Partial<Omit<FleetClient, "id" | "providerId">>) => {
      const current = state;
      const ids = guards.clientIds(current);
      if (!ids.has(id)) return;

      const client = current.fleetClients.find((c) => c.id === id);
      if (!client) return;

      // `id` and `providerId` are stripped: a patch cannot move a client
      // between providers or collide with another's id.
      const updated = {
        ...client,
        ...patch,
        id: client.id,
        providerId: client.providerId,
      };

      void optimistic(
        {
          ...current,
          fleetClients: current.fleetClients.map((c) => (c.id === id ? updated : c)),
        },
        async () => {
          const supabase = requireSupabase();
          const row = fleetClientToRow({
            ...patch,
            id: undefined,
            providerId: undefined,
          });
          if (Object.keys(row).length === 0) return;
          const { error } = await supabase
            .from("pms_fleet_clients")
            .update(row)
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [guards, optimistic]
  );

  /**
   * Releases a vehicle at the counter. Only closed work orders can be
   * collected — an open job means the vehicle is not finished — and the release
   * is stamped with who let it go and when.
   */
  const collectWorkOrders = useCallback(
    (orderIds: string[]): { collected: number } => {
      const current = state;
      const wanted = new Set(orderIds);
      const at = new Date().toISOString();
      const ids = guards.clientIds(current);
      const clientOf = new Map(current.vehicles.map((v) => [v.id, v.fleetClientId]));

      const collectedIds: string[] = [];
      const workOrders = current.workOrders.map((order) => {
        if (!wanted.has(order.id)) return order;
        if (order.status !== "closed" || order.collectedAt) return order;
        const owner = clientOf.get(order.vehicleId);
        if (!owner || !ids.has(owner)) return order;

        collectedIds.push(order.id);
        return { ...order, collectedAt: at, collectedBy: actor };
      });

      if (collectedIds.length === 0) return { collected: 0 };

      void optimistic({ ...current, workOrders }, async () => {
        const supabase = requireSupabase();
        const { error } = await supabase
          .from("pms_work_orders")
          .update({ collected_at: at, collected_by: actor })
          .in("id", collectedIds);
        if (error) throw new Error(error.message);
      });

      return { collected: collectedIds.length };
    },
    [actor, guards, optimistic]
  );

  /**
   * Files a document. Still returns synchronously with the size check, which is
   * the failure users actually hit; the upload itself settles behind it.
   *
   * The 1.5 MB cap is retained. Files are stored as data URLs in a text column
   * rather than in object storage, so an unbounded upload would bloat every
   * subsequent read of the documents table.
   */
  const addDocument = useCallback(
    (draft: NewDocumentDraft): { ok: true } | { ok: false; error: string } => {
      if (draft.sizeBytes > MAX_DOCUMENT_BYTES) {
        return {
          ok: false,
          error: `Files must be under ${Math.round(
            MAX_DOCUMENT_BYTES / 1000
          )} KB in this demo build.`,
        };
      }

      const current = state;
      // Prefer the linked vehicle's client so a provider-side user filing
      // against a specific vehicle files to the right tenant; fall back to the
      // session's own client for unlinked documents.
      const fleetClientId = draft.vehicleId
        ? guards.clientForVehicle(current, draft.vehicleId)
        : guards.writeClientId(current);
      if (!fleetClientId) {
        return { ok: false, error: "There's no client to file this document under." };
      }

      const created: FleetDocument = {
        ...draft,
        id: `doc-${Date.now().toString(36)}`,
        fleetClientId,
        uploadedOn: formatISO(new Date(), { representation: "date" }),
      };

      void optimistic(
        { ...current, documents: [created, ...current.documents] },
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_documents")
            .insert(documentToRow(created));
          if (error) throw new Error(error.message);
        }
      );

      return { ok: true };
    },
    [guards, optimistic]
  );

  const deleteDocument = useCallback(
    (id: string) => {
      const current = state;
      const ids = guards.clientIds(current);
      const doc = current.documents.find((d) => d.id === id);
      // Deleting by a guessed id must not reach another tenant's file.
      if (!doc || !ids.has(doc.fleetClientId)) return;

      void optimistic(
        {
          ...current,
          documents: current.documents.filter((entry) => entry.id !== id),
        },
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_documents")
            .delete()
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [guards, optimistic]
  );

  /**
   * All three alert actions write into the caller's own bucket only, so a
   * dismissal made while looking at one client cannot silence the equivalent
   * alert for another. Buckets are now per user as well as per scope — one
   * person's dismissal is not a decision for their colleagues.
   */
  const patchAlerts = useCallback(
    (update: (current: AlertInteraction) => AlertInteraction) => {
      if (!scope || !session) return;
      const key = tenantScopeKey(scope);
      const current = state;
      const mine = current.alerts[key] ?? { readIds: [], dismissedIds: [] };
      const next = update(mine);
      const userId = session.uid;

      void optimistic(
        { ...current, alerts: { ...current.alerts, [key]: next } },
        async () => {
          await saveAlertInteraction(
            userId,
            key,
            next.readIds,
            next.dismissedIds
          );
        }
      );
    },
    [scope, session, optimistic]
  );

  const markAlertsRead = useCallback(
    (ids: string[]) => {
      patchAlerts((mine) => ({
        ...mine,
        readIds: [...new Set([...mine.readIds, ...ids])],
      }));
    },
    [patchAlerts]
  );

  const dismissAlert = useCallback(
    (id: string) => {
      patchAlerts((mine) => ({
        readIds: [...new Set([...mine.readIds, id])],
        dismissedIds: [...new Set([...mine.dismissedIds, id])],
      }));
    },
    [patchAlerts]
  );

  const restoreAlerts = useCallback(() => {
    patchAlerts((mine) => ({ ...mine, dismissedIds: [] }));
  }, [patchAlerts]);

  /**
   * A client edits its own negotiated thresholds; a provider edits the defaults
   * every client inherits. Writing the global object from a client session was
   * the bug here — one client's threshold change applied to all of them.
   */
  const updateApprovalSettings = useCallback(
    (patch: Partial<ApprovalSettings>) => {
      if (!scope) return;
      const current = state;

      if (scope.kind === "provider") {
        const next = { ...current.approvalSettings, ...patch };
        void optimistic({ ...current, approvalSettings: next }, async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_approval_settings")
            .update(approvalSettingsToRow(patch))
            .eq("provider_id", scope.providerId);
          if (error) throw new Error(error.message);
        });
        return;
      }

      const client = current.fleetClients.find((c) => c.id === scope.fleetClientId);
      if (!client) return;

      const overrides = { ...client.approvalThresholdOverrides, ...patch };
      void optimistic(
        {
          ...current,
          fleetClients: current.fleetClients.map((c) =>
            c.id === scope.fleetClientId
              ? { ...c, approvalThresholdOverrides: overrides }
              : c
          ),
        },
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_fleet_clients")
            .update({ approval_threshold_overrides: overrides })
            .eq("id", scope.fleetClientId);
          if (error) throw new Error(error.message);
        }
      );
    },
    [scope, optimistic]
  );

  /**
   * Turns selected demand-forecast rows into draft purchase orders, one per
   * distinct preferred vendor. Rows with no shortfall are skipped;
   * `serviceTaskIds`/`vehicleIds` on each line are what let the next forecast
   * run recognise this demand as already covered instead of counting it twice.
   */
  const generatePurchaseOrders = useCallback(
    (
      rows: {
        part: Part;
        shortfall: number;
        contributingItems: { vehicleId: string; taskId: string }[];
      }[]
    ) => {
      const current = state;
      const fleetClientId = guards.writeClientId(current);
      if (!fleetClientId) return;

      const linesByVendor = new Map<string, PurchaseOrderLine[]>();

      for (const row of rows) {
        if (row.shortfall <= 0) continue;
        const line: PurchaseOrderLine = {
          id: `poline-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          partId: row.part.id,
          description: row.part.name,
          quantity: row.shortfall,
          unitCost: row.part.unitCost,
          serviceTaskIds: [...new Set(row.contributingItems.map((i) => i.taskId))],
          vehicleIds: [...new Set(row.contributingItems.map((i) => i.vehicleId))],
        };
        const list = linesByVendor.get(row.part.preferredVendor) ?? [];
        list.push(line);
        linesByVendor.set(row.part.preferredVendor, list);
      }

      const startSeq = current.purchaseOrders.length;
      const created: PurchaseOrder[] = [...linesByVendor.entries()].map(
        ([vendor, lines], index) => ({
          id: `po-${Date.now().toString(36)}-${index}`,
          fleetClientId,
          reference: `PO-${new Date().getFullYear()}-${String(
            startSeq + index + 1
          ).padStart(4, "0")}`,
          vendor,
          status: "draft",
          createdOn: formatISO(new Date(), { representation: "date" }),
          createdBy: actor,
          lines,
          notes: "",
        })
      );

      if (created.length === 0) return;

      void optimistic(
        {
          ...current,
          purchaseOrders: [...created, ...current.purchaseOrders],
        },
        async () => {
          const supabase = requireSupabase();

          const { error } = await supabase
            .from("pms_purchase_orders")
            .insert(created.map(purchaseOrderToRow));
          if (error) throw new Error(error.message);

          const lineRows = created.flatMap((po) =>
            po.lines.map((line) => purchaseOrderLineToRow(line, po.id))
          );
          if (lineRows.length > 0) {
            const { error: lineError } = await supabase
              .from("pms_purchase_order_lines")
              .insert(lineRows);
            if (lineError) throw new Error(lineError.message);
          }

          // The task/vehicle coverage a line was raised for — junction rows
          // since 0006, inserted after the lines they reference.
          const allLines = created.flatMap((po) => po.lines);

          const taskRows = allLines.flatMap(purchaseOrderLineTaskRows);
          if (taskRows.length > 0) {
            const { error: taskError } = await supabase
              .from("pms_purchase_order_line_tasks")
              .insert(taskRows);
            if (taskError) throw new Error(taskError.message);
          }

          const vehicleRows = allLines.flatMap(purchaseOrderLineVehicleRows);
          if (vehicleRows.length > 0) {
            const { error: vehicleError } = await supabase
              .from("pms_purchase_order_line_vehicles")
              .insert(vehicleRows);
            if (vehicleError) throw new Error(vehicleError.message);
          }
        }
      );
    },
    [actor, guards, optimistic]
  );

  /**
   * Receiving a PO is what makes the forecast self-correcting: the parts it
   * covers go back into stock, so the next forecast run sees the shortfall
   * close without anyone editing inventory by hand.
   */
  const updatePurchaseOrderStatus = useCallback(
    (id: string, status: PurchaseOrderStatus) => {
      const current = state;
      const ids = guards.clientIds(current);
      const order = current.purchaseOrders.find((o) => o.id === id);
      if (!order || !ids.has(order.fleetClientId)) return;

      // Stock is per client: receiving one client's order must not replenish
      // another's shelf just because the part id matches.
      const restocked = new Map<string, number>();
      if (status === "received") {
        for (const line of order.lines) {
          restocked.set(
            line.partId,
            (restocked.get(line.partId) ?? 0) + line.quantity
          );
        }
      }

      const parts = current.parts.map((part) => {
        if (part.fleetClientId !== order.fleetClientId) return part;
        const received = restocked.get(part.id) ?? 0;
        return received > 0
          ? { ...part, currentStock: part.currentStock + received }
          : part;
      });

      void optimistic(
        {
          ...current,
          parts,
          purchaseOrders: current.purchaseOrders.map((o) =>
            o.id === id ? { ...o, status } : o
          ),
        },
        async () => {
          const supabase = requireSupabase();

          const { error } = await supabase
            .from("pms_purchase_orders")
            .update({ status })
            .eq("id", id);
          if (error) throw new Error(error.message);

          if (status === "received") {
            // One update per part, since each lands on a different row and
            // PostgREST has no bulk "add to existing value" form.
            for (const part of parts) {
              if (part.fleetClientId !== order.fleetClientId) continue;
              if (!restocked.has(part.id)) continue;
              const { error: stockError } = await supabase
                .from("pms_parts")
                .update({ current_stock: part.currentStock })
                .eq("id", part.id);
              if (stockError) throw new Error(stockError.message);
            }
          }
        }
      );
    },
    [guards, optimistic]
  );

  /**
   * Branding belongs to the provider, so it is written onto the `Provider`
   * record rather than a shared blob. A client-side session cannot reach it —
   * rebranding the service centre's own instance is not a fleet client's call.
   */
  const updateTenantSettings = useCallback(
    (patch: Partial<TenantSettings>) => {
      if (scope?.kind !== "provider") return;
      const current = state;

      const providers = current.providers.map((provider) =>
        provider.id === scope.providerId
          ? {
              ...provider,
              name: patch.displayName ?? provider.name,
              logoUrl: patch.logoUrl !== undefined ? patch.logoUrl : provider.logoUrl,
              brandColor: patch.brandColor ?? provider.brandColor,
              supportEmail: patch.supportEmail ?? provider.supportEmail,
            }
          : provider
      );

      void optimistic({ ...current, providers }, async () => {
        const supabase = requireSupabase();
        const row: Record<string, unknown> = {};
        if (patch.displayName !== undefined) row.name = patch.displayName;
        if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
        if (patch.brandColor !== undefined) row.brand_color = patch.brandColor;
        if (patch.supportEmail !== undefined) row.support_email = patch.supportEmail;
        if (Object.keys(row).length === 0) return;

        const { error } = await supabase
          .from("pms_providers")
          .update(row)
          .eq("id", scope.providerId);
        if (error) throw new Error(error.message);
      });
    },
    [scope, optimistic]
  );

  /** Same optimistic-then-persist shape as `optimistic`, for the catalogue. */
  const optimisticTasks = useCallback(
    async (
      next: ServiceTask[],
      persist: () => Promise<void>
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const previous = catalogue;
      commitServiceTasks(next);
      try {
        await persist();
        return { ok: true };
      } catch (error) {
        commitServiceTasks(previous);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[store] write failed, rolled back: ${message}`);
        return { ok: false, error: message };
      }
    },
    [catalogue]
  );

  /**
   * Adds a service task to the provider's PMS interval catalogue.
   *
   * Provider-side only, like `addFleetClient` — a fleet client is measured
   * against this schedule but does not set it. The id is derived from the
   * name so it reads sensibly in `Vehicle.taskState`, and de-duplicated
   * against the existing catalogue since that map is keyed by task id.
   */
  const addServiceTask = useCallback(
    (draft: Omit<ServiceTask, "id">): { ok: true } | { ok: false; error: string } => {
      if (scope?.kind !== "provider") {
        return { ok: false, error: "Only the provider can edit the interval catalogue." };
      }

      const slug = draft.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const existingIds = new Set(catalogue.map((t) => t.id));
      let id = slug || `task-${Date.now().toString(36)}`;
      if (existingIds.has(id)) id = `${id}-${Date.now().toString(36)}`;

      const created: ServiceTask = { ...draft, id };

      void optimisticTasks([...catalogue, created], async () => {
        const supabase = requireSupabase();
        const { error } = await supabase
          .from("pms_service_tasks")
          .insert(serviceTaskToRow(created, scope.providerId));
        if (error) throw new Error(error.message);
      });

      return { ok: true };
    },
    [scope, catalogue, optimisticTasks]
  );

  const updateServiceTask = useCallback(
    (id: string, patch: Partial<Omit<ServiceTask, "id">>) => {
      if (scope?.kind !== "provider") return;
      const existing = catalogue.find((t) => t.id === id);
      if (!existing) return;

      const updated = { ...existing, ...patch, id };

      void optimisticTasks(
        catalogue.map((t) => (t.id === id ? updated : t)),
        async () => {
          const supabase = requireSupabase();
          const row = serviceTaskToRow(patch, scope.providerId);
          delete row.provider_id; // never move a task between providers
          if (Object.keys(row).length === 0) return;
          const { error } = await supabase
            .from("pms_service_tasks")
            .update(row)
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [scope, catalogue, optimisticTasks]
  );

  /**
   * Removes a task from the catalogue. Existing vehicles keep whatever
   * `taskState` entry they already have for this id — it simply stops being
   * evaluated, rather than being scrubbed from every vehicle's history.
   */
  const deleteServiceTask = useCallback(
    (id: string) => {
      if (scope?.kind !== "provider") return;

      void optimisticTasks(
        catalogue.filter((t) => t.id !== id),
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_service_tasks")
            .delete()
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [scope, catalogue, optimisticTasks]
  );

  /** Same optimistic-then-persist shape as `optimistic`, for the technician roster. */
  const optimisticTechnicians = useCallback(
    async (
      next: ProviderTechnician[],
      persist: () => Promise<void>
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const previous = technicians;
      commitTechnicians(next);
      try {
        await persist();
        return { ok: true };
      } catch (error) {
        commitTechnicians(previous);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[store] write failed, rolled back: ${message}`);
        return { ok: false, error: message };
      }
    },
    [technicians]
  );

  /**
   * Adds a technician to the provider's staff roster.
   *
   * Provider-side only, like `addServiceTask` — a technician is a property of
   * the shop, and a fleet client's work order can name one but not add to the
   * roster. `pms_technicians` has a `unique (provider_id, name)` constraint,
   * so a duplicate name surfaces as a write failure rather than silently
   * creating a second row for the same person.
   */
  const addTechnician = useCallback(
    (
      draft: Omit<ProviderTechnician, "id">
    ): { ok: true } | { ok: false; error: string } => {
      if (scope?.kind !== "provider") {
        return { ok: false, error: "Only the provider can edit the technician roster." };
      }

      const created: ProviderTechnician = {
        ...draft,
        id: `tech-${Date.now().toString(36)}`,
      };

      void optimisticTechnicians([...technicians, created], async () => {
        const supabase = requireSupabase();
        const { error } = await supabase
          .from("pms_technicians")
          .insert(providerTechnicianToRow(created, scope.providerId));
        if (error) throw new Error(error.message);
      });

      return { ok: true };
    },
    [scope, technicians, optimisticTechnicians]
  );

  const updateTechnician = useCallback(
    (id: string, patch: Partial<Omit<ProviderTechnician, "id">>) => {
      if (scope?.kind !== "provider") return;
      const existing = technicians.find((t) => t.id === id);
      if (!existing) return;

      const updated = { ...existing, ...patch, id };

      void optimisticTechnicians(
        technicians.map((t) => (t.id === id ? updated : t)),
        async () => {
          const supabase = requireSupabase();
          const row = providerTechnicianToRow(patch, scope.providerId);
          delete row.provider_id; // never move a technician between providers
          if (Object.keys(row).length === 0) return;
          const { error } = await supabase
            .from("pms_technicians")
            .update(row)
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [scope, technicians, optimisticTechnicians]
  );

  /**
   * Removes a technician outright. `technician_id` on any of their past work
   * orders resolves to null (`on delete set null`) rather than blocking the
   * delete — those orders keep rendering the historical `technician` text
   * label regardless. Retiring someone without erasing them is `updateTechnician(id, { active: false })`.
   */
  const deleteTechnician = useCallback(
    (id: string) => {
      if (scope?.kind !== "provider") return;

      void optimisticTechnicians(
        technicians.filter((t) => t.id !== id),
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase
            .from("pms_technicians")
            .delete()
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [scope, technicians, optimisticTechnicians]
  );

  /** Same optimistic-then-persist shape as `optimistic`, for the vendor list. */
  const optimisticVendors = useCallback(
    async (
      next: ProviderVendor[],
      persist: () => Promise<void>
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const previous = vendors;
      commitVendors(next);
      try {
        await persist();
        return { ok: true };
      } catch (error) {
        commitVendors(previous);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[store] write failed, rolled back: ${message}`);
        return { ok: false, error: message };
      }
    },
    [vendors]
  );

  /** Adds a vendor to the provider's approved list. Provider-side only. */
  const addVendor = useCallback(
    (draft: Omit<ProviderVendor, "id">): { ok: true } | { ok: false; error: string } => {
      if (scope?.kind !== "provider") {
        return { ok: false, error: "Only the provider can edit the vendor list." };
      }

      const created: ProviderVendor = {
        ...draft,
        id: `vendor-${Date.now().toString(36)}`,
      };

      void optimisticVendors([...vendors, created], async () => {
        const supabase = requireSupabase();
        const { error } = await supabase
          .from("pms_vendors")
          .insert(providerVendorToRow(created, scope.providerId));
        if (error) throw new Error(error.message);
      });

      return { ok: true };
    },
    [scope, vendors, optimisticVendors]
  );

  const updateVendor = useCallback(
    (id: string, patch: Partial<Omit<ProviderVendor, "id">>) => {
      if (scope?.kind !== "provider") return;
      const existing = vendors.find((v) => v.id === id);
      if (!existing) return;

      const updated = { ...existing, ...patch, id };

      void optimisticVendors(
        vendors.map((v) => (v.id === id ? updated : v)),
        async () => {
          const supabase = requireSupabase();
          const row = providerVendorToRow(patch, scope.providerId);
          delete row.provider_id; // never move a vendor between providers
          if (Object.keys(row).length === 0) return;
          const { error } = await supabase
            .from("pms_vendors")
            .update(row)
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [scope, vendors, optimisticVendors]
  );

  /** Removes a vendor outright; past work orders keep their `vendor` text label. */
  const deleteVendor = useCallback(
    (id: string) => {
      if (scope?.kind !== "provider") return;

      void optimisticVendors(
        vendors.filter((v) => v.id !== id),
        async () => {
          const supabase = requireSupabase();
          const { error } = await supabase.from("pms_vendors").delete().eq("id", id);
          if (error) throw new Error(error.message);
        }
      );
    },
    [scope, vendors, optimisticVendors]
  );

  /** Whether the current session may edit branding at all — provider-side only. */
  const canEditBranding = scope?.kind === "provider";

  /**
   * Reloads from the database.
   *
   * This replaces the old "reset demo data" action. Reseeding is no longer the
   * client's job: the seed lives in `supabase/migrations/0003_pms_seed.sql` and
   * is applied to the database, so a destructive client-side reset would delete
   * shared rows for every other user of the instance rather than just the
   * caller's own browser copy. Refetching is the honest equivalent.
   */
  const resetFleet = useCallback(() => {
    void refreshFleetState();
  }, []);

  return {
    createWorkOrder,
    updateWorkOrder,
    decideLine,
    scheduleWorkOrder,
    completeWorkOrder,
    updateVehicle,
    addVehicle,
    collectWorkOrders,
    sendForApproval,
    addFleetClient,
    updateFleetClient,
    addDocument,
    deleteDocument,
    markAlertsRead,
    dismissAlert,
    restoreAlerts,
    updateApprovalSettings,
    generatePurchaseOrders,
    updatePurchaseOrderStatus,
    updateTenantSettings,
    canEditBranding,
    resetFleet,
    addServiceTask,
    updateServiceTask,
    deleteServiceTask,
    addTechnician,
    updateTechnician,
    deleteTechnician,
    addVendor,
    updateVendor,
    deleteVendor,
  };
}
