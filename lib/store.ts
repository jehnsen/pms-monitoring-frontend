"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { formatISO } from "date-fns";
import type {
  FleetDocument,
  FleetState,
  PartLine,
  Vehicle,
  WorkOrder,
} from "@/types";
import { createSeedState } from "@/lib/seed";
import { applyCompletion, evaluateFleet, summariseFleet } from "@/lib/pms";
import { buildAlerts, viewAlerts } from "@/lib/alerts";

const STORAGE_KEY = "pms.fleet.v1";

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
    vehicles: raw?.vehicles ?? [],
    workOrders: (raw?.workOrders ?? []).map((order) => ({
      ...order,
      parts: order.parts ?? [],
      findings: order.findings ?? "",
    })),
    documents: raw?.documents ?? [],
    alerts: {
      readIds: raw?.alerts?.readIds ?? [],
      dismissedIds: raw?.alerts?.dismissedIds ?? [],
    },
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
  const { ready, health, workOrders, documents, alertState } = useFleet();

  return useMemo(() => {
    const alerts = buildAlerts(health, workOrders, documents);
    return { ready, ...viewAlerts(alerts, alertState) };
  }, [ready, health, workOrders, documents, alertState]);
}

/** Largest single upload accepted, in bytes. Keeps one file from filling the quota. */
export const MAX_DOCUMENT_BYTES = 1_500_000;

export function useFleetActions() {
  const createWorkOrder = useCallback(
    (draft: Omit<WorkOrder, "id" | "reference">) => {
      let created: WorkOrder | null = null;
      setState((current) => {
        const seq = current.workOrders.length + 1;
        created = {
          ...draft,
          id: `wo-${Date.now().toString(36)}`,
          reference: `WO-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`,
        };
        return { ...current, workOrders: [created, ...current.workOrders] };
      });
      return created;
    },
    []
  );

  const updateWorkOrder = useCallback(
    (id: string, patch: Partial<WorkOrder>) => {
      setState((current) => ({
        ...current,
        workOrders: current.workOrders.map((order) =>
          order.id === id ? { ...order, ...patch } : order
        ),
      }));
    },
    []
  );

  /**
   * Closing a work order is what resets the PMS clock: the covered tasks take
   * the order's odometer and completion date as their new baseline. The
   * technician's findings and parts list are recorded at the same moment —
   * that is what turns a work order into a service record.
   */
  const completeWorkOrder = useCallback(
    (
      id: string,
      detail?: { odometer?: number; findings?: string; parts?: PartLine[] }
    ) => {
      setState((current) => {
        const order = current.workOrders.find((o) => o.id === id);
        if (!order) return current;

        const completed: WorkOrder = {
          ...order,
          status: "completed",
          completedOn: formatISO(new Date(), { representation: "date" }),
          odometerAtService: detail?.odometer ?? order.odometerAtService,
          findings: detail?.findings ?? order.findings,
          parts: detail?.parts ?? order.parts,
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
    },
    []
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

  const resetFleet = useCallback(() => {
    setState(() => createSeedState());
  }, []);

  return {
    createWorkOrder,
    updateWorkOrder,
    completeWorkOrder,
    updateVehicle,
    addDocument,
    deleteDocument,
    markAlertsRead,
    dismissAlert,
    restoreAlerts,
    resetFleet,
  };
}
