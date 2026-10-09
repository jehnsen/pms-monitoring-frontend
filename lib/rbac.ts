"use client";

import { useCallback } from "react";
import { useSession } from "@/lib/auth";
import type { Capability, ClientUserRole, ProviderUserRole, UserRole } from "@/types";

export type { UserRole, ClientUserRole, ProviderUserRole, Capability };

/**
 * Permissions, as the API grants them.
 *
 * What a session may do is `GET /me` → `capabilities`; `useCan()` reads it.
 * The API re-checks every request (capability, tenant scope, module), so this
 * only decides what the UI offers. Denied controls render through
 * `DeniedAction` with the reason below — dimmed with a reason, never hidden.
 *
 * The labels and the role matrix are presentation: the access page documents
 * who can do what. The matrix mirrors the API's `AccessMatrix`; it is never
 * consulted to allow anything.
 */

export const ROLE_LABEL: Record<UserRole, string> = {
  provider_admin: "Provider Admin",
  service_advisor: "Service Advisor",
  provider_technician: "Provider Technician",
  branch_manager: "Branch Manager",
  cashier: "Cashier",
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
  branch_manager:
    "Runs the branches they are pinned to: everything the provider admin can do there except organization settings.",
  cashier: "Front counter: registers customers and looks up stock. No access to jobs or spend.",
  fleet_manager:
    "Full control of their own fleet: schedules, work orders, documents, and settings. Unlimited approval authority within that one client. Cannot view or add users — only the provider admin manages accounts.",
  operations:
    "Raises and schedules work, logs readings, files documents, and approves purchases within threshold. Cannot change settings or access.",
  technician:
    "Works the bay: updates and closes jobs, records parts and findings, attaches reports.",
  purchasing_officer:
    "Views everything and approves purchases within threshold, and issues purchase orders. Cannot edit PMS intervals or close work orders.",
  viewer: "Read-only. Sees every screen and can export nothing that changes state.",
};

export const CLIENT_ROLES: ClientUserRole[] = [
  "fleet_manager",
  "operations",
  "purchasing_officer",
  "technician",
  "viewer",
];

export const PROVIDER_ROLES: ProviderUserRole[] = [
  "provider_admin",
  "branch_manager",
  "service_advisor",
  "provider_technician",
  "cashier",
];

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
  "customer:manage",
  "organization:manage",
  "inventory:view",
  "inventory:manage",
];

/** The API's labels (`Capability::label()`). */
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
  "customer:manage": "Manage customer accounts",
  "organization:manage": "Manage the organization",
  "inventory:view": "View the shop inventory",
  "inventory:manage": "Manage the shop inventory",
};

/**
 * Documentation of the API's role grants, for the access page's matrix only.
 * Mirrors `App\Domain\Access\AccessMatrix`; the session's own list, from
 * `/me`, is what the UI acts on.
 */
export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  viewer: [],
  technician: ["vehicle:update", "workorder:update", "workorder:complete", "document:upload"],
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
    "customer:manage",
  ],
  provider_technician: ["vehicle:update", "workorder:update", "workorder:complete", "document:upload", "inventory:view"],
  service_advisor: [
    "vehicle:update",
    "vehicle:manage",
    "workorder:create",
    "workorder:update",
    "document:upload",
    "customer:manage",
    "inventory:view",
  ],
  cashier: ["customer:manage", "inventory:view"],
  branch_manager: ALL_CAPABILITIES.filter((c) => c !== "organization:manage"),
  provider_admin: [...ALL_CAPABILITIES],
};

/** Why an action is unavailable — shown on the disabled control itself. */
export function denialReason(roleLabel: string | undefined, capability: Capability) {
  if (!roleLabel) return "Sign in to do this.";
  return `${roleLabel} doesn't have permission to ${CAPABILITY_LABEL[capability].toLowerCase()}.`;
}

/** What the signed-in session may do, from `/me`. */
export function useCan() {
  const { session } = useSession();
  const role = session?.role;
  const capabilities = session?.capabilities;
  const roleLabel = session?.roleLabel;

  const side = session?.side;
  const check = useCallback((capability: Capability) => capabilities?.includes(capability) ?? false, [capabilities]);
  const reason = useCallback((capability: Capability) => denialReason(roleLabel, capability), [roleLabel]);

  /**
   * For writes the API keeps to staff (the shop's catalogue, roster and
   * vendors): the capability AND the staff side. A portal fleet manager holds
   * `settings:manage` for their own fleet, not the service centre's.
   */
  const canAsStaff = useCallback((capability: Capability) => side === "staff" && check(capability), [side, check]);
  const staffReason = useCallback(
    (capability: Capability) => (side !== "staff" ? "Only the service centre can change this." : reason(capability)),
    [side, reason]
  );

  return { role, side, can: check, reason, canAsStaff, staffReason };
}
