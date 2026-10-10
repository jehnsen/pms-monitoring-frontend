"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiData, apiPage, newIdempotencyKey, type Page } from "@/lib/api/client";
import {
  DETAILING_ROOT,
  toAddon,
  toAvailability,
  toBooking,
  toCatalogue,
  toCategory,
  toDisplayToken,
  toInspection,
  toMonitor,
  toPackage,
  toRealtime,
  toSchedule,
  toSettings,
  toSummary,
} from "@/lib/api/detailing";
import { BILLING_ROOTS } from "@/lib/api/billing";
import { INVENTORY_ROOTS } from "@/lib/api/inventory-keys";
import { run, useApiQuery, type ActionResult, type Params } from "@/lib/store";
import type {
  Availability,
  BookingStatus,
  BookingSummary,
  DamagePoint,
  DetailingBooking,
  DetailingCatalogue,
  DetailingInspection,
  DetailingSettings,
  DisplayToken,
  DurationReading,
  MonitorView,
  RealtimeConfig,
  ScheduleView,
  SizeClass,
} from "@/types/detailing";

/**
 * Detailing's data, in the same shape as `lib/inventory.ts` and
 * `lib/ledger.ts`: one hook per endpoint (keyed by the user and the selected
 * branch) and `useDetailingActions()` for the writes. Nothing is optimistic
 * and nothing is computed here: which starts are free, where a job sits, when
 * it ends, what it comes to and what it is waiting for are all the API's.
 *
 * Completing a job takes its materials from stock and checking out posts an
 * invoice and a payment, so a detailing write also refreshes the stock room,
 * billing and the books.
 */

type Raw = Record<string, any>;

/* ----------------------------------------------------------------- reads */

export function useDetailingCatalogue(options: { includeInactive?: boolean; enabled?: boolean } = {}) {
  return useApiQuery<DetailingCatalogue>(
    [DETAILING_ROOT, "catalogue", options.includeInactive ?? false],
    async () => toCatalogue(await apiData<Raw>("/detailing/catalogue", { query: options.includeInactive ? { include_inactive: 1 } : {} })),
    { enabled: options.enabled }
  );
}

export interface BookingQuery extends Params {
  page?: number;
  per_page?: number;
  status?: string[];
  date_from?: string;
  date_to?: string;
  q?: string;
}

export function useBookingPage(params: BookingQuery) {
  return useApiQuery<Page<DetailingBooking> & { summary: BookingSummary }>(
    [DETAILING_ROOT, "bookings", params],
    async () => {
      const page = await apiPage<Raw>("/detailing/bookings", { query: params });
      const meta = page.meta as unknown as { summary: Raw };
      return { ...page, data: page.data.map(toBooking), summary: toSummary(meta.summary) };
    },
    { keepPrevious: true }
  );
}

export function useBooking(id: string | undefined) {
  return useApiQuery<DetailingBooking>([DETAILING_ROOT, "booking", id], async () => toBooking(await apiData<Raw>(`/detailing/bookings/${id}`)), {
    enabled: Boolean(id),
  });
}

export function useBookingInspections(id: string | undefined) {
  return useApiQuery<DetailingInspection[]>(
    [DETAILING_ROOT, "inspections", id],
    async () => (await apiData<Raw[]>(`/detailing/bookings/${id}/inspections`)).map(toInspection),
    { enabled: Boolean(id) }
  );
}

/** Which starts are free for a package at a size on a day, as the API decides it. */
export function useAvailability(params: { packageId: string | null; sizeClass: SizeClass | null; date: string | null; exceptBookingId?: string }) {
  const ready = Boolean(params.packageId && params.sizeClass && params.date);
  return useApiQuery<Availability>(
    [DETAILING_ROOT, "availability", params],
    async () =>
      toAvailability(
        await apiData<Raw>("/detailing/availability", {
          query: {
            package_id: params.packageId,
            size_class: params.sizeClass,
            date: params.date,
            ...(params.exceptBookingId ? { except_booking_id: params.exceptBookingId } : {}),
          },
        })
      ),
    { enabled: ready, keepPrevious: true }
  );
}

export function useDetailingSchedule(from: string, to: string) {
  return useApiQuery<ScheduleView>([DETAILING_ROOT, "schedule", from, to], async () => toSchedule(await apiData<Raw>("/detailing/schedule", { query: { from, to } })), {
    keepPrevious: true,
  });
}

export function useDetailingMonitor(date: string) {
  return useApiQuery<MonitorView>([DETAILING_ROOT, "monitor", date], async () => toMonitor(await apiData<Raw>("/detailing/monitor", { query: { date } })), {
    keepPrevious: true,
  });
}

export function useDetailingRealtime() {
  return useApiQuery<RealtimeConfig & { branchId: string }>([DETAILING_ROOT, "realtime"], async () => {
    const raw = await apiData<Raw>("/detailing/realtime");
    return { ...toRealtime(raw), branchId: raw.branch_id };
  });
}

export function useDetailingSettings() {
  return useApiQuery<DetailingSettings>([DETAILING_ROOT, "settings"], async () => toSettings(await apiData<Raw>("/detailing/settings")));
}

export function useDisplayTokens(enabled: boolean) {
  return useApiQuery<DisplayToken[]>([DETAILING_ROOT, "display-tokens"], async () => (await apiData<Raw[]>("/detailing/display-tokens")).map(toDisplayToken), {
    enabled,
  });
}

/** How the API reads a typed duration, for the "Interpreted as …" line. */
export function useDurationReading(text: string) {
  const trimmed = text.trim();
  return useApiQuery<DurationReading>(
    [DETAILING_ROOT, "duration", trimmed],
    async () => {
      const raw = await apiData<Raw>("/detailing/duration", { query: { text: trimmed } });
      return { slotBudget: raw.slot_budget, minutes: raw.minutes, days: raw.days, interpreted: raw.interpreted };
    },
    { enabled: trimmed !== "", keepPrevious: true }
  );
}

/* ---------------------------------------------------------------- writes */

export interface NewBookingDraft {
  customerAccountId: string;
  vehicleId?: string;
  vehicleLabel?: string;
  packageId: string;
  sizeClass: SizeClass;
  date: string;
  startTime: string;
  detailersCount?: number;
  detailerIds: string[];
  bayId?: string;
  confirmed: boolean;
  notes?: string;
  addons: { addonId: string }[];
}

export interface InspectionDraft {
  stage: "check_in" | "check_out";
  overallRating: number;
  exteriorRating?: number;
  interiorRating?: number;
  exteriorCondition?: string;
  interiorCondition?: string;
  mileage?: number;
  confirmMileage?: boolean;
  notes?: string;
  damagePoints: DamagePoint[];
}

export interface PackageDraft {
  name: string;
  description?: string;
  categoryId?: string;
  durationText: string;
  inclusions: string[];
  isPopular: boolean;
  minDetailers: number;
  recommendedDetailers: number;
  isActive: boolean;
  /** Pesos, as typed; a size left blank is not offered. */
  prices: { sizeClass: SizeClass; price: number }[];
  materials: { itemId: string; quantity: string; scalesWithSize: boolean }[];
}

/** An empty optional string is left out, not sent (the API turns "" into null). */
const filled = (value: string | undefined) => (value && value.trim() !== "" ? value.trim() : undefined);
const centavos = (pesos: number) => Math.round(pesos * 100);

export function useDetailingActions() {
  const queryClient = useQueryClient();

  const refresh = useCallback(
    (roots: readonly string[]) => queryClient.invalidateQueries({ predicate: (query) => roots.includes(String(query.queryKey[0])) }),
    [queryClient]
  );

  const write = useCallback(
    async <T,>(fn: () => Promise<T>, also: readonly string[] = []): Promise<ActionResult<T>> => {
      const result = await run(fn);
      if (result.ok) await refresh([DETAILING_ROOT, ...also]);
      return result;
    },
    [refresh]
  );

  return useMemo(
    () => ({
      takeBooking: (draft: NewBookingDraft, idempotencyKey: string) =>
        write(async () =>
          toBooking(
            await apiData<Raw>("/detailing/bookings", {
              method: "POST",
              idempotencyKey,
              body: {
                customer_account_id: draft.customerAccountId,
                package_id: draft.packageId,
                size_class: draft.sizeClass,
                date: draft.date,
                start_time: draft.startTime,
                status: draft.confirmed ? "confirmed" : "pending",
                detailer_ids: draft.detailerIds,
                addons: draft.addons.map((addon) => ({ addon_id: addon.addonId })),
                ...(draft.vehicleId ? { vehicle_id: draft.vehicleId } : {}),
                ...(filled(draft.vehicleLabel) ? { vehicle_label: filled(draft.vehicleLabel) } : {}),
                ...(draft.detailersCount ? { detailers_count: draft.detailersCount } : {}),
                ...(draft.bayId ? { bay_id: draft.bayId } : {}),
                ...(filled(draft.notes) ? { notes: filled(draft.notes) } : {}),
              },
            })
          )
        ),

      /** Completing a job takes its materials from the shelf, so the stock room refreshes too. */
      setStatus: (id: string, status: BookingStatus, extra: { reason?: string; inspectionOverrideReason?: string } = {}) =>
        write(
          async () =>
            toBooking(
              await apiData<Raw>(`/detailing/bookings/${id}/status`, {
                method: "POST",
                body: {
                  status,
                  ...(filled(extra.reason) ? { reason: filled(extra.reason) } : {}),
                  ...(filled(extra.inspectionOverrideReason) ? { inspection_override_reason: filled(extra.inspectionOverrideReason) } : {}),
                },
              })
            ),
          status === "completed" ? INVENTORY_ROOTS : []
        ),

      assignDetailers: (id: string, detailerIds: string[]) =>
        write(async () => toBooking(await apiData<Raw>(`/detailing/bookings/${id}/detailers`, { method: "PUT", body: { detailer_ids: detailerIds } }))),

      setAddons: (id: string, addons: { addonId?: string; name?: string; unitPrice?: number; quantity?: string }[]) =>
        write(async () =>
          toBooking(
            await apiData<Raw>(`/detailing/bookings/${id}/addons`, {
              method: "PUT",
              body: {
                addons: addons.map((addon) => ({
                  ...(addon.addonId ? { addon_id: addon.addonId } : {}),
                  ...(filled(addon.name) ? { name: filled(addon.name) } : {}),
                  ...(addon.unitPrice !== undefined ? { unit_price_cents: centavos(addon.unitPrice) } : {}),
                  ...(addon.quantity ? { quantity: addon.quantity } : {}),
                })),
              },
            })
          )
        ),

      updateBooking: (id: string, changes: { bayId?: string | null; notes?: string }) =>
        write(async () =>
          toBooking(
            await apiData<Raw>(`/detailing/bookings/${id}`, {
              method: "PATCH",
              body: { ...(changes.bayId !== undefined ? { bay_id: changes.bayId } : {}), ...(changes.notes !== undefined ? { notes: changes.notes || null } : {}) },
            })
          )
        ),

      tickChecklist: (id: string, index: number, done: boolean) =>
        write(async () => toBooking(await apiData<Raw>(`/detailing/bookings/${id}/checklist`, { method: "POST", body: { index, done } }))),

      signOff: (id: string, passed: boolean, notes?: string) =>
        write(async () =>
          toBooking(await apiData<Raw>(`/detailing/bookings/${id}/sign-off`, { method: "POST", body: { passed, ...(filled(notes) ? { notes: filled(notes) } : {}) } }))
        ),

      /** An implausible mileage comes back as a 422 with `confirm_warning`: show it, ask, send again with `confirmMileage`. */
      recordInspection: (id: string, draft: InspectionDraft) =>
        write(async () =>
          toInspection(
            await apiData<Raw>(`/detailing/bookings/${id}/inspections`, {
              method: "POST",
              body: {
                stage: draft.stage,
                overall_rating: draft.overallRating,
                ...(draft.exteriorRating ? { exterior_rating: draft.exteriorRating } : {}),
                ...(draft.interiorRating ? { interior_rating: draft.interiorRating } : {}),
                ...(draft.exteriorCondition ? { exterior_condition: draft.exteriorCondition } : {}),
                ...(draft.interiorCondition ? { interior_condition: draft.interiorCondition } : {}),
                ...(draft.mileage !== undefined ? { mileage: draft.mileage } : {}),
                ...(draft.confirmMileage ? { confirm_mileage: true } : {}),
                ...(filled(draft.notes) ? { notes: filled(draft.notes) } : {}),
                damage_points: draft.damagePoints.map((point) => ({ x_permille: point.x, y_permille: point.y, kind: point.kind, note: point.note })),
              },
            })
          )
        ),

      addPhoto: (bookingId: string, inspectionId: string, file: File, phase: "before" | "after", caption?: string) =>
        write(async () => {
          const body = new FormData();
          body.append("file", file);
          body.append("phase", phase);
          if (filled(caption)) body.append("caption", filled(caption) as string);
          return toInspection(await apiData<Raw>(`/detailing/bookings/${bookingId}/inspections/${inspectionId}/photos`, { method: "POST", body }));
        }, ["documents"]),

      removePhoto: (bookingId: string, inspectionId: string, photoId: string) =>
        write(async () => {
          await api(`/detailing/bookings/${bookingId}/inspections/${inspectionId}/photos/${photoId}`, { method: "DELETE" });
        }, ["documents"]),

      invoice: (id: string) =>
        write(async () => (await apiData<Raw>(`/detailing/bookings/${id}/invoice`, { method: "POST", idempotencyKey: newIdempotencyKey() })).id as string, BILLING_ROOTS),

      /** Invoice and payment in one action; the key is minted when the dialog opens and reused on a retry. */
      checkout: (id: string, payment: { method: string; referenceNo?: string }, idempotencyKey: string) =>
        write(
          async () => {
            const raw = await apiData<Raw>(`/detailing/bookings/${id}/checkout`, {
              method: "POST",
              idempotencyKey,
              body: { method: payment.method, ...(filled(payment.referenceNo) ? { reference_no: filled(payment.referenceNo) } : {}) },
            });
            return { booking: toBooking(raw.booking), invoiceId: raw.invoice.id as string, invoiceNumber: raw.invoice.number as string, paymentNumber: (raw.payment?.number ?? null) as string | null };
          },
          BILLING_ROOTS
        ),

      savePackage: (draft: PackageDraft, id?: string) =>
        write(async () =>
          toPackage(
            await apiData<Raw>(id ? `/detailing/packages/${id}` : "/detailing/packages", {
              method: id ? "PUT" : "POST",
              ...(id ? {} : { idempotencyKey: newIdempotencyKey() }),
              body: {
                name: draft.name,
                duration_text: draft.durationText,
                inclusions: draft.inclusions.filter((line) => line.trim() !== ""),
                is_popular: draft.isPopular,
                min_detailers: draft.minDetailers,
                recommended_detailers: draft.recommendedDetailers,
                is_active: draft.isActive,
                prices: draft.prices.map((price) => ({ size_class: price.sizeClass, price_cents: centavos(price.price) })),
                materials: draft.materials.map((line) => ({ item_id: line.itemId, quantity: line.quantity, scales_with_size: line.scalesWithSize })),
                ...(filled(draft.description) ? { description: filled(draft.description) } : {}),
                ...(draft.categoryId ? { category_id: draft.categoryId } : {}),
              },
            })
          )
        ),

      deletePackage: (id: string) =>
        write(async () => {
          await api(`/detailing/packages/${id}`, { method: "DELETE" });
        }),

      saveCategory: (name: string, id?: string) =>
        write(async () => toCategory(await apiData<Raw>(id ? `/detailing/categories/${id}` : "/detailing/categories", { method: id ? "PUT" : "POST", body: { name } }))),

      saveAddon: (draft: { name: string; isActive: boolean; prices: { sizeClass: SizeClass; price: number }[] }, id?: string) =>
        write(async () =>
          toAddon(
            await apiData<Raw>(id ? `/detailing/addons/${id}` : "/detailing/addons", {
              method: id ? "PUT" : "POST",
              body: { name: draft.name, is_active: draft.isActive, prices: draft.prices.map((price) => ({ size_class: price.sizeClass, price_cents: centavos(price.price) })) },
            })
          )
        ),

      deleteAddon: (id: string) =>
        write(async () => {
          await api(`/detailing/addons/${id}`, { method: "DELETE" });
        }),

      saveSettings: (changes: {
        detailerPoolSize?: number;
        defaultDetailersPerBooking?: number;
        closingTime?: string;
        publicBookingEnabled?: boolean;
        publicBookingNotice?: string;
        inspectionRequired?: boolean;
        sizeMultipliers?: Record<string, string>;
      }) =>
        write(async () =>
          toSettings(
            await apiData<Raw>("/detailing/settings", {
              method: "PUT",
              body: {
                ...(changes.detailerPoolSize !== undefined ? { detailer_pool_size: changes.detailerPoolSize } : {}),
                ...(changes.defaultDetailersPerBooking !== undefined ? { default_detailers_per_booking: changes.defaultDetailersPerBooking } : {}),
                ...(changes.closingTime ? { closing_time: changes.closingTime } : {}),
                ...(changes.publicBookingEnabled !== undefined ? { public_booking_enabled: changes.publicBookingEnabled } : {}),
                ...(changes.publicBookingNotice !== undefined ? { public_booking_notice: changes.publicBookingNotice || null } : {}),
                ...(changes.inspectionRequired !== undefined ? { inspection_required: changes.inspectionRequired } : {}),
                ...(changes.sizeMultipliers ? { size_multipliers: changes.sizeMultipliers } : {}),
              },
            })
          )
        ),

      blockSlots: (date: string, slots: number[], label?: string) =>
        write(async () => {
          await api("/detailing/blocked-slots", { method: "POST", body: { date, slots, ...(filled(label) ? { label: filled(label) } : {}) } });
        }),

      unblockSlot: (id: string) =>
        write(async () => {
          await api(`/detailing/blocked-slots/${id}`, { method: "DELETE" });
        }),

      issueDisplayToken: (name: string) => write(async () => toDisplayToken(await apiData<Raw>("/detailing/display-tokens", { method: "POST", body: { name } }))),

      revokeDisplayToken: (id: string) =>
        write(async () => toDisplayToken(await apiData<Raw>(`/detailing/display-tokens/${id}/revoke`, { method: "POST" }))),
    }),
    [write]
  );
}
