"use client";

import { useCallback } from "react";
import { useSession } from "@/lib/auth";
import type { ClientUserRole, ProviderUserRole, UserRole } from "@/types";

export type { UserRole, ClientUserRole, ProviderUserRole };

/**
 * Role-based access control.
 *
 * **This is a UI affordance, not a security control.** Everything runs in the
 * browser, so a determined user can grant themselves any capability from
 * devtools. Its job is to keep people out of actions that aren't theirs and to
 * make the permission model legible — real enforcement has to live on a server
 * that this build doesn't have. When an API goes in, mirror this matrix there
 * and treat the client copy as a hint.
 */

export type Capability =
  | "vehicle:update"
  | "vehicle:manage"
  | "workorder:create"
  | "workorder:update"
  | "workorder:complete"
  | "workorder:approve"
  | "po:issue"
  | "document:upload"
  | "document:delete"
  | "settings:manage"
  | "access:manage";

export const ROLE_LABEL: Record<UserRole, string> = {
  provider_admin: "Provider Admin",
  service_advisor: "Service Advisor",
  provider_technician: "Provider Technician",
  fleet_manager: "Fleet Manager",
  operations: "Operations Staff",
  technician: "Technician",
  purchasing_officer: "Purchasing Officer",
  viewer: "Authorised Viewer",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  provider_admin:
    "Full access to the provider and every fleet client beneath it. The only role that can onboard clients or see across them.",
  service_advisor:
    "Front of house across all clients: checks vehicles in and out, raises work orders, and sends quotations.",
  provider_technician:
    "Works assigned jobs across all clients: records findings and parts, and closes jobs. Cannot approve spend.",
  fleet_manager:
    "Full control of their own fleet: schedules, work orders, documents, settings, and access. Unlimited approval authority within that one client.",
  operations:
    "Raises and schedules work, logs readings, files documents, and approves purchases within threshold. Cannot change settings or access.",
  technician:
    "Works the bay: updates and closes jobs, records parts and findings, attaches reports.",
  purchasing_officer:
    "Views everything and approves purchases within threshold, and issues purchase orders. Cannot edit PMS intervals or close work orders.",
  viewer:
    "Read-only. Sees every screen and can export nothing that changes state.",
};

/**
 * Which side of the tenancy boundary each role sits on. Client-side roles are
 * scoped to one fleet client and can never see across; provider-side roles see
 * every client beneath their provider. Enforced in `lib/tenancy.ts`, not here —
 * this is only how the matrix is presented.
 */
export const CLIENT_ROLES: ClientUserRole[] = [
  "fleet_manager",
  "operations",
  "purchasing_officer",
  "technician",
  "viewer",
];

export const PROVIDER_ROLES: ProviderUserRole[] = [
  "provider_admin",
  "service_advisor",
  "provider_technician",
];

/**
 * Capability grants per role. Order is least- to most-privileged.
 *
 * Note what a provider-side grant does and does not mean: it is the same
 * capability set, applied across every client beneath the provider rather than
 * one. Cross-client *visibility* comes from the tenant scope in
 * `lib/tenancy.ts`, never from a capability here — which is why no client-side
 * role can be widened into one by editing this table.
 */
export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  viewer: [],
  technician: [
    "vehicle:update",
    "workorder:update",
    "workorder:complete",
    "document:upload",
  ],
  purchasing_officer: ["workorder:approve", "po:issue", "document:upload"],
  operations: [
    "vehicle:update",
    "vehicle:manage",
    "workorder:create",
    "workorder:update",
    "workorder:complete",
    "workorder:approve",
    "document:upload",
  ],
  fleet_manager: [
    "vehicle:update",
    "vehicle:manage",
    "workorder:create",
    "workorder:update",
    "workorder:complete",
    "workorder:approve",
    "po:issue",
    "document:upload",
    "document:delete",
    "settings:manage",
    "access:manage",
  ],

  // ------------------------------------------------------------ provider side
  /** Assigned jobs only: records findings and closes them. No spend authority. */
  provider_technician: [
    "vehicle:update",
    "workorder:update",
    "workorder:complete",
    "document:upload",
  ],
  /** Front of house: check-in/out, raises work, quotes. Does not approve spend. */
  service_advisor: [
    "vehicle:update",
    "vehicle:manage",
    "workorder:create",
    "workorder:update",
    "document:upload",
  ],
  provider_admin: [
    "vehicle:update",
    "vehicle:manage",
    "workorder:create",
    "workorder:update",
    "workorder:complete",
    "workorder:approve",
    "po:issue",
    "document:upload",
    "document:delete",
    "settings:manage",
    "access:manage",
  ],
};

export const ALL_CAPABILITIES: Capability[] = [
  "vehicle:update",
  "vehicle:manage",
  "workorder:create",
  "workorder:update",
  "workorder:complete",
  "workorder:approve",
  "po:issue",
  "document:upload",
  "document:delete",
  "settings:manage",
  "access:manage",
];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "vehicle:update": "Log odometer readings",
  "vehicle:manage": "Add and edit vehicle records",
  "workorder:create": "Raise work orders",
  "workorder:update": "Update job status",
  "workorder:complete": "Close work orders",
  "workorder:approve": "Approve purchases within threshold",
  "po:issue": "Issue purchase orders",
  "document:upload": "Upload documents",
  "document:delete": "Delete documents",
  "settings:manage": "Change settings & reset data",
  "access:manage": "Manage user access",
};

export function can(role: UserRole | undefined, capability: Capability) {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

/** Why an action is unavailable — shown on the disabled control itself. */
export function denialReason(role: UserRole | undefined, capability: Capability) {
  if (!role) return "Sign in to do this.";
  return `${ROLE_LABEL[role]} doesn't have permission to ${CAPABILITY_LABEL[
    capability
  ].toLowerCase()}.`;
}

export function useCan() {
  const { session } = useSession();
  const role = session?.role;

  const check = useCallback((capability: Capability) => can(role, capability), [role]);
  const reason = useCallback(
    (capability: Capability) => denialReason(role, capability),
    [role]
  );

  return { role, can: check, reason };
}
