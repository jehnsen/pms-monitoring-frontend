"use client";

import { useCallback } from "react";
import { useSession } from "@/lib/auth";

/**
 * Role-based access control.
 *
 * The pure matrix — `Capability`, `ROLE_CAPABILITIES`, `can()`, and friends —
 * lives in `lib/rbac-core.ts`, which has no React import and can run on the
 * server (a Route Handler, `lib/work-order-machine.ts`). This module exists
 * only to add `useCan()`, which is why it alone needs "use client".
 */
export * from "@/lib/rbac-core";

import { can, denialReason, type Capability } from "@/lib/rbac-core";

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
