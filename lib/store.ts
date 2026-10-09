"use client";

import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type {
  Alert,
  ApprovalSettings,
  Bay,
  FleetClient,
  FleetDocument,
  FleetSummary,
  Invitation,
  LineUrgency,
  Member,
  MeterReading,
  Part,
  PartsSource,
  Priority,
  ProviderTechnician,
  ProviderVendor,
  PurchaseOrder,
  ServiceTask,
  TaskCategory,
  Vehicle,
  VehicleHealth,
  WorkOrder,
  WorkOrderType,
} from "@/types";
import { api, apiAll, apiBlob, apiData, apiPage, newIdempotencyKey, saveBlob, type Page } from "@/lib/api/client";
import { describeApiError, isApiError } from "@/lib/api/errors";
import { useSelectedBranch } from "@/lib/api/branch";
import { INVENTORY_ROOTS } from "@/lib/api/inventory-keys";
import { useSession } from "@/lib/auth";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/tenant";
import {
  pesosToCents,
  settingsToApi,
  toAlert,
  toApprovalSettings,
  toBay,
  toDocument,
  toFleetClient,
  toFleetSummary,
  toInvitation,
  toMember,
  toMeterReading,
  toPart,
  toPurchaseOrder,
  toServiceTask,
  toSettingsOverrides,
  toTechnician,
  toVehicle,
  toVehicleHealth,
  toVendor,
  toWorkOrder,
  type RawAlert,
  type RawBay,
  type RawCustomerAccount,
  type RawDocument,
  type RawFleetPart,
  type RawFleetSummary,
  type RawInvitation,
  type RawMeterReading,
  type RawPurchaseOrder,
  type RawServiceTask,
  type RawSettings,
  type RawTechnician,
  type RawUser,
  type RawVehicle,
  type RawVehicleHealth,
  type RawVendor,
  type RawWorkOrder,
} from "@/lib/mappers";
import {
  toAutoSchedule,
  toCheckInLookup,
  toClientRollup,
  toDashboard,
  toDocumentSummary,
  toForecast,
  toReports,
  toRequests,
  toSchedule,
  toShopClient,
  toShopHome,
  toShopReports,
  toTechnicianLoad,
  toWorkOrderSummary,
  type RawAutoSchedule,
  type RawCheckInLookup,
  type RawClientRollup,
  type RawDashboard,
  type RawDocumentSummary,
  type RawForecast,
  type RawReports,
  type RawRequests,
  type RawSchedule,
  type RawShopClient,
  type RawShopHome,
  type RawShopReports,
  type RawTechnicianLoad,
  type RawWorkOrderSummary,
} from "@/lib/api/views";

/**
 * The app's data layer, on the TorqueLane API through TanStack Query.
 *
 * - Reads: one hook per resource or screen endpoint. Every key carries the
 *   staff branch selection (`X-Branch-Id`), so switching branch refetches.
 *   Screens read the API's computed views (`/analytics/*`, `/shop/*`, …)
 *   rather than deriving figures in the browser.
 * - Writes: `useFleetActions()` keeps the store's action names. Each calls
 *   its endpoint, invalidates what it changed, and resolves to `{ ok }` or the
 *   API's error (message + per-field errors for forms). Nothing is optimistic:
 *   the screen shows what the API saved.
 */

/* ------------------------------------------------------------ query core */

export type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function useApiQuery<T>(key: QueryKey, fn: () => Promise<T>, options: { enabled?: boolean; keepPrevious?: boolean } = {}) {
  const branch = useSelectedBranch();
  const { session } = useSession();
  return useQuery({
    queryKey: [...key, { branch, user: session?.uid ?? null }],
    queryFn: fn,
    enabled: (options.enabled ?? true) && Boolean(session),
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });
}

/* ---------------------------------------------------- session & branding */

/** The tenant's branding for the shell: the session's, or the platform's. */
export function useBranding() {
  const { session } = useSession();
  return session?.branding ?? DEFAULT_TENANT_SETTINGS;
}

/* ----------------------------------------------------------------- fleet */

export function useFleetSummary(params: Params = {}) {
  return useApiQuery<FleetSummary>(["fleet-summary", params], async () =>
    toFleetSummary(await apiData<RawFleetSummary>("/fleet/summary", { query: params }))
  );
}

export interface VehicleQuery extends Params {
  page?: number;
  per_page?: number;
  pms?: string;
  sort?: string;
  search?: string;
  status?: string;
  department?: string;
  customer_account_id?: string;
  stale?: boolean;
}

export function useVehiclePage(params: VehicleQuery, options: { enabled?: boolean } = {}) {
  return useApiQuery<Page<Vehicle>>(
    ["vehicles", params],
    async () => {
      const page = await apiPage<RawVehicle>("/vehicles", { query: params });
      return { ...page, data: page.data.map(toVehicle) };
    },
    { keepPrevious: true, ...options }
  );
}

/**
 * Every vehicle the caller can see, for pickers and lookups (bounded by the
 * API's paging; screens that list vehicles page them instead).
 */
export function useAllVehicles(params: Params = {}) {
  const query = useApiQuery<Vehicle[]>(["vehicles", "all", params], async () =>
    (await apiAll<RawVehicle>("/vehicles", { query: params })).map(toVehicle)
  );
  const vehicles = useMemo(() => query.data ?? [], [query.data]);
  const vehiclesById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  return { ...query, vehicles, vehiclesById };
}

export function useVehicle(id: string | undefined) {
  return useApiQuery<Vehicle>(["vehicle", id], async () => toVehicle(await apiData<RawVehicle>(`/vehicles/${id}`)), {
    enabled: Boolean(id),
  });
}

export function useVehicleHealth(id: string | undefined) {
  return useApiQuery<VehicleHealth>(
    ["vehicle-health", id],
    async () => toVehicleHealth(await apiData<RawVehicleHealth>(`/vehicles/${id}/health`)),
    { enabled: Boolean(id) }
  );
}

export function useVehicleReadings(id: string | undefined) {
  return useApiQuery<MeterReading[]>(
    ["vehicle-readings", id],
    async () => (await apiPage<RawMeterReading>(`/vehicles/${id}/readings`, { query: { per_page: 20 } })).data.map(toMeterReading),
    { enabled: Boolean(id) }
  );
}

/* ------------------------------------------------------------ catalogue */

export function useServiceTasks() {
  const query = useApiQuery<ServiceTask[]>(["service-tasks"], async () =>
    (await apiAll<RawServiceTask>("/service-tasks")).map(toServiceTask)
  );
  const serviceTasks = useMemo(() => query.data ?? [], [query.data]);
  const tasksById = useMemo(() => new Map(serviceTasks.map((t) => [t.id, t])), [serviceTasks]);
  return { ...query, serviceTasks, tasksById };
}

export function useTechnicians(options: { enabled?: boolean } = {}) {
  const query = useApiQuery<ProviderTechnician[]>(
    ["technicians"],
    async () => (await apiAll<RawTechnician>("/technicians")).map(toTechnician),
    options
  );
  return { ...query, technicians: query.data ?? [] };
}

export function useBays(options: { enabled?: boolean } = {}) {
  const query = useApiQuery<Bay[]>(["bays"], async () => (await apiAll<RawBay>("/bays")).map(toBay), options);
  const bays = useMemo(() => query.data ?? [], [query.data]);
  const bayName = useCallback((id: string | null | undefined) => bays.find((b) => b.id === id)?.name ?? "—", [bays]);
  return { ...query, bays, bayName };
}

export function useVendors(options: { enabled?: boolean } = {}) {
  const query = useApiQuery<ProviderVendor[]>(["vendors"], async () => (await apiAll<RawVendor>("/vendors")).map(toVendor), options);
  return { ...query, vendors: query.data ?? [] };
}

/** Customer accounts the caller can reach (staff: all; portal: their own). */
export function useFleetClients(options: { enabled?: boolean } = {}) {
  const query = useApiQuery<FleetClient[]>(
    ["customer-accounts"],
    async () => (await apiAll<RawCustomerAccount>("/customer-accounts")).map(toFleetClient),
    options
  );
  const fleetClients = useMemo(() => query.data ?? [], [query.data]);
  const clientName = useCallback((id: string | null | undefined) => fleetClients.find((c) => c.id === id)?.name ?? "—", [fleetClients]);
  return { ...query, fleetClients, clientName };
}

/* ---------------------------------------------------------- work orders */

export interface WorkOrderQuery extends Params {
  page?: number;
  per_page?: number;
  stage?: string;
  type?: string;
  q?: string;
  sort?: string;
  vehicle_id?: string;
  customer_account_id?: string;
  technician_id?: string;
  bay_id?: string;
  status?: string[];
}

export function useWorkOrderPage(params: WorkOrderQuery, options: { enabled?: boolean } = {}) {
  return useApiQuery<Page<WorkOrder>>(
    ["work-orders", params],
    async () => {
      const page = await apiPage<RawWorkOrder>("/work-orders", { query: params });
      return { ...page, data: page.data.map(toWorkOrder) };
    },
    { keepPrevious: true, ...options }
  );
}

export function useWorkOrderSummary(params: WorkOrderQuery) {
  return useApiQuery(["work-orders-summary", params], async () =>
    toWorkOrderSummary(await apiData<RawWorkOrderSummary>("/work-orders/summary", { query: params }))
  );
}

export function useWorkOrder(id: string | undefined) {
  return useApiQuery<WorkOrder>(["work-order", id], async () => toWorkOrder(await apiData<RawWorkOrder>(`/work-orders/${id}`)), {
    enabled: Boolean(id),
  });
}

/* ------------------------------------------------------------ documents */

export interface DocumentQuery extends Params {
  page?: number;
  per_page?: number;
  vehicle_id?: string;
  work_order_id?: string;
  kind?: string;
  status?: string;
  sort?: string;
  q?: string;
}

export function useDocumentPage(params: DocumentQuery, options: { enabled?: boolean } = {}) {
  return useApiQuery<Page<FleetDocument>>(
    ["documents", params],
    async () => {
      const page = await apiPage<RawDocument>("/documents", { query: params });
      return { ...page, data: page.data.map(toDocument) };
    },
    { keepPrevious: true, ...options }
  );
}

export function useDocumentSummary() {
  return useApiQuery(["documents-summary"], async () => toDocumentSummary(await apiData<RawDocumentSummary>("/documents/summary")));
}

/* --------------------------------------------------------------- alerts */

export function useAlerts() {
  const query = useApiQuery(["alerts"], async () => {
    // Dismissed ones too (flagged), so "Restore" can name them.
    const body = await api<{ data: RawAlert[]; meta: { total: number; unread_count: number; dismissed_count: number } }>("/alerts", {
      query: { include_dismissed: 1 },
    });
    return { alerts: body.data.map(toAlert), meta: body.meta };
  });
  const all: Alert[] = useMemo(() => query.data?.alerts ?? [], [query.data]);
  const visible = useMemo(() => all.filter((a) => !a.dismissed), [all]);
  const unread = useMemo(() => visible.filter((a) => !a.read), [visible]);
  const dismissed = useMemo(() => all.filter((a) => a.dismissed), [all]);
  return {
    ready: query.isSuccess,
    visible,
    unread,
    dismissed,
    unreadCount: query.data?.meta.unread_count ?? 0,
    dismissedCount: query.data?.meta.dismissed_count ?? 0,
  };
}

/* ----------------------------------------------------- screen endpoints */

export function useDashboard(params: Params = {}) {
  return useApiQuery(["analytics", "dashboard", params], async () => toDashboard(await apiData<RawDashboard>("/analytics/dashboard", { query: params })));
}

export function useReports(months: number, params: Params = {}) {
  return useApiQuery(
    ["analytics", "reports", months, params],
    async () => toReports(await apiData<RawReports>("/analytics/reports", { query: { months, ...params } })),
    { keepPrevious: true }
  );
}

export function useSchedule(status: string, params: Params = {}) {
  return useApiQuery(
    ["analytics", "schedule", status, params],
    async () => toSchedule(await apiData<RawSchedule>("/analytics/schedule", { query: { status: status === "all" ? undefined : status, ...params } })),
    { keepPrevious: true }
  );
}

export function useAutoSchedule(enabled: boolean, params: Params = {}) {
  return useApiQuery(
    ["analytics", "auto-schedule", params],
    async () => toAutoSchedule(await apiData<RawAutoSchedule>("/analytics/auto-schedule", { query: params })),
    { enabled }
  );
}

export function useRequests(options: { enabled?: boolean } = {}) {
  return useApiQuery(["requests"], async () => toRequests(await apiData<RawRequests>("/requests")), options);
}

export function useDemandForecast(params: { customer_account_id?: string; horizon_weeks: number }, options: { enabled?: boolean } = {}) {
  return useApiQuery(
    ["demand-forecast", params],
    async () => toForecast(await apiData<RawForecast>("/demand-forecast", { query: params })),
    { keepPrevious: true, ...options }
  );
}

export function usePurchaseOrders(params: Params = {}) {
  return useApiQuery<Page<PurchaseOrder>>(
    ["purchase-orders", params],
    async () => {
      const page = await apiPage<RawPurchaseOrder>("/purchase-orders", { query: { per_page: 100, ...params } });
      return { ...page, data: page.data.map(toPurchaseOrder) };
    },
    { keepPrevious: true }
  );
}

export function useFleetParts(params: Params = {}) {
  return useApiQuery<Part[]>(["fleet-parts", params], async () => (await apiAll<RawFleetPart>("/fleet-parts", { query: params })).map(toPart));
}

/** Exact plate/VIN lookup for the counter; disabled until there is text. */
export function useCheckInLookup(q: string) {
  const text = q.trim();
  return useApiQuery(["check-in", "lookup", text], async () => toCheckInLookup(await apiData<RawCheckInLookup>("/check-in/lookup", { query: { q: text } })), {
    enabled: text.length > 0,
  });
}

/** Closed, uncollected jobs — the check-out panel. */
export function useReadyForCollection() {
  return useApiQuery(["work-orders", "ready-for-collection"], async () =>
    (await apiData<RawWorkOrder[]>("/shop/ready-for-collection")).map(toWorkOrder)
  );
}

export function useShopHome() {
  return useApiQuery(["shop", "home"], async () => toShopHome(await apiData<RawShopHome>("/shop/home")));
}

export function useShopReports(months: number) {
  return useApiQuery(["shop", "reports", months], async () => toShopReports(await apiData<RawShopReports>("/shop/reports", { query: { months } })), {
    keepPrevious: true,
  });
}

export function useShopClients() {
  return useApiQuery(["shop", "clients"], async () => (await apiData<RawClientRollup[]>("/shop/clients")).map(toClientRollup));
}

export function useShopClient(id: string | undefined) {
  return useApiQuery(["shop", "client", id], async () => toShopClient(await apiData<RawShopClient>(`/shop/clients/${id}`)), {
    enabled: Boolean(id),
  });
}

export function useShopTechnicians(params: Params = {}) {
  return useApiQuery(["shop", "technicians", params], async () =>
    (await apiData<RawTechnicianLoad[]>("/shop/technicians", { query: params })).map(toTechnicianLoad)
  );
}

/* ---------------------------------------------------- settings & access */

export function useApprovalSettings(options: { enabled?: boolean } = {}) {
  return useApiQuery(
    ["approval-settings"],
    async () => {
      const body = await apiData<{ organization: RawSettings; branch_id: string | null; branch_override: RawSettings | null; effective: RawSettings }>(
        "/approval-settings"
      );
      return {
        organization: toApprovalSettings(body.organization),
        branchId: body.branch_id,
        branchOverride: toSettingsOverrides(body.branch_override),
        effective: toApprovalSettings(body.effective),
      };
    },
    options
  );
}

export function useAccountApprovalSettings(accountId: string | null | undefined) {
  return useApiQuery(
    ["account-approval-settings", accountId],
    async () => {
      const body = await apiData<{ overrides: RawSettings | null; effective: RawSettings }>(`/customer-accounts/${accountId}/approval-settings`);
      return { overrides: toSettingsOverrides(body.overrides), effective: toApprovalSettings(body.effective) };
    },
    { enabled: Boolean(accountId) }
  );
}

/**
 * The effective approval settings for the caller's own scope — a portal
 * user's account bands, staff the selected branch's. For defaults in forms
 * and labelled previews only; the API applies the right settings itself.
 */
export function usePreviewSettings(): ApprovalSettings | null {
  const { session } = useSession();
  const portal = session?.side === "portal";
  const staff = useApprovalSettings({ enabled: session?.side === "staff" });
  const account = useAccountApprovalSettings(portal ? session?.fleetClientId : null);
  return (portal ? account.data?.effective : staff.data?.effective) ?? null;
}

export function useOrganization(options: { enabled?: boolean } = {}) {
  return useApiQuery(
    ["organization"],
    async () => {
      const o = await apiData<{ name: string; logo_url: string | null; brand_color: string | null; support_email: string | null }>("/organization");
      return { displayName: o.name, logoUrl: o.logo_url, brandColor: o.brand_color ?? DEFAULT_TENANT_SETTINGS.brandColor, supportEmail: o.support_email ?? "" };
    },
    options
  );
}

export function useMembers(options: { enabled?: boolean } = {}) {
  return useApiQuery<Member[]>(["users"], async () => (await apiAll<RawUser>("/users")).map(toMember), options);
}

export function useInvitations(options: { enabled?: boolean } = {}) {
  return useApiQuery<Invitation[]>(["invitations"], async () => (await apiAll<RawInvitation>("/invitations")).map(toInvitation), options);
}

/* ============================================================= mutations */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; reason?: string | null; fields?: Record<string, string[]> };

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return {
      ok: false,
      error: describeApiError(error),
      code: isApiError(error) ? error.code : undefined,
      reason: isApiError(error) ? error.reason : undefined,
      fields: isApiError(error) ? error.fields : undefined,
    };
  }
}

/** What a write can change, as query-key roots to refetch. */
const AFFECTS = {
  // Closing or cancelling a job moves the shop's stock (issues and returns), so the inventory refreshes too.
  work: ["work-order", "work-orders", "work-orders-summary", "analytics", "shop", "requests", "alerts", "demand-forecast", "vehicle", "vehicles", "vehicle-health", "fleet-summary", "documents", "check-in", ...INVENTORY_ROOTS],
  fleet: ["vehicle", "vehicles", "vehicle-health", "vehicle-readings", "fleet-summary", "analytics", "alerts", "demand-forecast", "shop", "work-orders", "check-in"],
  documents: ["documents", "documents-summary", "alerts", "fleet-summary", "analytics", "vehicle", "vehicles"],
  alerts: ["alerts"],
  catalogue: ["service-tasks", "vehicle-health", "vehicles", "analytics", "demand-forecast", "alerts"],
  shopRoster: ["technicians", "bays", "vendors", "shop"],
  clients: ["customer-accounts", "shop", "account-approval-settings"],
  settings: ["approval-settings", "account-approval-settings", "work-order", "requests", "shop", "alerts", "customer-accounts"],
  purchasing: ["purchase-orders", "demand-forecast", "fleet-parts"],
  access: ["users", "invitations"],
  organization: ["organization", "me"],
} as const;

export interface NewWorkOrderLine {
  id?: string;
  serviceTaskId?: string | null;
  /** The inventory item a shop-stock line issues. */
  itemId?: string | null;
  /** The rate shown is the item's price for the branch: leave it to the API to apply (it prices from its own branch). */
  priceFromItem?: boolean;
  description: string;
  category?: TaskCategory | "other";
  quantity: number;
  /** Pesos, as typed. */
  unitPartRate: number;
  labourHours: number;
  /** Pesos per hour, as typed. */
  labourRate: number;
  urgency: LineUrgency;
  partsSource: PartsSource;
}

export interface NewWorkOrderDraft {
  vehicleId: string;
  title: string;
  type: WorkOrderType;
  priority: Priority;
  notes?: string;
  vendor?: string;
  scheduledFor?: string | null;
  scheduledTime?: string | null;
  odometerAtIntake?: number | null;
  taskIds?: string[];
  branchId?: string | null;
  lines: NewWorkOrderLine[];
}

function lineToApi(line: NewWorkOrderLine) {
  return {
    ...(line.id ? { id: line.id } : {}),
    service_task_id: line.serviceTaskId ?? null,
    description: line.description,
    ...(line.category ? { category: line.category } : {}),
    quantity: line.quantity,
    // A part the customer brings is not charged, and a shop-stock price the advisor left alone comes from the API.
    ...(line.partsSource === "shop_stock" && line.priceFromItem ? {} : { unit_part_rate_cents: pesosToCents(line.partsSource === "customer_supplied" ? 0 : line.unitPartRate) }),
    labour_hours: line.labourHours,
    labour_rate_cents: pesosToCents(line.labourRate),
    urgency: line.urgency,
    parts_source: line.partsSource,
    // Only a shop-stock line names an item; the API refuses it on any other.
    ...(line.partsSource === "shop_stock" && line.itemId ? { item_id: line.itemId } : {}),
  };
}

export interface NewVehicleDraft {
  fleetClientId?: string | null;
  plateNumber: string;
  make: string;
  model: string;
  year: number | null;
  vin: string;
  vehicleClass: string | null;
  fuelType: string | null;
  color: string;
  status: string;
  assignedTo: string;
  department: string;
  location: string;
  acquiredOn: string | null;
  registrationExpiry: string | null;
  insuranceExpiry: string | null;
  driverLicenceExpiry: string | null;
  odometer?: number;
  odometerReadOn?: string | null;
}

function vehicleToApi(v: Partial<NewVehicleDraft>) {
  const body: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value === "" ? null : value;
  };
  set("customer_account_id", v.fleetClientId ?? undefined);
  set("plate_number", v.plateNumber);
  set("make", v.make);
  set("model", v.model);
  set("year", v.year);
  set("vin", v.vin);
  set("vehicle_class", v.vehicleClass);
  set("fuel_type", v.fuelType);
  set("color", v.color);
  set("status", v.status);
  set("assigned_to", v.assignedTo);
  set("department", v.department);
  set("location", v.location);
  set("acquired_on", v.acquiredOn);
  set("registration_expiry", v.registrationExpiry);
  set("insurance_expiry", v.insuranceExpiry);
  set("driver_licence_expiry", v.driverLicenceExpiry);
  return body;
}

export interface NewDocumentDraft {
  file: File;
  kind: string;
  name?: string;
  vehicleId?: string | null;
  workOrderId?: string | null;
  fleetClientId?: string | null;
  expiresOn?: string | null;
  referenceNumber?: string | null;
  issuedOn?: string | null;
  issuingBody?: string | null;
  notes?: string | null;
}

/** The API's upload cap (10 MB). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function useFleetActions() {
  const queryClient = useQueryClient();

  const refresh = useCallback(
    (roots: readonly string[]) =>
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && roots.includes(query.queryKey[0] as string),
      }),
    [queryClient]
  );

  /** A write, then refetch what it touched; resolves to the API's answer. */
  const write = useCallback(
    async <T>(roots: readonly string[], fn: () => Promise<T>): Promise<ActionResult<T>> => {
      const result = await run(fn);
      if (result.ok) await refresh(roots);
      return result;
    },
    [refresh]
  );

  const order = (raw: RawWorkOrder) => toWorkOrder(raw);

  return useMemo(
    () => ({
      /* ---------------------------------------------------- work orders */
      createWorkOrder: (draft: NewWorkOrderDraft) =>
        write(AFFECTS.work, async () =>
          order(
            await apiData<RawWorkOrder>("/work-orders", {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                vehicle_id: draft.vehicleId,
                title: draft.title,
                type: draft.type,
                priority: draft.priority,
                // Empty text is omitted, not sent: the API reads "" as null.
                ...(draft.notes ? { notes: draft.notes } : {}),
                ...(draft.vendor ? { vendor: draft.vendor } : {}),
                scheduled_for: draft.scheduledFor ?? null,
                scheduled_time: draft.scheduledTime ?? null,
                odometer_at_intake: draft.odometerAtIntake ?? null,
                task_ids: draft.taskIds ?? [],
                ...(draft.branchId ? { branch_id: draft.branchId } : {}),
                lines: draft.lines.map(lineToApi),
              },
            })
          )
        ),

      /** Draft fields (drafts only; the API refuses otherwise). */
      updateWorkOrder: (
        id: string,
        patch: Partial<Pick<NewWorkOrderDraft, "title" | "type" | "priority" | "notes" | "vendor" | "scheduledFor" | "scheduledTime" | "taskIds">>
      ) =>
        write(AFFECTS.work, async () => {
          const body: Record<string, unknown> = {};
          if (patch.title !== undefined) body.title = patch.title;
          if (patch.type !== undefined) body.type = patch.type;
          if (patch.priority !== undefined) body.priority = patch.priority;
          if (patch.notes !== undefined) body.notes = patch.notes;
          if (patch.vendor !== undefined) body.vendor = patch.vendor;
          if (patch.scheduledFor !== undefined) body.scheduled_for = patch.scheduledFor;
          if (patch.scheduledTime !== undefined) body.scheduled_time = patch.scheduledTime;
          if (patch.taskIds !== undefined) body.task_ids = patch.taskIds;
          return order(await apiData<RawWorkOrder>(`/work-orders/${id}`, { method: "PATCH", body }));
        }),

      /** Replaces a draft's lines; the API prices every one. */
      saveWorkOrderLines: (id: string, lines: NewWorkOrderLine[]) =>
        write(AFFECTS.work, async () =>
          order(await apiData<RawWorkOrder>(`/work-orders/${id}/lines`, { method: "PUT", body: { lines: lines.map(lineToApi) } }))
        ),

      sendForApproval: (id: string) =>
        write(AFFECTS.work, async () => order(await apiData<RawWorkOrder>(`/work-orders/${id}/send`, { method: "POST" }))),

      decideLines: (id: string, decisions: { lineId: string; decision: "approved" | "declined" | "deferred"; note?: string | null }[]) =>
        write(AFFECTS.work, async () =>
          order(
            await apiData<RawWorkOrder>(`/work-orders/${id}/decisions`, {
              method: "POST",
              body: { decisions: decisions.map((d) => ({ line_id: d.lineId, decision: d.decision, note: d.note ?? null })) },
            })
          )
        ),

      scheduleWorkOrder: (id: string, booking: { scheduledFor: string; scheduledTime: string; bayId: string; technicianId?: string | null }) =>
        write(AFFECTS.work, async () =>
          order(
            await apiData<RawWorkOrder>(`/work-orders/${id}/schedule`, {
              method: "POST",
              body: {
                scheduled_for: booking.scheduledFor,
                scheduled_time: booking.scheduledTime,
                bay_id: booking.bayId,
                ...(booking.technicianId !== undefined ? { technician_id: booking.technicianId } : {}),
              },
            })
          )
        ),

      startWorkOrder: (id: string, technicianId?: string | null) =>
        write(AFFECTS.work, async () =>
          order(
            await apiData<RawWorkOrder>(`/work-orders/${id}/start`, {
              method: "POST",
              body: technicianId !== undefined ? { technician_id: technicianId } : {},
            })
          )
        ),

      completeWorkOrder: (
        id: string,
        completion: {
          findings?: string;
          odometerAtService?: number;
          parts?: { partNumber?: string; name: string; quantity: number; unitCost: number }[];
          taskIds?: string[];
        }
      ) =>
        write(AFFECTS.work, async () =>
          order(
            await apiData<RawWorkOrder>(`/work-orders/${id}/complete`, {
              method: "POST",
              body: {
                ...(completion.findings ? { findings: completion.findings } : {}),
                ...(completion.odometerAtService !== undefined ? { odometer_at_service: completion.odometerAtService } : {}),
                ...(completion.parts
                  ? {
                      parts: completion.parts.map((p) => ({
                        part_number: p.partNumber ?? null,
                        name: p.name,
                        quantity: p.quantity,
                        unit_cost_cents: pesosToCents(p.unitCost),
                      })),
                    }
                  : {}),
                ...(completion.taskIds ? { task_ids: completion.taskIds } : {}),
              },
            })
          )
        ),

      closeWorkOrder: (id: string, varianceApproved = false) =>
        write(AFFECTS.work, async () =>
          order(
            await apiData<RawWorkOrder>(`/work-orders/${id}/close`, {
              method: "POST",
              body: varianceApproved ? { variance_approved: true } : {},
            })
          )
        ),

      cancelWorkOrder: (id: string, reason: string) =>
        write(AFFECTS.work, async () => order(await apiData<RawWorkOrder>(`/work-orders/${id}/cancel`, { method: "POST", body: { reason } }))),

      collectWorkOrder: (id: string) =>
        write(AFFECTS.work, async () => order(await apiData<RawWorkOrder>(`/work-orders/${id}/collect`, { method: "POST" }))),

      /** All or none: every order must be closed and uncollected. */
      collectWorkOrders: (ids: string[]) =>
        write(AFFECTS.work, async () => {
          const body = await apiData<{ collected: number; work_orders: RawWorkOrder[] }>("/work-orders/collect", {
            method: "POST",
            body: { work_order_ids: ids },
          });
          return { collected: body.collected, workOrders: body.work_orders.map(toWorkOrder) };
        }),

      autoSchedule: (params: { customerAccountId?: string } = {}) =>
        write(AFFECTS.work, async () => {
          const body = await apiData<{ created: number; work_orders: RawWorkOrder[] }>("/work-orders/auto-schedule", {
            method: "POST",
            idempotencyKey: newIdempotencyKey(),
            body: params.customerAccountId ? { customer_account_id: params.customerAccountId } : {},
          });
          return { created: body.created, workOrders: body.work_orders.map(toWorkOrder) };
        }),

      /* -------------------------------------------------------- fleet */
      addVehicle: (draft: NewVehicleDraft) =>
        write(AFFECTS.fleet, async () =>
          toVehicle(
            await apiData<RawVehicle>("/vehicles", {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                ...vehicleToApi(draft),
                odometer: { value: draft.odometer ?? 0, ...(draft.odometerReadOn ? { read_on: draft.odometerReadOn } : {}) },
              },
            })
          )
        ),

      updateVehicle: (id: string, patch: Partial<NewVehicleDraft>) =>
        write(AFFECTS.fleet, async () => {
          const { fleetClientId: _ignored, ...rest } = patch;
          void _ignored;
          return toVehicle(await apiData<RawVehicle>(`/vehicles/${id}`, { method: "PATCH", body: vehicleToApi(rest) }));
        }),

      /** An odometer reading. A 422 with a warning needs `confirmWarning` to save. */
      recordReading: (vehicleId: string, reading: { value: number; readOn?: string | null; confirmWarning?: boolean }) =>
        write(AFFECTS.fleet, async () =>
          toMeterReading(
            await apiData<RawMeterReading>(`/vehicles/${vehicleId}/readings`, {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                value: reading.value,
                ...(reading.readOn ? { read_on: reading.readOn } : {}),
                ...(reading.confirmWarning ? { confirm_warning: true } : {}),
              },
            })
          )
        ),

      voidReading: (vehicleId: string, readingId: string, reason: string) =>
        write(AFFECTS.fleet, async () =>
          toMeterReading(await apiData<RawMeterReading>(`/vehicles/${vehicleId}/readings/${readingId}/void`, { method: "POST", body: { reason } }))
        ),

      archiveVehicle: (id: string) => write(AFFECTS.fleet, async () => api(`/vehicles/${id}`, { method: "DELETE" })),

      /* ---------------------------------------------------- documents */
      addDocument: (draft: NewDocumentDraft) =>
        write(AFFECTS.documents, async () => {
          const form = new FormData();
          form.append("file", draft.file);
          form.append("kind", draft.kind);
          const optional: [string, string | null | undefined][] = [
            ["name", draft.name],
            ["vehicle_id", draft.vehicleId],
            ["work_order_id", draft.workOrderId],
            ["customer_account_id", draft.fleetClientId],
            ["expires_on", draft.expiresOn],
            ["reference_number", draft.referenceNumber],
            ["issued_on", draft.issuedOn],
            ["issuing_body", draft.issuingBody],
            ["notes", draft.notes],
          ];
          for (const [key, value] of optional) if (value) form.append(key, value);
          return toDocument(await apiData<RawDocument>("/documents", { method: "POST", body: form, idempotencyKey: newIdempotencyKey() }));
        }),

      deleteDocument: (id: string) => write(AFFECTS.documents, async () => api(`/documents/${id}`, { method: "DELETE" })),

      /** Opens a document through its short-lived signed URL. */
      downloadDocument: (id: string) =>
        run(async () => {
          const { url } = await apiData<{ url: string; expires_at: string }>(`/documents/${id}/download`);
          window.open(url, "_blank", "noopener");
        }),

      /* ------------------------------------------------------- alerts */
      markAlertsRead: (ids: string[]) =>
        write(AFFECTS.alerts, async () => api("/alerts/read", { method: "POST", body: { alert_ids: ids } })),
      dismissAlert: (id: string) => write(AFFECTS.alerts, async () => api("/alerts/dismiss", { method: "POST", body: { alert_ids: [id] } })),
      restoreAlerts: (ids: string[]) =>
        write(AFFECTS.alerts, async () => api("/alerts/restore", { method: "POST", body: { alert_ids: ids } })),

      /* ----------------------------------------------- approval bands */
      /** The organization's defaults (staff with organization rights). */
      updateApprovalSettings: (patch: Partial<ApprovalSettings>) =>
        write(AFFECTS.settings, async () => api("/approval-settings", { method: "PUT", body: settingsToApi(patch) })),

      /** One branch's sparse override; `null` clears a key. */
      updateBranchApprovalSettings: (branchId: string, patch: { [K in keyof ApprovalSettings]?: ApprovalSettings[K] | null }) =>
        write(AFFECTS.settings, async () => api(`/branches/${branchId}/approval-settings`, { method: "PUT", body: settingsToApi(patch) })),

      /** A customer account's own bands; `null` clears a key (it inherits). */
      updateAccountApprovalSettings: (accountId: string, patch: { [K in keyof ApprovalSettings]?: ApprovalSettings[K] | null }) =>
        write(AFFECTS.settings, async () =>
          api(`/customer-accounts/${accountId}/approval-settings`, { method: "PATCH", body: settingsToApi(patch) })
        ),

      /* ------------------------------------------------ organization */
      updateTenantSettings: (patch: { displayName?: string; logoUrl?: string | null; brandColor?: string; supportEmail?: string }) =>
        write(AFFECTS.organization, async () => {
          const body: Record<string, unknown> = {};
          if (patch.displayName !== undefined) body.name = patch.displayName;
          if (patch.logoUrl !== undefined) body.logo_url = patch.logoUrl;
          if (patch.brandColor !== undefined) body.brand_color = patch.brandColor;
          if (patch.supportEmail !== undefined) body.support_email = patch.supportEmail;
          return api("/organization", { method: "PATCH", body });
        }),

      /* ------------------------------------------------------ clients */
      addFleetClient: (body: Record<string, unknown>) =>
        write(AFFECTS.clients, async () =>
          toFleetClient(await apiData<RawCustomerAccount>("/customer-accounts", { method: "POST", idempotencyKey: newIdempotencyKey(), body }))
        ),
      updateFleetClient: (id: string, body: Record<string, unknown>) =>
        write(AFFECTS.clients, async () => toFleetClient(await apiData<RawCustomerAccount>(`/customer-accounts/${id}`, { method: "PATCH", body }))),
      suspendFleetClient: (id: string) => write(AFFECTS.clients, async () => api(`/customer-accounts/${id}/suspend`, { method: "POST" })),
      reactivateFleetClient: (id: string) => write(AFFECTS.clients, async () => api(`/customer-accounts/${id}/reactivate`, { method: "POST" })),

      /** Counter registration: customer + consent + vehicle + first reading, one transaction. */
      checkInWalkIn: (body: Record<string, unknown>) =>
        write([...AFFECTS.clients, ...AFFECTS.fleet], async () => {
          const created = await apiData<{ customer: RawCustomerAccount; vehicle: RawVehicle }>("/check-in", {
            method: "POST",
            idempotencyKey: newIdempotencyKey(),
            body,
          });
          return { customer: toFleetClient(created.customer), vehicle: toVehicle(created.vehicle) };
        }),

      /* --------------------------------------------- purchasing */
      generatePurchaseOrders: (params: { partIds: string[]; horizonWeeks: number; customerAccountId?: string; notes?: string }) =>
        write(AFFECTS.purchasing, async () =>
          (
            await apiData<RawPurchaseOrder[]>("/purchase-orders", {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                part_ids: params.partIds,
                horizon_weeks: params.horizonWeeks,
                ...(params.customerAccountId ? { customer_account_id: params.customerAccountId } : {}),
                ...(params.notes ? { notes: params.notes } : {}),
              },
            })
          ).map(toPurchaseOrder)
        ),
      sendPurchaseOrder: (id: string) =>
        write(AFFECTS.purchasing, async () => toPurchaseOrder(await apiData<RawPurchaseOrder>(`/purchase-orders/${id}/send`, { method: "POST" }))),
      receivePurchaseOrder: (id: string) =>
        write(AFFECTS.purchasing, async () => toPurchaseOrder(await apiData<RawPurchaseOrder>(`/purchase-orders/${id}/receive`, { method: "POST" }))),
      cancelPurchaseOrder: (id: string, reason: string) =>
        write(AFFECTS.purchasing, async () =>
          toPurchaseOrder(await apiData<RawPurchaseOrder>(`/purchase-orders/${id}/cancel`, { method: "POST", body: { reason } }))
        ),
      exportPurchaseOrders: (params: { format: "xlsx" | "csv"; status?: string; customerAccountId?: string }) =>
        run(async () => {
          const { blob, filename } = await apiBlob("/purchase-orders/export", {
            query: { format: params.format, status: params.status, customer_account_id: params.customerAccountId },
          });
          saveBlob(blob, filename ?? `purchase-orders.${params.format}`);
        }),
      exportPurchaseOrder: (id: string, reference: string, format: "xlsx" | "csv" = "xlsx") =>
        run(async () => {
          const { blob, filename } = await apiBlob(`/purchase-orders/${id}/export`, { query: { format } });
          saveBlob(blob, filename ?? `${reference}.${format}`);
        }),

      /* ---------------------------------------------- catalogue */
      addServiceTask: (body: Record<string, unknown>) =>
        write(AFFECTS.catalogue, async () => toServiceTask(await apiData<RawServiceTask>("/service-tasks", { method: "POST", body }))),
      updateServiceTask: (id: string, body: Record<string, unknown>) =>
        write(AFFECTS.catalogue, async () => toServiceTask(await apiData<RawServiceTask>(`/service-tasks/${id}`, { method: "PATCH", body }))),
      deleteServiceTask: (id: string) => write(AFFECTS.catalogue, async () => api(`/service-tasks/${id}`, { method: "DELETE" })),

      /* ------------------------------------------- shop roster */
      addTechnician: (body: Record<string, unknown>) =>
        write(AFFECTS.shopRoster, async () => toTechnician(await apiData<RawTechnician>("/technicians", { method: "POST", body }))),
      updateTechnician: (id: string, body: Record<string, unknown>) =>
        write(AFFECTS.shopRoster, async () => toTechnician(await apiData<RawTechnician>(`/technicians/${id}`, { method: "PATCH", body }))),
      deleteTechnician: (id: string) => write(AFFECTS.shopRoster, async () => api(`/technicians/${id}`, { method: "DELETE" })),
      addVendor: (draft: { name: string; active?: boolean }) =>
        write(AFFECTS.shopRoster, async () =>
          toVendor(await apiData<RawVendor>("/vendors", { method: "POST", body: { name: draft.name, is_active: draft.active ?? true } }))
        ),
      updateVendor: (id: string, patch: { name?: string; active?: boolean }) =>
        write(AFFECTS.shopRoster, async () =>
          toVendor(
            await apiData<RawVendor>(`/vendors/${id}`, {
              method: "PATCH",
              body: { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.active !== undefined ? { is_active: patch.active } : {}) },
            })
          )
        ),
      deleteVendor: (id: string) => write(AFFECTS.shopRoster, async () => api(`/vendors/${id}`, { method: "DELETE" })),

      /* ------------------------------------------------- access */
      inviteUser: (body: Record<string, unknown>) =>
        write(AFFECTS.access, async () =>
          toInvitation(await apiData<RawInvitation>("/invitations", { method: "POST", idempotencyKey: newIdempotencyKey(), body }))
        ),
      revokeInvitation: (id: string) => write(AFFECTS.access, async () => api(`/invitations/${id}`, { method: "DELETE" })),
      updateMember: (id: string, body: Record<string, unknown>) =>
        write(AFFECTS.access, async () => toMember(await apiData<RawUser>(`/users/${id}`, { method: "PATCH", body }))),

      /** "Reset demo data" is now a refetch of every screen's reads. */
      resetFleet: () => queryClient.invalidateQueries(),
    }),
    [write, queryClient]
  );
}
