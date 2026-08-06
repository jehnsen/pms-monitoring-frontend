"use client";

import { useCallback } from "react";
import { useSession } from "@/lib/auth";
import type { UserRole } from "@/types";

export type { UserRole };

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
  fleet_manager: "Fleet Manager",
  operations: "Operations Staff",
  technician: "Technician",
  purchasing_officer: "Purchasing Officer",
  viewer: "Authorised Viewer",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  fleet_manager:
    "Full control: schedules, work orders, documents, settings, and access. The only role with unlimited approval authority.",
  operations:
    "Raises and schedules work, logs readings, files documents, and approves purchases within threshold. Cannot change settings or access.",
  technician:
    "Works the bay: updates and closes jobs, records parts and findings, attaches reports.",
  purchasing_officer:
    "Views everything and approves purchases within threshold, and issues purchase orders. Cannot edit PMS intervals or close work orders.",
  viewer:
    "Read-only. Sees every screen and can export nothing that changes state.",
};

/** Capability grants per role. Order is least- to most-privileged. */
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
