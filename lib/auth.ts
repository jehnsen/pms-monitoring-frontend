"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Session, UserRole } from "@/types";
import { FLEET_CLIENT_IDS, SEED_FLEET_CLIENT, SEED_PROVIDER } from "@/lib/tenant";
import { describeError, getSupabase } from "@/lib/supabase";

/**
 * Authentication, backed by Supabase Auth.
 *
 * This module used to compare credentials against a hardcoded list in the
 * browser, which meant the "session" was a localStorage record anyone could
 * forge from devtools. It is now a real GoTrue session, and — more importantly
 * — the tenancy it carries comes from `pms_profiles`, the same table the
 * database's RLS policies read. A user cannot claim a provider or fleet client
 * they were not granted, because the claim is never theirs to make: the browser
 * reports what the profile says, and the database independently enforces it.
 *
 * `Session` is unchanged, so every consumer of `useSession()` keeps working.
 */

/* --------------------------------------------------------- demo directory */

/**
 * The demo roster.
 *
 * These are now **descriptions of accounts that exist in Supabase Auth**
 * (created by `supabase/migrations/0002_pms_auth_users.sql`), not credentials
 * checked in the browser. The list survives because the access page renders it
 * as a personnel directory and the login screen offers one-click fill; sign-in
 * itself goes through Supabase and fails if the account is absent.
 *
 * The shared password is a demo convenience — see the security note in 0002.
 */
export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  title: string;
  providerId: string;
  /** Null for provider-side staff, who see every client beneath the provider. */
  fleetClientId: string | null;
}

const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  // ---------------------------------------------------------- provider side
  {
    email: "owner@mekanikomore.ph",
    password: DEMO_PASSWORD,
    name: "Mike Manabat",
    role: "provider_admin",
    title: "Owner / Provider Admin",
    providerId: SEED_PROVIDER.id,
    fleetClientId: null,
  },
  {
    email: "advisor@mekanikomore.ph",
    password: DEMO_PASSWORD,
    name: "Divina Lacson",
    role: "service_advisor",
    title: "Service Advisor",
    providerId: SEED_PROVIDER.id,
    fleetClientId: null,
  },
  {
    email: "bay@mekanikomore.ph",
    password: DEMO_PASSWORD,
    name: "Arnel Pascual",
    role: "provider_technician",
    title: "Provider Technician",
    providerId: SEED_PROVIDER.id,
    fleetClientId: null,
  },
  // ------------------------------------------- client side · Actimed
  {
    email: "fleet@actimed.ph",
    password: DEMO_PASSWORD,
    name: "Elena Rosales",
    role: "fleet_manager",
    title: "Fleet Manager",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.actimed,
  },
  {
    email: "ops@mekanikomore.ph",
    password: DEMO_PASSWORD,
    name: "Marisol Bautista",
    role: "operations",
    title: "Operations Supervisor",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },
  {
    email: "tech@mekanikomore.ph",
    password: DEMO_PASSWORD,
    name: "Arnel Pascual",
    role: "technician",
    title: "Lead Technician",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },
  {
    email: "purchasing@mekanikomor.ph",
    password: DEMO_PASSWORD,
    name: "Grace Villanueva",
    role: "purchasing_officer",
    title: "Purchasing Officer",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },
  {
    email: "viewer@mekanikomore.ph",
    password: DEMO_PASSWORD,
    name: "Camille Ortega",
    role: "viewer",
    title: "Authorised Viewer",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },
  // ------------------------------- client side · the other fleet clients
  {
    email: "fleet@northwind.ph",
    password: DEMO_PASSWORD,
    name: "Ruben Salcedo",
    role: "fleet_manager",
    title: "Fleet Manager",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.northwind,
  },
  {
    email: "operations@sagrada.ph",
    password: DEMO_PASSWORD,
    name: "Imelda Cortez",
    role: "fleet_manager",
    title: "Operations Director",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.sagrada,
  },
  {
    // Bayani is suspended, so this account resolves to no scope — the
    // fail-closed path, now enforced by RLS as well as by the client.
    email: "yard@bayanicon.ph",
    password: DEMO_PASSWORD,
    name: "Andres Malolos",
    role: "fleet_manager",
    title: "Yard Manager (suspended account)",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.bayani,
  },
];

export type { Session };

/* ------------------------------------------------------------ session store */

/**
 * `undefined` means "not resolved yet" and is what the server renders; `null`
 * means "resolved, nobody signed in". The guard has to tell those apart or it
 * bounces every first paint to the login screen.
 */
type Snapshot = Session | null | undefined;

let session: Snapshot = undefined;
let loading = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setSession(next: Session | null) {
  session = next;
  emit();
}

/**
 * Builds the app's `Session` from a Supabase user plus its profile row.
 *
 * The profile is the authority on role and tenancy. If it is missing, the user
 * authenticated but has no place in the tenancy tree — that resolves to no
 * scope at all rather than to a guessed default, which is the same fail-closed
 * rule `explainTenantScope` applies.
 */
async function loadSession(userId: string, email: string): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("pms_profiles")
    .select("email, name, role, title, provider_id, fleet_client_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    console.warn(
      `[auth] no pms_profiles row for ${email}` +
        (error ? ` (${describeError(error)})` : "") +
        " — signed in with no tenant scope."
    );
    return null;
  }

  return {
    uid: userId,
    email: data.email ?? email,
    name: data.name ?? email,
    role: data.role as UserRole,
    title: data.title ?? "",
    signedInAt: new Date().toISOString(),
    providerId: data.provider_id ?? null,
    fleetClientId: data.fleet_client_id ?? null,
  };
}

/**
 * Resolves the current session once, then keeps it in step with Supabase's own
 * auth events (token refresh, sign-out, or a sign-out in another tab).
 */
function ensureSubscribed() {
  if (loading) return;
  loading = true;

  const supabase = getSupabase();
  if (!supabase) {
    // Unconfigured: resolve to "nobody signed in" so the app renders the login
    // screen rather than hanging on a skeleton forever.
    setSession(null);
    return;
  }

  supabase.auth
    .getSession()
    .then(async ({ data }) => {
      const user = data.session?.user;
      setSession(user ? await loadSession(user.id, user.email ?? "") : null);
    })
    .catch(() => setSession(null));

  supabase.auth.onAuthStateChange(async (event, next) => {
    if (event === "SIGNED_OUT" || !next?.user) {
      setSession(null);
      return;
    }
    // TOKEN_REFRESHED fires often and carries no tenancy change; re-reading the
    // profile on every one would be a query per refresh for no benefit.
    if (event === "SIGNED_IN" || event === "USER_UPDATED" || session === undefined) {
      setSession(await loadSession(next.user.id, next.user.email ?? ""));
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return session;
}

function getServerSnapshot(): Snapshot {
  return undefined;
}

export function useSession() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Kicks off resolution on first mount. In an effect rather than inline so the
  // render pass stays pure.
  useEffect(() => {
    ensureSubscribed();
  }, []);

  return { session: snapshot ?? null, ready: snapshot !== undefined };
}

export type SignInResult = { ok: true } | { ok: false; error: string };

export function useAuthActions() {
  /**
   * Signs in against Supabase Auth. Now asynchronous — it is a real network
   * call rather than a comparison against a list in memory.
   */
  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const supabase = getSupabase();
      if (!supabase) {
        return {
          ok: false,
          error:
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
            "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env, then restart the dev server.",
        };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.user) {
        return {
          ok: false,
          error:
            error?.message === "Invalid login credentials"
              ? "That email and password combination isn't recognised."
              : describeError(error) || "Sign-in failed.",
        };
      }

      // Resolved eagerly so the caller can route on the new role without
      // waiting for the auth-state listener to fire.
      setSession(await loadSession(data.user.id, data.user.email ?? email));
      return { ok: true };
    },
    []
  );

  /**
   * Demo convenience: switches the active account from the access page.
   *
   * This is a genuine sign-in now — it has to be, because the database only
   * honours a real JWT — so it signs the current user out and back in as the
   * target account using the shared demo password. Delete it along with
   * `DEMO_ACCOUNTS` once real user management exists.
   */
  const switchAccount = useCallback(
    async (email: string): Promise<SignInResult> => {
      const account = DEMO_ACCOUNTS.find((candidate) => candidate.email === email);
      if (!account) return { ok: false, error: "Unknown account." };

      const supabase = getSupabase();
      if (!supabase) return { ok: false, error: "Supabase is not configured." };

      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });

      if (error || !data.user) {
        setSession(null);
        return { ok: false, error: describeError(error) || "Switch failed." };
      }

      setSession(await loadSession(data.user.id, data.user.email ?? account.email));
      return { ok: true };
    },
    []
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }, []);

  return { signIn, signOut, switchAccount };
}
