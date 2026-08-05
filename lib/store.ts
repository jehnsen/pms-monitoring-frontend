"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { formatISO } from "date-fns";
import type { FleetState, Vehicle, WorkOrder } from "@/types";
import { createSeedState } from "@/lib/seed";
import { applyCompletion, evaluateFleet, summariseFleet } from "@/lib/pms";

const STORAGE_KEY = "pms.fleet.v1";

/**
 * Server snapshot. Rendering a real fleet on the server would fight hydration —
 * every due-date calculation depends on "now" — so the shell renders empty and
 * the store fills in on mount.
 */
const EMPTY: FleetState = { vehicles: [], workOrders: [] };

let state: FleetState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): FleetState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FleetState;
      if (parsed?.vehicles?.length) return parsed;
    }
  } catch {
    // Corrupt or unavailable storage — fall through and reseed.
  }
  const seeded = createSeedState();
  persist(seeded);
  return seeded;
}

function persist(next: FleetState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked; the in-memory copy still drives the session.
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
      health,
      healthById: new Map(health.map((h) => [h.vehicle.id, h])),
      summary: summariseFleet(health),
    };
  }, [snapshot, ready]);
}

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
   * the order's odometer and completion date as their new baseline.
   */
  const completeWorkOrder = useCallback((id: string, odometer?: number) => {
    setState((current) => {
      const order = current.workOrders.find((o) => o.id === id);
      if (!order) return current;

      const completed: WorkOrder = {
        ...order,
        status: "completed",
        completedOn: formatISO(new Date(), { representation: "date" }),
        odometerAtService: odometer ?? order.odometerAtService,
      };

      return {
        vehicles: current.vehicles.map((vehicle) =>
          vehicle.id === completed.vehicleId
            ? applyCompletion(vehicle, completed)
            : vehicle
        ),
        workOrders: current.workOrders.map((o) => (o.id === id ? completed : o)),
      };
    });
  }, []);

  const updateVehicle = useCallback((id: string, patch: Partial<Vehicle>) => {
    setState((current) => ({
      ...current,
      vehicles: current.vehicles.map((vehicle) =>
        vehicle.id === id ? { ...vehicle, ...patch } : vehicle
      ),
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
    resetFleet,
  };
}
