"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiData, newIdempotencyKey } from "@/lib/api/client";
import { EQUIPMENT_ROOT, toBoard, toEquipment, toOptions, toProfileLine } from "@/lib/api/equipment";
import { INVENTORY_ROOTS } from "@/lib/api/inventory-keys";
import { run, useApiQuery, type ActionResult } from "@/lib/store";
import type { Equipment, EquipmentBoard, EquipmentOptions, PackageProfileLine } from "@/types/equipment";

/**
 * Equipment monitoring's data, in the same shape as the other seams: one hook
 * per endpoint (keyed by the user and the selected branch) and
 * `useEquipmentActions()` for the writes. Nothing is optimistic and nothing is
 * computed here: a tool's meters, service status, forecast, life, reliability
 * and health are derived by the API each time it is read.
 *
 * A tool's state raises and clears alerts, so every write refreshes the
 * alerts too. A service entry may take parts from stock (and removing it puts
 * them back), which the API books to Equipment Repairs & Maintenance: those
 * two writes also refresh `INVENTORY_ROOTS`, which carries the books.
 */

type Raw = Record<string, any>; // eslint-disable-line

export function useEquipmentBoard() {
  return useApiQuery<EquipmentBoard>([EQUIPMENT_ROOT, "board"], async () => toBoard(await apiData<Raw>("/equipment")));
}

export function useEquipmentOptions() {
  return useApiQuery<EquipmentOptions>([EQUIPMENT_ROOT, "options"], async () => toOptions(await apiData<Raw>("/equipment/options")));
}

export function useEquipmentItem(id: string | undefined) {
  return useApiQuery<Equipment>([EQUIPMENT_ROOT, "tool", id], async () => toEquipment(await apiData<Raw>(`/equipment/${id}`)), { enabled: Boolean(id) });
}

export function useEquipmentProfiles() {
  return useApiQuery<PackageProfileLine[]>([EQUIPMENT_ROOT, "profiles"], async () => (await apiData<Raw[]>("/equipment/profiles")).map(toProfileLine));
}

/** The form's fields, as typed. Empty optional strings are left out (the API turns "" into null), or sent as null on an edit to clear them. */
export interface EquipmentDraft {
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  conditionRating: string;
  meterType: string;
  purchaseDate: string;
  /** Pesos. */
  purchaseCost: string;
  baselineHours: string;
  baselineCycles: string;
  serviceIntervalHours: string;
  serviceIntervalCycles: string;
  serviceIntervalDays: string;
  expectedLifeHours: string;
  maintenanceTask: string;
  notes: string;
}

function toBody(draft: EquipmentDraft, editing: boolean) {
  const body: Record<string, unknown> = { name: draft.name.trim(), category: draft.category, condition_rating: draft.conditionRating, meter_type: draft.meterType };
  const text = (key: string, value: string) => {
    if (value.trim() !== "") body[key] = value.trim();
    else if (editing) body[key] = null;
  };
  text("brand", draft.brand);
  text("model", draft.model);
  text("serial_number", draft.serialNumber);
  text("purchase_date", draft.purchaseDate);
  text("maintenance_task", draft.maintenanceTask);
  text("notes", draft.notes);
  text("service_interval_hours", draft.serviceIntervalHours);
  text("expected_life_hours", draft.expectedLifeHours);
  const whole = (key: string, value: string) => {
    if (value.trim() !== "") body[key] = Number(value);
    else if (editing) body[key] = null;
  };
  whole("service_interval_cycles", draft.serviceIntervalCycles);
  whole("service_interval_days", draft.serviceIntervalDays);
  if (draft.purchaseCost.trim() !== "") body.purchase_cost_cents = Math.round(Number(draft.purchaseCost) * 100);
  if (draft.baselineHours.trim() !== "") body.baseline_hours = draft.baselineHours.trim();
  if (draft.baselineCycles.trim() !== "") body.baseline_cycles = Number(draft.baselineCycles);
  return body;
}

/** The "Log a service" form, as typed. */
export interface ServiceEntryDraft {
  kind: string;
  performedBy: string;
  /** Pesos paid for the work, apart from parts taken from stock. */
  cost: string;
  downtimeHours: string;
  /** Parts in words (bought outside, or a description). */
  parts: string;
  notes: string;
  resetsService: boolean;
  /** Parts taken from the branch's store. */
  issuedParts: { itemId: string; quantity: string }[];
}

export function useEquipmentActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    (also: readonly string[]) => {
      const roots = new Set<unknown>([EQUIPMENT_ROOT, "alerts", ...also]);
      return queryClient.invalidateQueries({ predicate: (query) => roots.has(query.queryKey[0]) });
    },
    [queryClient]
  );
  const write = useCallback(
    async <T,>(fn: () => Promise<T>, also: readonly string[] = []): Promise<ActionResult<T>> => {
      const result = await run(fn);
      if (result.ok) await refresh(also);
      return result;
    },
    [refresh]
  );

  return useMemo(
    () => ({
      saveTool: (draft: EquipmentDraft, id?: string) =>
        write(async () =>
          toEquipment(
            await apiData<Raw>(id ? `/equipment/${id}` : "/equipment", {
              method: id ? "PUT" : "POST",
              ...(id ? {} : { idempotencyKey: newIdempotencyKey() }),
              body: toBody(draft, Boolean(id)),
            })
          )
        ),

      setStatus: (id: string, status: string) => write(async () => toEquipment(await apiData<Raw>(`/equipment/${id}/status`, { method: "POST", body: { status } }))),

      logUsage: (id: string, entry: { hours: string; cycles: string; note: string }) =>
        write(async () =>
          toEquipment(
            await apiData<Raw>(`/equipment/${id}/usage-logs`, {
              method: "POST",
              body: {
                ...(entry.hours.trim() !== "" ? { hours: entry.hours.trim() } : {}),
                ...(entry.cycles.trim() !== "" ? { cycles: Number(entry.cycles) } : {}),
                ...(entry.note.trim() !== "" ? { note: entry.note.trim() } : {}),
              },
            })
          )
        ),

      deleteUsage: (id: string, logId: string) =>
        write(async () => {
          await api(`/equipment/${id}/usage-logs/${logId}`, { method: "DELETE" });
        }),

      /** `issuedParts` leave the branch's store as the entry is saved; a refusal (not enough on the shelf) comes back as the result's error. */
      logService: (id: string, entry: ServiceEntryDraft) => {
        const issued = entry.issuedParts.filter((part) => part.itemId !== "" && part.quantity.trim() !== "");
        return write(
          async () =>
            toEquipment(
              await apiData<Raw>(`/equipment/${id}/maintenance-logs`, {
                method: "POST",
                body: {
                  kind: entry.kind,
                  resets_service: entry.resetsService,
                  ...(entry.performedBy.trim() !== "" ? { performed_by: entry.performedBy.trim() } : {}),
                  ...(entry.cost.trim() !== "" ? { cost_cents: Math.round(Number(entry.cost) * 100) } : {}),
                  ...(entry.downtimeHours.trim() !== "" ? { downtime_hours: entry.downtimeHours.trim() } : {}),
                  ...(entry.parts.trim() !== "" ? { parts: entry.parts.trim() } : {}),
                  ...(entry.notes.trim() !== "" ? { notes: entry.notes.trim() } : {}),
                  ...(issued.length > 0 ? { issued_parts: issued.map((part) => ({ item_id: part.itemId, quantity: part.quantity.trim() })) } : {}),
                },
              })
            ),
          issued.length > 0 ? INVENTORY_ROOTS : []
        );
      },

      /** Puts back whatever parts the entry took from stock. */
      deleteService: (id: string, logId: string) =>
        write(async () => {
          await api(`/equipment/${id}/maintenance-logs/${logId}`, { method: "DELETE" });
        }, INVENTORY_ROOTS),

      /** The whole list for one package. */
      setProfile: (packageId: string, lines: { equipmentId: string; hoursPerJob: string }[]) =>
        write(async () => {
          await api(`/equipment/profiles/${packageId}`, { method: "PUT", body: { lines: lines.map((line) => ({ equipment_id: line.equipmentId, hours_per_job: line.hoursPerJob })) } });
        }),
    }),
    [write]
  );
}
