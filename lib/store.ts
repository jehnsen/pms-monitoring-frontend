"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { formatISO, parseISO } from "date-fns";
import type {
  AlertInteraction,
  AlertInteractionByScope,
  ApprovalLogEntry,
  ApprovalSettings,
  FleetClient,
  FleetDocument,
  FleetState,
  LineApprovalStatus,
  Part,
  PartLine,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  TaskState,
  TenantSettings,
  Vehicle,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
} from "@/types";
import { createSeedState } from "@/lib/seed";
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { applyCompletion, evaluateFleet, summariseFleet } from "@/lib/pms";
import { buildAlerts, viewAlerts } from "@/lib/alerts";
import { useSession } from "@/lib/auth";
import {
  DEFAULT_TENANT_SETTINGS,
  SEED_FLEET_CLIENT,
  SEED_PROVIDER,
} from "@/lib/tenant";
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

// Bumped when the shape of a required field changes in a way that has no
// sane default (the WorkOrderStatus rewrite, then the DocumentKind rewrite
// for PH-specific compliance kinds) — old payloads are discarded rather than
// half-migrated. See lib/approvals.ts / lib/compliance.ts.
const STORAGE_KEY = "pms.fleet.v3";

/**
 * Server snapshot. Rendering a real fleet on the server would fight hydration —
 * every due-date calculation depends on "now" — so the shell renders empty and
 * the store fills in on mount.
 */
const EMPTY: FleetState = {
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

let state: FleetState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * Brings a stored payload up to the current shape. Records written before parts,
 * findings, documents, or alert state existed are still in people's browsers;
 * without this, reading `order.parts.length` would throw on their first load.
 */
/**
 * TENANCY BACKFILL for alert bookkeeping. Payloads written before tenancy hold
 * a single flat `{ readIds, dismissedIds }`; those decisions were all made
 * against the seeded client, so they migrate into that client's bucket rather
 * than being thrown away or leaking into every other tenant.
 */
function normaliseAlerts(
  raw: AlertInteractionByScope | AlertInteraction | null | undefined
): AlertInteractionByScope {
  if (!raw) return {};

  const legacy = raw as Partial<AlertInteraction>;
  if (Array.isArray(legacy.readIds) || Array.isArray(legacy.dismissedIds)) {
    return {
      [`client:${SEED_FLEET_CLIENT.id}`]: {
        readIds: legacy.readIds ?? [],
        dismissedIds: legacy.dismissedIds ?? [],
      },
    };
  }

  const byScope = raw as AlertInteractionByScope;
  return Object.fromEntries(
    Object.entries(byScope).map(([key, value]) => [
      key,
      {
        readIds: value?.readIds ?? [],
        dismissedIds: value?.dismissedIds ?? [],
      },
    ])
  );
}

function normalise(raw: Partial<FleetState> | null | undefined): FleetState {
  // ---------------------------------------------------------------- backfill
  // TENANCY BACKFILL (one-off). Every record written before tenancy existed
  // belongs to the single seeded provider/client, so an absent `fleetClientId`
  // resolves to `SEED_FLEET_CLIENT`. This is a read-time backfill, not a
  // rewrite: `approvalLog` entries are stamped as they are read and no update
  // or delete path is added to that append-only list anywhere in this module.
  const seedClient = SEED_FLEET_CLIENT.id;

  const providers = raw?.providers?.length ? raw.providers : [SEED_PROVIDER];
  const fleetClients = raw?.fleetClients?.length
    ? raw.fleetClients
    : [SEED_FLEET_CLIENT];

  return {
    providers,
    fleetClients,
    vehicles: (raw?.vehicles ?? []).map((vehicle) => ({
      ...vehicle,
      fleetClientId: vehicle.fleetClientId ?? seedClient,
      // Older records predate the reading date; treat the odometer as current.
      odometerReadAt:
        vehicle.odometerReadAt ??
        formatISO(new Date(), { representation: "date" }),
    })),
    workOrders: (raw?.workOrders ?? []).map((order) => ({
      ...order,
      parts: order.parts ?? [],
      findings: order.findings ?? "",
      lines: order.lines ?? [],
      // Append-only: entries are stamped with the tenant they already belonged
      // to, never reordered, removed, or otherwise rewritten.
      approvalLog: (order.approvalLog ?? []).map((entry) => ({
        ...entry,
        fleetClientId: entry.fleetClientId ?? seedClient,
      })),
      pendingApprovalEnteredAt: order.pendingApprovalEnteredAt ?? null,
      approvalWaitHours: order.approvalWaitHours ?? null,
      // Shop-side fields. Orders written before the counter workflow existed
      // recorded a date but no arrival slot, and no bay or collection.
      bayId: order.bayId ?? null,
      scheduledTime: order.scheduledTime ?? null,
      collectedAt: order.collectedAt ?? null,
      collectedBy: order.collectedBy ?? null,
      // Records written before the timeline existed still carry their status;
      // give them a single synthesized entry rather than an empty history.
      history:
        order.history ?? [
          { id: `${order.id}-legacy`, status: order.status, at: order.openedOn, actor: "—" },
        ],
    })),
    documents: (raw?.documents ?? []).map((doc) => ({
      ...doc,
      fleetClientId: doc.fleetClientId ?? seedClient,
    })),
    alerts: normaliseAlerts(raw?.alerts),
    approvalSettings: { ...DEFAULT_APPROVAL_SETTINGS, ...raw?.approvalSettings },
    parts: (raw?.parts ?? []).map((part) => ({
      ...part,
      fleetClientId: part.fleetClientId ?? seedClient,
    })),
    purchaseOrders: (raw?.purchaseOrders ?? []).map((po) => ({
      ...po,
      fleetClientId: po.fleetClientId ?? seedClient,
    })),
    tenant: { ...DEFAULT_TENANT_SETTINGS, ...raw?.tenant },
  };
}

function read(): FleetState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FleetState>;
      if (parsed?.vehicles?.length) return normalise(parsed);
    }
  } catch {
    // Corrupt or unavailable storage — fall through and reseed.
  }
  const seeded = createSeedState();
  persist(seeded);
  return seeded;
}

/** Returns false when the write was rejected — quota is the realistic case. */
function persist(next: FleetState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function ensureHydrated() {
  if (!hydrated && typeof window !== "undefined") {
    state = read();
    hydrated = true;
  }
  return state;
}

function emit() {
  for (const listener of listeners) listener();
}

function setState(updater: (current: FleetState) => FleetState) {
  const next = updater(ensureHydrated());
  state = next;
  persist(next);
  emit();
}

/**
 * Like `setState`, but reports storage failure and rolls back rather than
 * leaving memory and localStorage disagreeing. Used for document uploads, the
 * only path that can realistically exhaust the quota.
 */
function setStateChecked(
  updater: (current: FleetState) => FleetState
): { ok: true } | { ok: false; error: string } {
  const previous = ensureHydrated();
  const next = updater(previous);

  if (!persist(next)) {
    state = previous;
    persist(previous);
    return {
      ok: false,
      error:
        "Browser storage is full. Delete an existing document or use a smaller file.",
    };
  }

  state = next;
  emit();
  return { ok: true };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return ensureHydrated();
}

function getServerSnapshot() {
  return EMPTY;
}

/**
 * The unscoped snapshot. Deliberately **not** exported — every consumer goes
 * through `useFleetState`, which applies the tenant scope. Adding a new screen
 * therefore gets scoping by default rather than by remembering to ask for it.
 */
function useRawFleetState() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  return { snapshot, ready: snapshot !== EMPTY };
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
      // Fail closed, but loudly — an empty dashboard with no explanation is
      // indistinguishable from data loss.
      console.warn(
        `[tenancy] no scope resolved for ${session.email} (${denial}); rendering nothing.`
      );
    }

    return { scope, denial, ready };
  }, [session, snapshot.providers, snapshot.fleetClients, ready]);
}

/** Tenant-scoped fleet state plus a `ready` flag for skeleton rendering. */
export function useFleetState() {
  const { snapshot, ready } = useRawFleetState();
  const { scope } = useTenantScope();

  const state = useMemo(
    () => scopeFleetState(snapshot, scope),
    [snapshot, scope]
  );

  return { state, ready, scope };
}

/**
 * Fleet state with the PMS engine already applied. Recomputing on every render
 * is cheap at fleet scale and keeps derived health from drifting out of sync
 * with the underlying records.
 *
 * Everything returned here is already narrowed to the caller's tenant — the
 * `vehiclesById` / `healthById` indexes included, so a component holding one
 * cannot look up a record outside its own scope.
 */
export function useFleet() {
  const { state: snapshot, ready, scope } = useFleetState();

  return useMemo(() => {
    const health = evaluateFleet(snapshot.vehicles);
    return {
      ready,
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
      health,
      healthById: new Map(health.map((h) => [h.vehicle.id, h])),
      vehiclesById: new Map(snapshot.vehicles.map((v) => [v.id, v])),
      summary: summariseFleet(health),
    };
  }, [snapshot, ready, scope]);
}

/**
 * Live alerts, recomputed from fleet state and folded together with the user's
 * read/dismiss decisions.
 */
export function useAlerts() {
  const { ready, health, workOrders, documents, alertState, approvalSettings } =
    useFleet();

  return useMemo(() => {
    const alerts = buildAlerts(health, workOrders, documents, approvalSettings);
    return { ready, ...viewAlerts(alerts, alertState) };
  }, [ready, health, workOrders, documents, alertState, approvalSettings]);
}

/** Largest single upload accepted, in bytes. Keeps one file from filling the quota. */
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
  /** Set at check-in when the advisor assigns a bay; otherwise unassigned. */
  bayId?: string | null;
  /** Arrival slot, "HH:mm". Set at check-in; otherwise the date alone. */
  scheduledTime?: string | null;
};

export function useFleetActions() {
  const { session } = useSession();
  const actor = session?.name ?? "System";
  const { scope } = useTenantScope();

  /**
   * Writes are scoped by the same rule as reads. Every mutation below runs
   * through one of these two guards, so a mutation cannot reach a record the
   * session does not own — and with no scope at all, nothing mutates.
   */
  const guards = useMemo(() => {
    const clientIds = (current: FleetState) =>
      new Set(visibleFleetClientIds(scope, current.fleetClients));

    /** The client a newly created record belongs to, or null when ambiguous. */
    const writeClientId = (current: FleetState): string | null => {
      if (!scope) return null;
      if (scope.kind === "client") return scope.fleetClientId;
      // Provider-side: unambiguous only when the provider has exactly one
      // client. Otherwise the caller must say which, and none of today's
      // dialogs do — so fail closed rather than guess.
      const ids = [...clientIds(current)];
      return ids.length === 1 ? ids[0] : null;
    };

    /** The client owning `vehicleId`, if the session may touch that vehicle. */
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

    /** The client owning `orderId`, resolved through its vehicle. */
    const clientForOrder = (current: FleetState, orderId: string): string | null => {
      const order = current.workOrders.find((o) => o.id === orderId);
      if (!order) return null;
      return clientForVehicle(current, order.vehicleId);
    };

    return { clientIds, writeClientId, clientForVehicle, clientForOrder };
  }, [scope]);

  /**
   * Every job is a purchase before it's a repair: the lines supplied here run
   * through the approval thresholds immediately. Under the auto-approve
   * ceiling, every line is approved on the spot (system actor, logged) and
   * the order opens already `approved`; otherwise it opens `pending_approval`
   * and the wait-time clock (`pendingApprovalEnteredAt`) starts now.
   */
  const createWorkOrder = useCallback(
    (draft: NewWorkOrderDraft, lineDrafts: NewWorkOrderLine[], settings: ApprovalSettings) => {
      let created: WorkOrder | null = null;
      setState((current) => {
        // Raising a job against a vehicle outside the session's scope is a
        // no-op, not a silent cross-tenant write.
        const fleetClientId = guards.clientForVehicle(current, draft.vehicleId);
        if (!fleetClientId) return current;

        const seq = current.workOrders.length + 1;
        const now = new Date();
        const total = lineDrafts.reduce((sum, l) => sum + l.partCost + l.labourCost, 0);
        const autoApprove = requiredApprover(total, settings) === "auto";

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

        created = {
          ...draft,
          id: `wo-${Date.now().toString(36)}`,
          reference: `WO-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`,
          bayId: draft.bayId ?? null,
          scheduledTime: draft.scheduledTime ?? null,
          // A job cannot be collected before it has been done.
          collectedAt: null,
          collectedBy: null,
          status,
          lines,
          approvalLog,
          pendingApprovalEnteredAt: status === "pending_approval" ? now.toISOString() : null,
          approvalWaitHours: null,
          history: [workOrderEvent(status, actor)],
        };
        return { ...current, workOrders: [created, ...current.workOrders] };
      });
      return created;
    },
    [actor, guards]
  );

  const updateWorkOrder = useCallback(
    (id: string, patch: Partial<WorkOrder>) => {
      setState((current) => {
        if (!guards.clientForOrder(current, id)) return current;
        return {
          ...current,
          workOrders: current.workOrders.map((order) =>
            order.id === id
              ? {
                  ...order,
                  ...patch,
                  // A patch may not re-point an order at another tenant's
                  // vehicle, which would drag it across the boundary.
                  vehicleId: order.vehicleId,
                  history:
                    patch.status && patch.status !== order.status
                      ? [...order.history, workOrderEvent(patch.status, actor)]
                      : order.history,
                }
              : order
          ),
        };
      });
    },
    [actor, guards]
  );

  /**
   * Approves, declines, or defers one line. The order's status is never set
   * directly — it's always re-derived from the full line set — and exiting
   * `pending_approval` stamps how long the line actually waited.
   */
  const decideLine = useCallback(
    (
      orderId: string,
      lineId: string,
      decision: Exclude<LineApprovalStatus, "pending">,
      note?: string
    ) => {
      setState((current) => {
        const fleetClientId = guards.clientForOrder(current, orderId);
        if (!fleetClientId) return current;

        const order = current.workOrders.find((o) => o.id === orderId);
        if (!order) return current;

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
        if (!decidedLine) return current;

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

        const updated: WorkOrder = {
          ...order,
          lines,
          approvalLog: [...order.approvalLog, logEntry],
          status: newStatus,
          pendingApprovalEnteredAt:
            newStatus === "pending_approval" ? order.pendingApprovalEnteredAt : null,
          approvalWaitHours: leavingPending
            ? businessHoursBetween(parseISO(order.pendingApprovalEnteredAt as string), now)
            : order.approvalWaitHours,
          history:
            newStatus !== order.status
              ? [...order.history, workOrderEvent(newStatus, actor)]
              : order.history,
        };

        return {
          ...current,
          workOrders: current.workOrders.map((o) => (o.id === orderId ? updated : o)),
        };
      });
    },
    [actor, guards]
  );

  /** Approved or partially-approved work moves to the bay's calendar. */
  const scheduleWorkOrder = useCallback(
    (orderId: string, scheduledFor: string) => {
      setState((current) => {
        if (!guards.clientForOrder(current, orderId)) return current;
        return {
          ...current,
          workOrders: current.workOrders.map((order) =>
            order.id === orderId &&
            (order.status === "approved" || order.status === "partially_approved")
              ? {
                  ...order,
                  scheduledFor,
                  status: "scheduled",
                  history: [...order.history, workOrderEvent("scheduled", actor)],
                }
              : order
          ),
        };
      });
    },
    [actor, guards]
  );

  /**
   * Closing a work order is what resets the PMS clock: every task the
   * technician ticked takes the order's odometer and completion date as its
   * new baseline. The findings and parts list are recorded at the same
   * moment — that is what turns a work order into a service record.
   *
   * If the actual cost has drifted past the approved amount by more than the
   * variance threshold, closing is refused unless `varianceApproved` is set —
   * the caller is expected to have walked the user through that confirmation
   * first (see `CompleteWorkOrderDialog`).
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
      let result: { ok: true } | { ok: false; error: string } = { ok: true };

      setState((current) => {
        const fleetClientId = guards.clientForOrder(current, id);
        if (!fleetClientId) return current;

        const order = current.workOrders.find((o) => o.id === id);
        if (!order) return current;

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
          result = {
            ok: false,
            error: `Actual cost (₱${actualTotal.toLocaleString()}) exceeds the approved ₱${approvedTotal.toLocaleString()} by more than ${
              current.approvalSettings.varianceThresholdPct
            }% — re-approve the variance before closing.`,
          };
          return current;
        }

        const now = new Date();
        const approvalLog =
          breachesVariance && detail?.varianceApproved
            ? [
                ...order.approvalLog,
                {
                  id: approvalLogId(),
                  fleetClientId,
                  lineId: null,
                  action: "variance_approved" as const,
                  actorId: actor,
                  actorName: actor,
                  at: now.toISOString(),
                  note: `Actual ₱${actualTotal.toLocaleString()} vs approved ₱${approvedTotal.toLocaleString()}.`,
                  amountAtTime: actualTotal,
                },
              ]
            : order.approvalLog;

        const completed: WorkOrder = {
          ...order,
          status: "closed",
          completedOn: formatISO(now, { representation: "date" }),
          odometerAtService: detail?.odometer ?? order.odometerAtService,
          findings: detail?.findings ?? order.findings,
          parts,
          taskIds: detail?.taskIds ?? order.taskIds,
          approvalLog,
          history: [...order.history, workOrderEvent("closed", actor)],
        };

        return {
          ...current,
          vehicles: current.vehicles.map((vehicle) =>
            vehicle.id === completed.vehicleId
              ? applyCompletion(vehicle, completed)
              : vehicle
          ),
          workOrders: current.workOrders.map((o) => (o.id === id ? completed : o)),
        };
      });

      return result;
    },
    [actor, guards]
  );

  const updateVehicle = useCallback(
    (id: string, patch: Partial<Vehicle>) => {
      setState((current) => {
        if (!guards.clientForVehicle(current, id)) return current;
        return {
          ...current,
          vehicles: current.vehicles.map((vehicle) =>
            vehicle.id === id
              ? // `fleetClientId` is stripped: a patch can never move a vehicle
                // between clients, which would take its whole history with it.
                { ...vehicle, ...patch, fleetClientId: vehicle.fleetClientId }
              : vehicle
          ),
        };
      });
    },
    [guards]
  );

  /**
   * A new vehicle enters the fleet with a clean slate: every tracked interval
   * is seeded as "just done" at its starting odometer, so the PMS engine has
   * a baseline to project from instead of reading every task as overdue.
   */
  const addVehicle = useCallback(
    (draft: NewVehicleDraft): Vehicle | null => {
      let created: Vehicle | null = null;
      setState((current) => {
        // No scope, or a provider spanning several clients with no client
        // named — either way there is no unambiguous owner, so nothing is
        // created.
        const fleetClientId = guards.writeClientId(current);
        if (!fleetClientId) return current;

        const now = formatISO(new Date(), { representation: "date" });
        const taskState: Record<string, TaskState> = {};
        for (const task of SERVICE_TASKS) {
          taskState[task.id] = { lastDoneOdometer: draft.odometer, lastDoneOn: now };
        }
        created = {
          ...draft,
          id: `veh-${Date.now().toString(36)}`,
          fleetClientId,
          taskState,
        };
        return { ...current, vehicles: [created, ...current.vehicles] };
      });
      return created;
    },
    [guards]
  );

  /**
   * Sends a quotation to the client for approval — the provider's half of the
   * line-item approval loop.
   *
   * A draft sits with the shop; sending it starts the client's clock. The
   * wait timer keys off `pendingApprovalEnteredAt`, and the send is written
   * into the append-only approval log so "when did you actually send this"
   * has an answer that does not depend on anyone's memory.
   *
   * Nothing is notified explicitly: alerts are derived from state on every
   * read, so the moment this lands the client's approvers see it.
   */
  const sendForApproval = useCallback(
    (orderId: string): { ok: true } | { ok: false; error: string } => {
      let result: { ok: true } | { ok: false; error: string } = {
        ok: false,
        error: "That work order is not yours to send.",
      };

      setState((current) => {
        const fleetClientId = guards.clientForOrder(current, orderId);
        if (!fleetClientId) return current;

        const order = current.workOrders.find((o) => o.id === orderId);
        if (!order) return current;

        if (order.status !== "draft") {
          result = {
            ok: false,
            error:
              order.status === "pending_approval"
                ? "This quotation is already with the client."
                : "Only a draft can be sent for approval.",
          };
          return current;
        }

        if (order.lines.length === 0) {
          result = {
            ok: false,
            error: "Add at least one line before sending this for approval.",
          };
          return current;
        }

        const now = new Date();
        const lines = order.lines.map((line) =>
          line.approvalStatus === "pending"
            ? line
            : { ...line, approvalStatus: "pending" as const }
        );

        const updated: WorkOrder = {
          ...order,
          lines,
          status: "pending_approval",
          pendingApprovalEnteredAt: now.toISOString(),
          approvalWaitHours: null,
          approvalLog: [
            ...order.approvalLog,
            {
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
            },
          ],
          history: [...order.history, workOrderEvent("pending_approval", actor)],
        };

        result = { ok: true };
        return {
          ...current,
          workOrders: current.workOrders.map((o) =>
            o.id === orderId ? updated : o
          ),
        };
      });

      return result;
    },
    [actor, guards]
  );

  /**
   * Onboards a fleet client. Provider-side only — a client cannot create its
   * own siblings — and the new client is pinned to the session's provider
   * rather than anything the caller supplies.
   */
  const addFleetClient = useCallback(
    (draft: NewFleetClientDraft): FleetClient | null => {
      let created: FleetClient | null = null;
      setState((current) => {
        if (scope?.kind !== "provider") return current;
        created = {
          ...draft,
          id: `fc-${Date.now().toString(36)}`,
          providerId: scope.providerId,
          createdAt: formatISO(new Date(), { representation: "date" }),
        };
        return { ...current, fleetClients: [...current.fleetClients, created] };
      });
      return created;
    },
    [scope]
  );

  /** Edits a client's contract terms, branding, and approval overrides. */
  const updateFleetClient = useCallback(
    (id: string, patch: Partial<Omit<FleetClient, "id" | "providerId">>) => {
      setState((current) => {
        const ids = guards.clientIds(current);
        if (!ids.has(id)) return current;
        return {
          ...current,
          fleetClients: current.fleetClients.map((client) =>
            client.id === id
              ? // `id` and `providerId` are stripped: a patch cannot move a
                // client between providers or collide with another's id.
                { ...client, ...patch, id: client.id, providerId: client.providerId }
              : client
          ),
        };
      });
    },
    [guards]
  );

  /**
   * Releases a vehicle at the counter. Only closed work orders can be
   * collected — an open job means the vehicle is not finished, whatever the
   * advisor thinks — and the release is stamped with who let it go and when,
   * because "who released it" is the first question asked when one leaves
   * without being paid for.
   */
  const collectWorkOrders = useCallback(
    (orderIds: string[]): { collected: number } => {
      let collected = 0;
      const wanted = new Set(orderIds);
      const at = new Date().toISOString();

      setState((current) => {
        const ids = guards.clientIds(current);
        const clientOf = new Map(
          current.vehicles.map((v) => [v.id, v.fleetClientId])
        );

        const workOrders = current.workOrders.map((order) => {
          if (!wanted.has(order.id)) return order;
          if (order.status !== "closed" || order.collectedAt) return order;
          const owner = clientOf.get(order.vehicleId);
          if (!owner || !ids.has(owner)) return order;

          collected += 1;
          return { ...order, collectedAt: at, collectedBy: actor };
        });

        return collected > 0 ? { ...current, workOrders } : current;
      });

      return { collected };
    },
    [actor, guards]
  );

  const addDocument = useCallback(
    (draft: NewDocumentDraft) => {
      if (draft.sizeBytes > MAX_DOCUMENT_BYTES) {
        return {
          ok: false as const,
          error: `Files must be under ${Math.round(
            MAX_DOCUMENT_BYTES / 1000
          )} KB in this demo build.`,
        };
      }

      return setStateChecked((current) => {
        // Prefer the linked vehicle's client so a provider-side user filing
        // against a specific vehicle files to the right tenant; fall back to
        // the session's own client for unlinked documents.
        const fleetClientId = draft.vehicleId
          ? guards.clientForVehicle(current, draft.vehicleId)
          : guards.writeClientId(current);
        if (!fleetClientId) return current;

        return {
          ...current,
          documents: [
            {
              ...draft,
              id: `doc-${Date.now().toString(36)}`,
              fleetClientId,
              uploadedOn: formatISO(new Date(), { representation: "date" }),
            },
            ...current.documents,
          ],
        };
      });
    },
    [guards]
  );

  const deleteDocument = useCallback(
    (id: string) => {
      setState((current) => {
        const ids = guards.clientIds(current);
        const doc = current.documents.find((d) => d.id === id);
        // Deleting by a guessed id must not reach another tenant's file.
        if (!doc || !ids.has(doc.fleetClientId)) return current;
        return {
          ...current,
          documents: current.documents.filter((entry) => entry.id !== id),
        };
      });
    },
    [guards]
  );

  /**
   * All three alert actions write into the caller's own bucket only, so a
   * dismissal made while looking at one client cannot silence the equivalent
   * alert for another.
   */
  const patchAlerts = useCallback(
    (update: (current: AlertInteraction) => AlertInteraction) => {
      if (!scope) return;
      const key = tenantScopeKey(scope);
      setState((current) => ({
        ...current,
        alerts: {
          ...current.alerts,
          [key]: update(
            current.alerts[key] ?? { readIds: [], dismissedIds: [] }
          ),
        },
      }));
    },
    [scope]
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
      setState((current) => {
        if (!scope) return current;

        if (scope.kind === "provider") {
          return {
            ...current,
            approvalSettings: { ...current.approvalSettings, ...patch },
          };
        }

        return {
          ...current,
          fleetClients: current.fleetClients.map((client) =>
            client.id === scope.fleetClientId
              ? {
                  ...client,
                  approvalThresholdOverrides: {
                    ...client.approvalThresholdOverrides,
                    ...patch,
                  },
                }
              : client
          ),
        };
      });
    },
    [scope]
  );

  /**
   * Turns selected demand-forecast rows into draft purchase orders, one per
   * distinct preferred vendor — the "generate purchase request" action. Rows
   * with no shortfall are skipped (nothing to buy); `serviceTaskIds`/
   * `vehicleIds` on each line are what let the next forecast run recognise
   * this demand as already covered instead of counting it twice.
   */
  const generatePurchaseOrders = useCallback(
    (
      rows: {
        part: Part;
        shortfall: number;
        contributingItems: { vehicleId: string; taskId: string }[];
      }[]
    ) => {
      setState((current) => {
        const fleetClientId = guards.writeClientId(current);
        if (!fleetClientId) return current;

        const linesByVendor = new Map<string, PurchaseOrderLine[]>();

        for (const row of rows) {
          if (row.shortfall <= 0) continue;
          const line: PurchaseOrderLine = {
            id: `poline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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

        if (created.length === 0) return current;
        return { ...current, purchaseOrders: [...created, ...current.purchaseOrders] };
      });
    },
    [actor, guards]
  );

  /**
   * Receiving a PO is what makes the forecast self-correcting: the parts it
   * covers go back into stock, so the next forecast run sees the shortfall
   * close without anyone editing inventory by hand.
   */
  const updatePurchaseOrderStatus = useCallback(
    (id: string, status: PurchaseOrderStatus) => {
      setState((current) => {
        const ids = guards.clientIds(current);
        const order = current.purchaseOrders.find((o) => o.id === id);
        if (!order || !ids.has(order.fleetClientId)) return current;

        const parts =
          status === "received"
            ? current.parts.map((part) => {
                // Stock is per client: receiving Actimed's order must not
                // replenish another client's shelf just because the part id
                // matches.
                if (part.fleetClientId !== order.fleetClientId) return part;
                const received = order.lines
                  .filter((line) => line.partId === part.id)
                  .reduce((total, line) => total + line.quantity, 0);
                return received > 0
                  ? { ...part, currentStock: part.currentStock + received }
                  : part;
              })
            : current.parts;

        return {
          ...current,
          parts,
          purchaseOrders: current.purchaseOrders.map((o) =>
            o.id === id ? { ...o, status } : o
          ),
        };
      });
    },
    [guards]
  );

  /**
   * Branding belongs to the provider, so it is written onto the `Provider`
   * record rather than the shared `tenant` blob. A client-side session cannot
   * reach it — rebranding the service centre's own instance is not a fleet
   * client's call to make.
   */
  const updateTenantSettings = useCallback(
    (patch: Partial<TenantSettings>) => {
      setState((current) => {
        if (scope?.kind !== "provider") return current;
        return {
          ...current,
          providers: current.providers.map((provider) =>
            provider.id === scope.providerId
              ? {
                  ...provider,
                  name: patch.displayName ?? provider.name,
                  logoUrl:
                    patch.logoUrl !== undefined ? patch.logoUrl : provider.logoUrl,
                  brandColor: patch.brandColor ?? provider.brandColor,
                  supportEmail: patch.supportEmail ?? provider.supportEmail,
                }
              : provider
          ),
        };
      });
    },
    [scope]
  );

  /** Whether the current session may edit branding at all — provider-side only. */
  const canEditBranding = scope?.kind === "provider";

  /**
   * Resets **only the caller's own tenant**. This previously replaced the
   * entire state with a fresh seed, which meant one client's "reset demo data"
   * button destroyed every other client on the instance and collapsed the
   * whole tree back to a single tenant.
   *
   * The seeded fleet belongs to `SEED_FLEET_CLIENT`, so its rows are spliced
   * back in only when that client is actually in scope; any other client
   * resets to empty rather than inheriting someone else's vehicles. Either
   * way the provider/client registry itself is left standing.
   */
  const resetFleet = useCallback(() => {
    setState((current) => {
      const ids = guards.clientIds(current);
      if (ids.size === 0) return current;

      const keep = <T extends { fleetClientId: string }>(rows: T[]) =>
        rows.filter((row) => !ids.has(row.fleetClientId));

      const fresh = ids.has(SEED_FLEET_CLIENT.id) ? createSeedState() : null;

      return {
        ...current,
        vehicles: [...keep(current.vehicles), ...(fresh?.vehicles ?? [])],
        // Work orders derive their tenant, so they are dropped by reference to
        // the vehicles going away rather than by a column of their own.
        workOrders: [
          ...current.workOrders.filter((order) => {
            const vehicle = current.vehicles.find((v) => v.id === order.vehicleId);
            return !vehicle || !ids.has(vehicle.fleetClientId);
          }),
          ...(fresh?.workOrders ?? []),
        ],
        documents: [...keep(current.documents), ...(fresh?.documents ?? [])],
        parts: [...keep(current.parts), ...(fresh?.parts ?? [])],
        purchaseOrders: [
          ...keep(current.purchaseOrders),
          ...(fresh?.purchaseOrders ?? []),
        ],
      };
    });
  }, [guards]);

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
  };
}
