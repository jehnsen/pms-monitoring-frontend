"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { formatISO } from "date-fns";
import type {
  AlertInteraction,
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
  WorkOrderLine,
} from "@/types";
import { applyCompletion, evaluateFleet, summariseFleet } from "@/lib/pms";
import { buildAlerts, viewAlerts } from "@/lib/alerts";
import { useSession } from "@/lib/auth";
import { requireSupabase } from "@/lib/supabase";
import {
  alertsForScope,
  approvalSettingsForClient,
  explainTenantScope,
  scopeFleetState,
  tenantScopeKey,
  visibleFleetClientIds,
} from "@/lib/tenancy";
import { businessDate } from "@/lib/business-date";
import {
  PlanError,
  applyLineDecisions,
  isCollectable,
  planClose,
  planDraftEdit,
  planSendForApproval,
  planTransition,
  type DraftPatch,
  type PlanContext,
} from "@/lib/work-order-plans";
import type { CommandResult } from "@/server/commands/result";
import {
  cancelAction,
  closeAction,
  createWorkOrderAction,
  decideLinesAction,
  markCollectedAction,
  scheduleAction,
  sendForApprovalAction,
  startAction,
  updateDraftAction,
} from "@/server/actions/work-orders";
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
 *  - **Work orders and approvals are written by server commands**, not here
 *    (`server/actions/work-orders.ts`; the browser role cannot write those
 *    tables since migration 0010). The store sends intent, draws an optimistic
 *    preview with the same pure planners the server runs
 *    (`lib/work-order-plans.ts`), then swaps in the canonical rows the command
 *    returns — or restores the previous rows if it refuses. Every other
 *    entity still writes through PostgREST until Phase 2 moves it.
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

/* -------------------------------------------- server-command reconciliation */

interface RecordSet {
  orders: WorkOrder[];
  vehicles?: Vehicle[];
}

/**
 * Swaps whole records into local state by id; records not held yet are
 * prepended (lists are newest-first). Used both to adopt a command's
 * canonical rows and to put back the pre-optimistic ones on refusal.
 */
function adopt({ orders, vehicles = [] }: RecordSet) {
  if (orders.length === 0 && vehicles.length === 0) return;
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const held = new Set(state.workOrders.map((order) => order.id));
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  commit({
    ...state,
    workOrders: [
      ...orders.filter((order) => !held.has(order.id)),
      ...state.workOrders.map((order) => ordersById.get(order.id) ?? order),
    ],
    vehicles: state.vehicles.map((vehicle) => vehiclesById.get(vehicle.id) ?? vehicle),
  });
}

/**
 * Runs a server command with an optional optimistic preview.
 *
 * The preview is applied first; then, on success, the command's canonical
 * rows replace it, and on any refusal (or a network failure, which is
 * reported as one) the exact records the preview touched are restored. Ids
 * minted for the preview are placeholders: the canonical rows carry the
 * server's ids and replace them.
 */
async function submitCommand<T>(
  label: string,
  preview: RecordSet | null,
  call: () => Promise<CommandResult<T>>,
  canonicalOf: (data: T) => RecordSet
): Promise<CommandResult<T>> {
  const previous: RecordSet = {
    orders: (preview?.orders ?? [])
      .map((order) => state.workOrders.find((held) => held.id === order.id))
      .filter((order): order is WorkOrder => Boolean(order)),
    vehicles: (preview?.vehicles ?? [])
      .map((vehicle) => state.vehicles.find((held) => held.id === vehicle.id))
      .filter((vehicle): vehicle is Vehicle => Boolean(vehicle)),
  };
  if (preview) adopt(preview);

  let result: CommandResult<T>;
  try {
    result = await call();
  } catch (error) {
    console.error(`[store] ${label}: request failed`, error);
    result = {
      ok: false,
      code: "conflict",
      message: "Couldn't reach the server — nothing was changed.",
    };
  }

  if (result.ok) {
    adopt(canonicalOf(result.data));
  } else {
    adopt(previous);
    console.error(`[store] ${label} refused (${result.code}): ${result.message}`);
  }
  return result;
}

/** A planner's answer for the preview, or null when it refuses locally — the
 * server still gets the final say, since local state can be stale. */
function tryPlan<T>(plan: () => T): T | null {
  try {
    return plan();
  } catch (error) {
    if (error instanceof PlanError) return null;
    throw error;
  }
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

/**
 * What a caller supplies for a new line — the approval fields are the store's
 * to set, and so are the extended amounts.
 *
 * A caller gives quantities and rates; `partCost`/`labourCost` are computed
 * from them by `recalcLine`, never passed in. That is what stops a dialog from
 * submitting a total that disagrees with the numbers it displayed.
 */
export type NewWorkOrderLine = Pick<
  WorkOrderLine,
  | "description"
  | "category"
  | "quantity"
  | "unitPartRate"
  | "labourHours"
  | "labourRate"
  | "urgency"
  | "partsSource"
  | "photoUrls"
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

/** The header fields `updateDraft` accepts; everything else is another command's. */
const DRAFT_FIELDS = [
  "title",
  "type",
  "priority",
  "scheduledFor",
  "scheduledTime",
  "bayId",
  "technician",
  "vendor",
  "notes",
  "taskIds",
  "laborCost",
  "partsCost",
] as const satisfies readonly (keyof DraftPatch)[];

function pickDraftPatch(patch: Partial<WorkOrder>): DraftPatch {
  const picked: Record<string, unknown> = {};
  for (const field of DRAFT_FIELDS) {
    if (patch[field] !== undefined) picked[field] = patch[field];
  }
  return picked as DraftPatch;
}

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
   * The provider that owns a fleet client — one hop up the tenancy tree.
   *
   * Read from the client record rather than the session so it is correct for a
   * provider-side user acting on any of its clients, and so an approval stamps
   * the provider that actually owns the work rather than whoever clicked.
   */
  const providerIdForClient = useCallback(
    (current: FleetState, fleetClientId: string): string | null =>
      current.fleetClients.find((c) => c.id === fleetClientId)?.providerId ?? null,
    []
  );

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
   * The preview context for a planner: same actor, client and provider the
   * server will use. Ids minted here are placeholders the canonical rows
   * replace.
   */
  const planContextFor = useCallback(
    (current: FleetState, fleetClientId: string): PlanContext => ({
      actor: { id: session?.uid ?? "", name: actor },
      fleetClientId,
      providerId: providerIdForClient(current, fleetClientId) ?? "",
      now: new Date(),
      newId: () => `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    }),
    [session, actor, providerIdForClient]
  );

  /**
   * Raises a work order through the `createWorkOrder` server command.
   *
   * No optimistic preview: the order's id and number are the server's to
   * issue, so this resolves with the canonical order once the command answers
   * (or null if it refuses). Every job is still a purchase before it is a
   * repair — the server prices the lines and decides auto-approval against
   * the vehicle's client's own effective bands. `settings` is accepted so call
   * sites keep compiling, and is ignored for that reason.
   */
  const createWorkOrder = useCallback(
    async (
      draft: NewWorkOrderDraft,
      lineDrafts: NewWorkOrderLine[],
      _settings?: ApprovalSettings
    ): Promise<WorkOrder | null> => {
      if (!guards.clientForVehicle(state, draft.vehicleId)) return null;
      const result = await submitCommand(
        "createWorkOrder",
        null,
        () => createWorkOrderAction({ ...draft, lines: lineDrafts }),
        (data) => ({ orders: [data.order] })
      );
      return result.ok ? result.data.order : null;
    },
    [guards]
  );

  /**
   * Kept for its call sites, which move status (start, cancel, schedule) or
   * edit a draft's header. Each of those is its own server command. Statuses
   * that belong to another action — quoting, approval, close — are refused
   * here rather than written around their rules.
   */
  const updateWorkOrder = useCallback(
    (id: string, patch: Partial<WorkOrder>) => {
      const current = state;
      const fleetClientId = guards.clientForOrder(current, id);
      const order = current.workOrders.find((o) => o.id === id);
      if (!fleetClientId || !order) return;
      const ctx = planContextFor(current, fleetClientId);
      const { status } = patch;

      if (status && status !== order.status) {
        if (status !== "in_progress" && status !== "cancelled" && status !== "scheduled") {
          console.warn(`[store] "${status}" is set by its own action, not updateWorkOrder.`);
          return;
        }
        const fields =
          status === "scheduled" ? { scheduledFor: patch.scheduledFor ?? order.scheduledFor } : {};
        const preview = tryPlan(() => planTransition(order, status, fields, ctx));
        const action =
          status === "in_progress" ? startAction : status === "cancelled" ? cancelAction : scheduleAction;
        void submitCommand(
          `transition:${status}`,
          preview && { orders: [preview.order] },
          () => action({ orderId: id, ...fields }),
          (data) => ({ orders: [data.order] })
        );
        return;
      }

      const draftPatch = pickDraftPatch(patch);
      if (Object.keys(draftPatch).length === 0) return;
      const preview = tryPlan(() => planDraftEdit(order, draftPatch, ctx));
      void submitCommand(
        "updateDraft",
        preview && { orders: [preview.order] },
        () => updateDraftAction({ orderId: id, patch: draftPatch }),
        (data) => ({ orders: [data.order] })
      );
    },
    [guards, planContextFor]
  );

  /**
   * Approves, declines, or defers one line via `decideLines`. The preview
   * re-derives the order's status from its lines exactly as the server will;
   * the server additionally enforces the approval band for this user.
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
      const order = current.workOrders.find((o) => o.id === orderId);
      if (!fleetClientId || !order) return;

      const decisions = [{ lineId, decision, note: note ?? null }];
      const preview = tryPlan(() =>
        applyLineDecisions(order, decisions, planContextFor(current, fleetClientId))
      );
      void submitCommand(
        "decideLines",
        preview && { orders: [preview.order] },
        () => decideLinesAction({ orderId, decisions }),
        (data) => ({ orders: [data.order] })
      );
    },
    [guards, planContextFor]
  );

  /** Approved or partially-approved work moves to the bay's calendar. */
  const scheduleWorkOrder = useCallback(
    (orderId: string, scheduledFor: string) => {
      const current = state;
      const fleetClientId = guards.clientForOrder(current, orderId);
      const order = current.workOrders.find((o) => o.id === orderId);
      if (!fleetClientId || !order) return;

      const preview = tryPlan(() =>
        planTransition(order, "scheduled", { scheduledFor }, planContextFor(current, fleetClientId))
      );
      void submitCommand(
        "schedule",
        preview && { orders: [preview.order] },
        () => scheduleAction({ orderId, scheduledFor }),
        (data) => ({ orders: [data.order] })
      );
    },
    [guards, planContextFor]
  );

  /**
   * Closes a work order via the `close` command, which records the service
   * record, resets the vehicle's PMS clock, and logs any variance re-approval
   * in one transaction.
   *
   * Still synchronous in its return: the variance check runs locally through
   * the same planner the server uses, so the dialog gets its answer at once;
   * the write settles behind it and rolls back if the server disagrees.
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

      const client = current.fleetClients.find((c) => c.id === fleetClientId);
      const settings = client
        ? approvalSettingsForClient(client, current.approvalSettings)
        : current.approvalSettings;
      const completion = {
        odometer: detail?.odometer,
        findings: detail?.findings,
        parts: detail?.parts,
        taskIds: detail?.taskIds,
      };
      const varianceApproved = Boolean(detail?.varianceApproved);

      let plan: ReturnType<typeof planClose>;
      try {
        plan = planClose(
          order,
          completion,
          settings,
          { varianceApproved, completedOn: businessDate(new Date()) },
          planContextFor(current, fleetClientId)
        );
      } catch (error) {
        if (error instanceof PlanError) return { ok: false, error: error.message };
        throw error;
      }

      const vehicle = current.vehicles.find((v) => v.id === order.vehicleId);
      void submitCommand(
        "close",
        {
          orders: [plan.order],
          vehicles: vehicle ? [applyCompletion(vehicle, plan.order)] : [],
        },
        () => closeAction({ orderId: id, ...completion, varianceApproved }),
        (data) => ({ orders: [data.order], vehicles: [data.vehicle] })
      );

      return { ok: true };
    },
    [guards, planContextFor]
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
   * Sends a quotation to the client for approval via `sendForApproval` — the
   * provider's half of the approval loop. The server issues the order number
   * (a re-sent order keeps the one it has) and logs the send; until it
   * answers, the preview shows the order unnumbered rather than guessing.
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

      let preview: ReturnType<typeof planSendForApproval>;
      try {
        preview = planSendForApproval(order, () => "", planContextFor(current, fleetClientId));
      } catch (error) {
        if (error instanceof PlanError) return { ok: false, error: error.message };
        throw error;
      }

      void submitCommand(
        "sendForApproval",
        { orders: [preview.order] },
        () => sendForApprovalAction({ orderId }),
        (data) => ({ orders: [data.order] })
      );
      return { ok: true };
    },
    [guards, planContextFor]
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
   * Releases vehicles at the counter via `markCollected`. Only closed,
   * not-yet-collected orders are collected — an open job means the vehicle is
   * not finished — and the server stamps who let it go and when.
   */
  const collectWorkOrders = useCallback(
    (orderIds: string[]): { collected: number } => {
      const current = state;
      const ids = guards.clientIds(current);
      const clientOf = new Map(current.vehicles.map((v) => [v.id, v.fleetClientId]));
      const at = new Date().toISOString();

      const preview = current.workOrders
        .filter((order) => orderIds.includes(order.id) && isCollectable(order))
        .filter((order) => ids.has(clientOf.get(order.vehicleId) ?? ""))
        .map((order) => ({ ...order, collectedAt: at, collectedBy: actor }));

      if (preview.length === 0) return { collected: 0 };

      void submitCommand(
        "markCollected",
        { orders: preview },
        () => markCollectedAction({ orderIds: preview.map((order) => order.id) }),
        (data) => ({ orders: data.orders })
      );
      return { collected: preview.length };
    },
    [actor, guards]
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
