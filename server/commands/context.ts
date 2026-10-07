import "server-only";

import type { FleetClient, Provider, Session, UserRole } from "@/types";
import type { Db, Tx } from "@/server/db-port";
import { can, ROLE_LABEL, type Capability } from "@/lib/rbac-core";
import { explainTenantScope, visibleFleetClientIds, type TenantScope } from "@/lib/tenancy";
import { toFleetClient, toProvider } from "@/lib/mappers";
import type { PlanActor } from "@/lib/work-order-plans";
import { CommandError, toFailure, type CommandResult } from "@/server/commands/result";

/**
 * The shared preamble of every server command (Standing Rule R3).
 *
 *   verify session ─► open ONE transaction (as pms_server, with the user's
 *   claims) ─► load the caller's profile and the tenancy rows RLS lets them
 *   see ─► resolve TenantScope with lib/tenancy.ts ─► check capability with
 *   lib/rbac-core.ts ─► run the command body ─► commit, or roll back on throw
 *   ─► map the outcome to a CommandResult.
 *
 * Scope is resolved *inside* the transaction rather than before it, so the
 * profile, the client's status, and the rows the command then locks are one
 * consistent snapshot: a client suspended a moment ago cannot slip a write
 * through on a scope computed from older data.
 */

/** A user whose session the server has checked against GoTrue. */
export interface VerifiedUser {
  id: string;
  email: string | null;
}

export interface CommandDeps {
  db: Db;
  /** Injected so tests are deterministic; defaults to the wall clock. */
  now?: () => Date;
  /** Injected so tests are deterministic; defaults to crypto.randomUUID. */
  newId?: () => string;
}

export interface CommandScope {
  tx: Tx;
  user: VerifiedUser;
  session: Session;
  scope: TenantScope;
  providers: Provider[];
  fleetClients: FleetClient[];
  /** Every fleet client this caller may touch. */
  visibleClientIds: ReadonlySet<string>;
  actor: PlanActor;
  now: Date;
  newId: () => string;
}

function sessionFromProfile(row: Record<string, unknown>, now: Date): Session {
  const name = String(row.name ?? row.email ?? "");
  return {
    uid: String(row.id),
    email: String(row.email ?? ""),
    name,
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
    username: String(row.username ?? ""),
    role: row.role as UserRole,
    title: String(row.title ?? ""),
    signedInAt: now.toISOString(),
    providerId: (row.provider_id as string | null) ?? null,
    fleetClientId: (row.fleet_client_id as string | null) ?? null,
  };
}

/** Fails the command unless the caller's role holds `capability`. */
export function requireCapability(c: CommandScope, capability: Capability | null) {
  if (capability && !can(c.session.role, capability)) {
    throw new CommandError(
      "forbidden",
      `${ROLE_LABEL[c.session.role] ?? "Your role"} can't do that.`
    );
  }
}

/**
 * @param capability checked before the body runs. Pass `null` when the
 *   capability depends on what is loaded (a transition's target, say) and
 *   call `requireCapability` from the body instead.
 */
export async function runCommand<T>(
  label: string,
  deps: CommandDeps,
  user: VerifiedUser | null,
  capability: Capability | null,
  body: (c: CommandScope) => Promise<T>
): Promise<CommandResult<T>> {
  if (!user) {
    return { ok: false, code: "unauthenticated", message: "Sign in again to continue." };
  }

  const now = deps.now ? deps.now() : new Date();
  const newId = deps.newId ?? (() => crypto.randomUUID());

  try {
    const data = await deps.db.withUserTx(user, async (tx) => {
      const [profile] = await tx.select("pms_profiles", { id: user.id });
      if (!profile) {
        throw new CommandError("forbidden", "Your account has no tenant scope.");
      }

      const [providerRows, clientRows] = await Promise.all([
        tx.select("pms_providers"),
        tx.select("pms_fleet_clients"),
      ]);
      const providers = providerRows.map(toProvider);
      const fleetClients = clientRows.map(toFleetClient);
      const session = sessionFromProfile(profile, now);

      // The same fail-closed resolution the UI uses — no scope, no write.
      const { scope, denial } = explainTenantScope(session, providers, fleetClients);
      if (!scope) {
        throw new CommandError("forbidden", `Your account has no tenant scope (${denial}).`);
      }

      const c: CommandScope = {
        tx,
        user,
        session,
        scope,
        providers,
        fleetClients,
        visibleClientIds: new Set(visibleFleetClientIds(scope, fleetClients)),
        actor: { id: user.id, name: session.name },
        now,
        newId,
      };

      requireCapability(c, capability);
      return body(c);
    });
    return { ok: true, data };
  } catch (error) {
    return toFailure(error, label);
  }
}
