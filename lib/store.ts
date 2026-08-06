"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { formatISO, parseISO } from "date-fns";
import type {
  ApprovalLogEntry,
  ApprovalSettings,
  FleetDocument,
  FleetState,
  LineApprovalStatus,
  PartLine,
  Vehicle,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderLine,
} from "@/types";
import { createSeedState } from "@/lib/seed";
import { applyCompletion, evaluateFleet, summariseFleet } from "@/lib/pms";
import { buildAlerts, viewAlerts } from "@/lib/alerts";
import { useSession } from "@/lib/auth";
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
// sane default (the WorkOrderStatus rewrite for the approval workflow) —
// old payloads are discarded rather than half-migrated. See lib/approvals.ts.
const STORAGE_KEY = "pms.fleet.v2";

/**
 * Server snapshot. Rendering a real fleet on the server would fight hydration —
 * every due-date calculation depends on "now" — so the shell renders empty and
 * the store fills in on mount.
 */
const EMPTY: FleetState = {
  vehicles: [],
  workOrders: [],
  documents: [],
  alerts: { readIds: [], dismissedIds: [] },
  approvalSettings: DEFAULT_APPROVAL_SETTINGS,
};

let state: FleetState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * Brings a stored payload up to the current shape. Records written before parts,
 * findings, documents, or alert state existed are still in people's browsers;
 * without this, reading `order.parts.length` would throw on their first load.
 */
function normalise(raw: Partial<FleetState> | null | undefined): FleetState {
  return {
    vehicles: (raw?.vehicles ?? []).map((vehicle) => ({
      ...vehicle,
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
      approvalLog: order.approvalLog ?? [],
      pendingApprovalEnteredAt: order.pendingApprovalEnteredAt ?? null,
      approvalWaitHours: order.approvalWaitHours ?? null,
      // Records written before the timeline existed still carry their status;
      // give them a single synthesized entry rather than an empty history.
      history:
        order.history ?? [
          { id: `${order.id}-legacy`, status: order.status, at: order.openedOn, actor: "—" },
        ],
    })),
    documents: raw?.documents ?? [],
    alerts: {
      readIds: raw?.alerts?.readIds ?? [],
      dismissedIds: raw?.alerts?.dismissedIds ?? [],
    },
    approvalSettings: { ...DEFAULT_APPROVAL_SETTINGS, ...raw?.approvalSettings },
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

/** Raw fleet state plus a `ready` flag for skeleton rendering. */
export function useFleetState() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  return { state: snapshot, ready: snapshot !== EMPTY };
}

/**
 * Fleet state with the PMS engine already applied. Recomputing on every render
 * is cheap at fleet scale and keeps derived health from drifting out of sync
 * with the underlying records.
 */
export function useFleet() {
  const { state: snapshot, ready } = useFleetState();

  return useMemo(() => {
    const health = evaluateFleet(snapshot.vehicles);
    return {
      ready,
      vehicles: snapshot.vehicles,
      workOrders: snapshot.workOrders,
      documents: snapshot.documents,
      alertState: snapshot.alerts,
      approvalSettings: snapshot.approvalSettings,
      health,
      healthById: new Map(health.map((h) => [h.vehicle.id, h])),
      vehiclesById: new Map(snapshot.vehicles.map((v) => [v.id, v])),
      summary: summariseFleet(health),
    };
  }, [snapshot, ready]);
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
>;

export function useFleetActions() {
  const { session } = useSession();
  const actor = session?.name ?? "System";

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
    [actor]
  );

  const updateWorkOrder = useCallback(
    (id: string, patch: Partial<WorkOrder>) => {
      setState((current) => ({
        ...current,
        workOrders: current.workOrders.map((order) =>
          order.id === id
            ? {
                ...order,
                ...patch,
                history:
                  patch.status && patch.status !== order.status
                    ? [...order.history, workOrderEvent(patch.status, actor)]
                    : order.history,
              }
            : order
        ),
      }));
    },
    [actor]
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
    [actor]
  );

  /** Approved or partially-approved work moves to the bay's calendar. */
  const scheduleWorkOrder = useCallback(
    (orderId: string, scheduledFor: string) => {
      setState((current) => ({
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
      }));
    },
    [actor]
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
    [actor]
  );

  const updateVehicle = useCallback((id: string, patch: Partial<Vehicle>) => {
    setState((current) => ({
      ...current,
      vehicles: current.vehicles.map((vehicle) =>
        vehicle.id === id ? { ...vehicle, ...patch } : vehicle
      ),
    }));
  }, []);

  const addDocument = useCallback(
    (draft: Omit<FleetDocument, "id" | "uploadedOn">) => {
      if (draft.sizeBytes > MAX_DOCUMENT_BYTES) {
        return {
          ok: false as const,
          error: `Files must be under ${Math.round(
            MAX_DOCUMENT_BYTES / 1000
          )} KB in this demo build.`,
        };
      }

      return setStateChecked((current) => ({
        ...current,
        documents: [
          {
            ...draft,
            id: `doc-${Date.now().toString(36)}`,
            uploadedOn: formatISO(new Date(), { representation: "date" }),
          },
          ...current.documents,
        ],
      }));
    },
    []
  );

  const deleteDocument = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      documents: current.documents.filter((doc) => doc.id !== id),
    }));
  }, []);

  const markAlertsRead = useCallback((ids: string[]) => {
    setState((current) => ({
      ...current,
      alerts: {
        ...current.alerts,
        readIds: [...new Set([...current.alerts.readIds, ...ids])],
      },
    }));
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      alerts: {
        readIds: [...new Set([...current.alerts.readIds, id])],
        dismissedIds: [...new Set([...current.alerts.dismissedIds, id])],
      },
    }));
  }, []);

  const restoreAlerts = useCallback(() => {
    setState((current) => ({
      ...current,
      alerts: { ...current.alerts, dismissedIds: [] },
    }));
  }, []);

  const updateApprovalSettings = useCallback((patch: Partial<ApprovalSettings>) => {
    setState((current) => ({
      ...current,
      approvalSettings: { ...current.approvalSettings, ...patch },
    }));
  }, []);

  const resetFleet = useCallback(() => {
    setState(() => createSeedState());
  }, []);

  return {
    createWorkOrder,
    updateWorkOrder,
    decideLine,
    scheduleWorkOrder,
    completeWorkOrder,
    updateVehicle,
    addDocument,
    deleteDocument,
    markAlertsRead,
    dismissAlert,
    restoreAlerts,
    updateApprovalSettings,
    resetFleet,
  };
}
