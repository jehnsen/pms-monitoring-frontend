import type {
  AlertInteraction,
  ApprovalSettings,
  FleetClient,
  FleetState,
  Provider,
  ProviderUserRole,
  Session,
  TenantSettings,
  UserRole,
} from "@/types";

/**
 * Tenancy scoping.
 *
 * **This is now enforced server-side as well.** The rules below are mirrored
 * as Row Level Security policies in `supabase/migrations/0001_pms_schema.sql`
 * (`pms_visible_client_ids`), keyed off `auth.uid()` and the `pms_profiles`
 * row — neither of which the browser can forge. A client-side session that
 * asked for another tenant's rows would get nothing back from the database,
 * not merely a filtered view.
 *
 * This module is still the single definition of scope for the UI: it decides
 * what a screen renders without a round trip, and it keeps the two copies
 * honest (see `lib/rls-parity.test.ts`, which pins the SQL to these rules).
 * Note that `lib/rbac.ts` — *capabilities*, as opposed to *scope* — remains a
 * UI affordance only; a role's permission to act is not yet checked by the
 * database.
 *
 * The shape is:
 *
 *     provider
 *       └── fleet_client
 *             └── vehicles
 *                   └── work orders, PMS intervals, documents
 *
 * Provider-side sessions see every client beneath their provider. Client-side
 * sessions see exactly one client — never a sibling under the same provider,
 * which is the leak a naive `providerId` filter would wave through.
 */

export type TenantScope =
  | { kind: "provider"; providerId: string }
  | { kind: "client"; providerId: string; fleetClientId: string };

const PROVIDER_ROLES: ProviderUserRole[] = [
  "provider_admin",
  "service_advisor",
  "provider_technician",
];

export function isProviderRole(role: UserRole | undefined): role is ProviderUserRole {
  return !!role && (PROVIDER_ROLES as UserRole[]).includes(role);
}

/**
 * Why a session resolved to no scope. Surfaced so a fail-closed empty screen is
 * diagnosable rather than looking like data loss.
 */
export type ScopeDenial =
  | "no_session"
  | "no_provider"
  | "unknown_provider"
  | "unknown_client"
  | "provider_mismatch"
  | "client_suspended"
  | "role_side_mismatch";

export function explainTenantScope(
  session: Session | null,
  providers: Provider[],
  fleetClients: FleetClient[]
): { scope: TenantScope; denial: null } | { scope: null; denial: ScopeDenial } {
  if (!session) return { scope: null, denial: "no_session" };
  if (!session.providerId) return { scope: null, denial: "no_provider" };

  const provider = providers.find((p) => p.id === session.providerId);
  if (!provider) return { scope: null, denial: "unknown_provider" };

  // Provider-side: no client pinned, sees everything beneath the provider.
  if (session.fleetClientId === null) {
    if (!isProviderRole(session.role)) {
      // A client-side role with no client is ambiguous — it would otherwise
      // inherit provider-wide visibility, which is precisely the escalation
      // this whole module exists to prevent.
      return { scope: null, denial: "role_side_mismatch" };
    }
    return { scope: { kind: "provider", providerId: provider.id }, denial: null };
  }

  const client = fleetClients.find((c) => c.id === session.fleetClientId);
  if (!client) return { scope: null, denial: "unknown_client" };
  if (client.providerId !== provider.id) {
    return { scope: null, denial: "provider_mismatch" };
  }
  if (client.status === "suspended") {
    return { scope: null, denial: "client_suspended" };
  }

  return {
    scope: { kind: "client", providerId: provider.id, fleetClientId: client.id },
    denial: null,
  };
}

/**
 * The session's scope, or null when it is missing or ambiguous. Never falls
 * back to unscoped — a null here means the caller renders nothing.
 */
export function resolveTenantScope(
  session: Session | null,
  providers: Provider[],
  fleetClients: FleetClient[]
): TenantScope | null {
  return explainTenantScope(session, providers, fleetClients).scope;
}

/** Every client id the scope may read. Empty when there is no scope. */
export function visibleFleetClientIds(
  scope: TenantScope | null,
  fleetClients: FleetClient[]
): string[] {
  if (!scope) return [];
  if (scope.kind === "client") return [scope.fleetClientId];
  return fleetClients
    .filter((client) => client.providerId === scope.providerId)
    .map((client) => client.id);
}

/**
 * Stable key for one scope's own bookkeeping. Provider-wide and client-level
 * views of the same provider are deliberately distinct buckets — a provider
 * dismissing a fleet-wide alert has not decided anything on the client's behalf.
 */
export function tenantScopeKey(scope: TenantScope): string {
  return scope.kind === "client"
    ? `client:${scope.fleetClientId}`
    : `provider:${scope.providerId}`;
}

const NO_INTERACTION: AlertInteraction = { readIds: [], dismissedIds: [] };

/** One scope's alert read/dismiss state. Empty when there is no scope. */
export function alertsForScope(
  state: FleetState,
  scope: TenantScope | null
): AlertInteraction {
  if (!scope) return NO_INTERACTION;
  return state.alerts[tenantScopeKey(scope)] ?? NO_INTERACTION;
}

/**
 * Directory entries a scope may enumerate. A client sees only its own people —
 * not the provider's staff, and not a sibling client's.
 */
export function scopeAccounts<
  T extends { providerId: string; fleetClientId: string | null },
>(accounts: T[], scope: TenantScope | null): T[] {
  if (!scope) return [];
  if (scope.kind === "provider") {
    return accounts.filter((a) => a.providerId === scope.providerId);
  }
  return accounts.filter(
    (a) =>
      a.providerId === scope.providerId && a.fleetClientId === scope.fleetClientId
  );
}

/**
 * The approval bands actually in force for a scope.
 *
 * A client's contract may negotiate its own thresholds, held as a sparse
 * override on the `FleetClient`; anything it does not name falls through to the
 * provider's defaults. A provider-wide view uses the defaults outright, since
 * its clients can and do disagree — there is no single correct band to show
 * across them.
 */
export function effectiveApprovalSettings(
  state: FleetState,
  scope: TenantScope | null
): ApprovalSettings {
  if (!scope || scope.kind === "provider") return state.approvalSettings;
  const client = state.fleetClients.find((c) => c.id === scope.fleetClientId);
  return client
    ? approvalSettingsForClient(client, state.approvalSettings)
    : state.approvalSettings;
}

/**
 * One client's bands folded over the provider's defaults. Split out so the
 * shop can show a client's effective bands without standing up a whole
 * `FleetState` to ask the question.
 */
export function approvalSettingsForClient(
  client: FleetClient,
  defaults: ApprovalSettings
): ApprovalSettings {
  return client.approvalThresholdOverrides
    ? { ...defaults, ...client.approvalThresholdOverrides }
    : defaults;
}

/**
 * Branding resolves in two levels.
 *
 * Provider-side sessions always see the provider's own mark — this is the
 * service centre's instance and its staff should know whose software they are
 * in. A client-side session sees *its own* branding where it has supplied any,
 * falling back field by field to the provider's: a client with a logo but no
 * brand colour gets its logo on the provider's colour rather than a broken
 * half-theme. So Actimed's people see Actimed while the shop sees the shop.
 */
export function providerBranding(
  state: FleetState,
  scope: TenantScope | null
): TenantSettings {
  const provider = scope
    ? state.providers.find((p) => p.id === scope.providerId)
    : undefined;
  if (!provider) return state.tenant;

  const base: TenantSettings = {
    displayName: provider.name,
    logoUrl: provider.logoUrl,
    brandColor: provider.brandColor,
    supportEmail: provider.supportEmail,
  };

  if (!scope || scope.kind === "provider") return base;

  const client = state.fleetClients.find((c) => c.id === scope.fleetClientId);
  if (!client) return base;

  return {
    displayName: client.name,
    logoUrl: client.logoUrl ?? base.logoUrl,
    brandColor: client.brandColor ?? base.brandColor,
    // Support still routes to the provider — the client is not its own help desk.
    supportEmail: base.supportEmail,
  };
}

/** An entirely empty view. What every fail-closed path returns. */
function emptyView(state: FleetState): FleetState {
  return {
    providers: [],
    fleetClients: [],
    vehicles: [],
    workOrders: [],
    documents: [],
    parts: [],
    purchaseOrders: [],
    alerts: {},
    approvalSettings: state.approvalSettings,
    tenant: state.tenant,
  };
}

/**
 * Narrows a full fleet state to what one scope may read.
 *
 * Work orders derive their client through their vehicle, so an order whose
 * vehicle falls outside the scope is dropped rather than surviving as an
 * orphan. Documents, parts, and purchase orders carry their client explicitly
 * because their vehicle relationship is nullable, absent, or many-valued.
 */
export function scopeFleetState(
  state: FleetState,
  scope: TenantScope | null
): FleetState {
  if (!scope) return emptyView(state);

  const clientIds = new Set(visibleFleetClientIds(scope, state.fleetClients));
  if (clientIds.size === 0) return emptyView(state);

  const owns = (fleetClientId: string | null | undefined) =>
    !!fleetClientId && clientIds.has(fleetClientId);

  const vehicles = state.vehicles.filter((v) => owns(v.fleetClientId));
  const vehicleIds = new Set(vehicles.map((v) => v.id));

  const clientForVehicle = new Map(vehicles.map((v) => [v.id, v.fleetClientId]));

  return {
    providers: state.providers.filter((p) => p.id === scope.providerId),
    fleetClients: state.fleetClients.filter((c) => clientIds.has(c.id)),
    vehicles,
    workOrders: state.workOrders
      .filter((order) => vehicleIds.has(order.vehicleId))
      .map((order) => {
        const fleetClientId = clientForVehicle.get(order.vehicleId) ?? "";
        // Defensive: an append-only log entry whose stamped tenant disagrees
        // with its parent order is corrupt, not merely stale. Drop it rather
        // than render another client's approval history.
        const approvalLog = order.approvalLog.filter(
          (entry) => entry.fleetClientId === fleetClientId
        );
        return approvalLog.length === order.approvalLog.length
          ? order
          : { ...order, approvalLog };
      }),
    documents: state.documents.filter((d) => owns(d.fleetClientId)),
    parts: state.parts.filter((p) => owns(p.fleetClientId)),
    purchaseOrders: state.purchaseOrders.filter((po) => owns(po.fleetClientId)),
    // Only this scope's own bucket travels with the view; another tenant's
    // dismissals are not the caller's business.
    alerts: { [tenantScopeKey(scope)]: alertsForScope(state, scope) },
    approvalSettings: effectiveApprovalSettings(state, scope),
    tenant: providerBranding(state, scope),
  };
}
