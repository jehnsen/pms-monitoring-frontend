"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Capability, ModuleKey, Session, UserRole } from "@/types";
import { api, apiData, ensureCsrfCookie } from "@/lib/api/client";
import { describeApiError, isApiError } from "@/lib/api/errors";
import { ME_KEY } from "@/lib/api/query";
import type { ApiMe } from "@/lib/api/schema";
import { bindBranchToUser } from "@/lib/api/branch";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/tenant";

/**
 * Authentication against the TorqueLane API (Sanctum cookie session).
 *
 * The session is `GET /me`: who the user is, which side they sit on, their
 * capabilities, modules, branches and branding. Nothing here is decided in
 * the browser — the API answers, and re-checks on every request.
 */

/* --------------------------------------------------------- demo directory */

/**
 * The demo roster, for one-click sign-in. Rendered only when
 * `NEXT_PUBLIC_DEMO_MODE=true`; the accounts themselves are the API's demo
 * seed (`DemoSeeder::DEMO_USERS`, password `demo1234`).
 */
export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  title: string;
  /** Null for staff; else the demo customer account's name. */
  account: string | null;
}

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const DEMO_PASSWORD = "demo1234";

const ALL_DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "owner@mekanikomore.ph", password: DEMO_PASSWORD, name: "Mike Manabat", role: "provider_admin", title: "Owner / Provider Admin", account: null },
  { email: "advisor@mekanikomore.ph", password: DEMO_PASSWORD, name: "Divina Lacson", role: "service_advisor", title: "Service Advisor", account: null },
  { email: "bay@mekanikomore.ph", password: DEMO_PASSWORD, name: "Arnel Pascual", role: "provider_technician", title: "Provider Technician", account: null },
  { email: "donmiguel@mekanikomor.ph", password: DEMO_PASSWORD, name: "Don Miguel", role: "fleet_manager", title: "Fleet Manager", account: "Actimed" },
  { email: "ops@mekanikomore.ph", password: DEMO_PASSWORD, name: "Marisol Bautista", role: "operations", title: "Operations Supervisor", account: "Actimed" },
  { email: "tech@mekanikomore.ph", password: DEMO_PASSWORD, name: "Arnel Pascual", role: "technician", title: "Lead Technician", account: "Actimed" },
  { email: "purchasing@mekanikomor.ph", password: DEMO_PASSWORD, name: "Grace Villanueva", role: "purchasing_officer", title: "Purchasing Officer", account: "Actimed" },
  { email: "viewer@mekanikomore.ph", password: DEMO_PASSWORD, name: "Camille Ortega", role: "viewer", title: "Authorised Viewer", account: "Actimed" },
  { email: "fleet@northwind.ph", password: DEMO_PASSWORD, name: "Ruben Salcedo", role: "fleet_manager", title: "Fleet Manager", account: "Northwind Logistics" },
  { email: "operations@sagrada.ph", password: DEMO_PASSWORD, name: "Imelda Cortez", role: "fleet_manager", title: "Operations Director", account: "Sagrada Medical Transport" },
  // Bayani is suspended: signing in is refused (the fail-closed path, live).
  { email: "yard@bayanicon.ph", password: DEMO_PASSWORD, name: "Andres Malolos", role: "fleet_manager", title: "Yard Manager (suspended account)", account: "Bayani Construction" },
];

/** Empty outside demo mode, so nothing renders the roster in production. */
export const DEMO_ACCOUNTS: DemoAccount[] = DEMO_MODE ? ALL_DEMO_ACCOUNTS : [];

export type { Session };

/* ------------------------------------------------------------ the session */

/** `/me` → the app's Session. */
export function sessionFromMe(me: ApiMe): Session {
  const branding = me.branding;
  return {
    uid: me.user.id,
    email: me.user.email,
    name: me.user.name,
    firstName: me.user.first_name,
    lastName: me.user.last_name,
    username: me.user.username ?? "",
    role: me.user.role as UserRole,
    roleLabel: me.user.role_label,
    title: me.user.title ?? "",
    side: me.side,
    providerId: me.organization.id,
    providerName: me.organization.name,
    fleetClientId: me.customer_account?.id ?? null,
    fleetClientName: me.customer_account?.display_name ?? null,
    capabilities: me.capabilities as Capability[],
    modules: me.modules.active as ModuleKey[],
    branches: me.branches.allowed.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
    branchRestricted: me.branches.restricted,
    branding: {
      displayName: branding.display_name || DEFAULT_TENANT_SETTINGS.displayName,
      logoUrl: branding.logo_url,
      brandColor: branding.brand_color ?? DEFAULT_TENANT_SETTINGS.brandColor,
      supportEmail: branding.support_email ?? DEFAULT_TENANT_SETTINGS.supportEmail,
    },
  };
}

/** `null` when nobody is signed in (a 401 is an answer, not an error). */
async function fetchSession(): Promise<Session | null> {
  try {
    return sessionFromMe(await apiData<ApiMe>("/me", { branch: null }));
  } catch (error) {
    if (isApiError(error) && (error.isUnauthenticated || error.status === 403)) return null;
    throw error;
  }
}

/**
 * `ready` is false until `/me` has answered once; `session` is null when
 * nobody is signed in. The guard must tell those apart or every first paint
 * bounces to the login screen.
 */
export function useSession(): { session: Session | null; ready: boolean } {
  const query = useQuery({ queryKey: ME_KEY, queryFn: fetchSession, staleTime: 5 * 60_000 });
  const session = query.data ?? null;

  useEffect(() => {
    if (query.isSuccess) {
      bindBranchToUser(session?.side === "staff" ? session.uid : null, session?.branches.map((b) => b.id) ?? []);
    }
  }, [query.isSuccess, session]);

  return { session, ready: query.isSuccess || query.isError };
}

/* ---------------------------------------------------------------- actions */

export type SignInResult = { ok: true; session: Session } | { ok: false; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string; fields?: Record<string, string[]> };

export function useAuthActions() {
  const queryClient = useQueryClient();

  const establish = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      try {
        await ensureCsrfCookie(true);
        const me = await apiData<ApiMe>("/auth/login", {
          method: "POST",
          body: { email: email.trim().toLowerCase(), password },
          branch: null,
        });
        const session = sessionFromMe(me);
        // A new identity: drop everything cached for the previous one.
        queryClient.clear();
        queryClient.setQueryData(ME_KEY, session);
        return { ok: true, session };
      } catch (error) {
        if (isApiError(error) && error.code === "validation") {
          return { ok: false, error: error.field("email") ?? "That email and password combination isn't recognised." };
        }
        return { ok: false, error: describeApiError(error) };
      }
    },
    [queryClient]
  );

  const signIn = useCallback((email: string, password: string) => establish(email, password), [establish]);

  /**
   * Null the session — that disables every session-bound query — and drop the
   * data nothing is showing. Queries a mounted screen still observes are left
   * to unmount and be collected: removing one would make its observer refetch
   * at once, into a 401. Every key carries the user id, so none of it can
   * surface for whoever signs in next.
   */
  const endSession = useCallback(() => {
    queryClient.setQueryData(ME_KEY, null);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== ME_KEY[0] && query.getObserversCount() === 0,
    });
    // Signing out rotates the session; take its new token before the next write.
    void ensureCsrfCookie(true);
  }, [queryClient]);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST", branch: null });
    } catch {
      // Signing out of a session that already ended is still signing out.
    }
    endSession();
  }, [endSession]);

  /** Demo convenience (demo mode only): sign out, then in as the given demo account. */
  const switchAccount = useCallback(
    async (email: string): Promise<SignInResult> => {
      const account = DEMO_ACCOUNTS.find((candidate) => candidate.email === email);
      if (!account) return { ok: false, error: "Unknown account." };
      try {
        await api("/auth/logout", { method: "POST", branch: null });
      } catch {
        // Already signed out.
      }
      endSession();
      return establish(account.email, account.password);
    },
    [establish, endSession]
  );

  /** The signed-in user's own names and username (`PATCH /me`). */
  const updateProfile = useCallback(
    async (patch: { firstName: string; lastName: string; username: string }): Promise<ActionResult> => {
      try {
        await api("/me", {
          method: "PATCH",
          body: { first_name: patch.firstName.trim(), last_name: patch.lastName.trim(), username: patch.username.trim() },
        });
        await queryClient.invalidateQueries({ queryKey: ME_KEY });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeApiError(error), fields: isApiError(error) ? error.fields : undefined };
      }
    },
    [queryClient]
  );

  /** `PUT /me/password`: the API checks the current password itself. */
  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<ActionResult> => {
    try {
      await api("/me/password", {
        method: "PUT",
        body: { current_password: currentPassword, password: newPassword, password_confirmation: newPassword },
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: describeApiError(error), fields: isApiError(error) ? error.fields : undefined };
    }
  }, []);

  return { signIn, signOut, switchAccount, updateProfile, changePassword };
}
