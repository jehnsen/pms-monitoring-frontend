"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Session, UserRole } from "@/types";
import { FLEET_CLIENT_IDS, SEED_FLEET_CLIENT, SEED_PROVIDER } from "@/lib/tenant";

/**
 * Demo session handling.
 *
 * There is no backend and therefore no real authentication: credentials are
 * compared in the browser against the fixed list below, and the "session" is a
 * plain localStorage record with no token, expiry, or server verification.
 * It gates the demo so the login screen has something to do — it is not a
 * security boundary, and anyone can bypass it from devtools. Replace this
 * module wholesale when a real identity provider goes in; the rest of the app
 * only consumes `useSession()` and the two actions.
 */

const STORAGE_KEY = "pms.session.v1";

export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  title: string;
  /** Always set. A user with no provider resolves to no scope at all. */
  providerId: string;
  /** Null for provider-side staff, who see every client beneath the provider. */
  fleetClientId: string | null;
}

/**
 * One account per role, so every permission level can be demonstrated — now on
 * both sides of the tenancy boundary. The client-side accounts are all pinned
 * to Actimed, which is the single client the seeded fleet belongs to.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  // ---------------------------------------------------------- provider side
  {
    // The shop owner. He ran the demo as Actimed's Fleet Manager before the
    // provider side existed; this is where he actually belongs.
    email: "owner@mekanikomore.ph",
    password: "demo1234",
    name: "Mike Manabat",
    role: "provider_admin",
    title: "Owner / Provider Admin",
    providerId: SEED_PROVIDER.id,
    fleetClientId: null,
  },
  {
    email: "advisor@mekanikomore.ph",
    password: "demo1234",
    name: "Divina Lacson",
    role: "service_advisor",
    title: "Service Advisor",
    providerId: SEED_PROVIDER.id,
    fleetClientId: null,
  },
  {
    email: "bay@mekanikomore.ph",
    password: "demo1234",
    name: "Arnel Pascual",
    role: "provider_technician",
    title: "Provider Technician",
    providerId: SEED_PROVIDER.id,
    fleetClientId: null,
  },
  // ------------------------------------------- client side · Actimed
  {
    email: "fleet@actimed.ph",
    password: "demo1234",
    name: "Elena Rosales",
    role: "fleet_manager",
    title: "Fleet Manager",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.actimed,
  },
  {
    email: "ops@mekanikomore.ph",
    password: "demo1234",
    name: "Marisol Bautista",
    role: "operations",
    title: "Operations Supervisor",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },
  {
    email: "tech@mekanikomore.ph",
    password: "demo1234",
    name: "Arnel Pascual",
    role: "technician",
    title: "Lead Technician",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },
  {
    email: "purchasing@mekanikomor.ph",
    password: "demo1234",
    name: "Grace Villanueva",
    role: "purchasing_officer",
    title: "Purchasing Officer",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },
  {
    email: "viewer@mekanikomore.ph",
    password: "demo1234",
    name: "Camille Ortega",
    role: "viewer",
    title: "Authorised Viewer",
    providerId: SEED_PROVIDER.id,
    fleetClientId: SEED_FLEET_CLIENT.id,
  },

  // ------------------------------- client side · the other fleet clients
  // One account each, so isolation can be seen rather than asserted: signing
  // in here shows a different fleet entirely, under the same provider.
  {
    email: "fleet@northwind.ph",
    password: "demo1234",
    name: "Ruben Salcedo",
    role: "fleet_manager",
    title: "Fleet Manager",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.northwind,
  },
  {
    email: "operations@sagrada.ph",
    password: "demo1234",
    name: "Imelda Cortez",
    role: "fleet_manager",
    title: "Operations Director",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.sagrada,
  },
  {
    // Bayani is suspended. This account resolves to no scope at all — it is
    // here so the fail-closed path is demonstrable, not just tested.
    email: "yard@bayanicon.ph",
    password: "demo1234",
    name: "Andres Malolos",
    role: "fleet_manager",
    title: "Yard Manager (suspended account)",
    providerId: SEED_PROVIDER.id,
    fleetClientId: FLEET_CLIENT_IDS.bayani,
  },
];

/** The one place a `DemoAccount` becomes a `Session`, so tenancy is never dropped. */
function sessionFromAccount(account: DemoAccount): Session {
  return {
    email: account.email,
    name: account.name,
    role: account.role,
    title: account.title,
    signedInAt: new Date().toISOString(),
    providerId: account.providerId,
    fleetClientId: account.fleetClientId,
  };
}

/**
 * Re-exported for the many call sites that already import it from here; the
 * definition lives in `@/types` so `lib/tenancy.ts` can type a session without
 * importing this module.
 */
export type { Session };

/**
 * `undefined` means "not hydrated yet" and is what the server renders;
 * `null` means "hydrated, and nobody is signed in". The guard has to tell those
 * two apart or it would bounce every first paint to the login screen.
 */
type Snapshot = Session | null | undefined;

let session: Snapshot = undefined;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.email) return null;

    // TENANCY BACKFILL. A session written before tenancy existed carries no
    // provider, which would now resolve to no scope and lock the user out of
    // their own data. Prefer the account's current tenancy, falling back to the
    // seeded provider/client that all pre-tenancy data belongs to.
    const account = DEMO_ACCOUNTS.find((a) => a.email === parsed.email);
    return {
      ...parsed,
      providerId: parsed.providerId ?? account?.providerId ?? SEED_PROVIDER.id,
      fleetClientId:
        parsed.fleetClientId ??
        (account ? account.fleetClientId : SEED_FLEET_CLIENT.id),
    };
  } catch {
    return null;
  }
}

function ensureHydrated(): Snapshot {
  if (!hydrated && typeof window !== "undefined") {
    session = read();
    hydrated = true;
  }
  return session;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return ensureHydrated();
}

function getServerSnapshot(): Snapshot {
  return undefined;
}

export function useSession() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { session: snapshot ?? null, ready: snapshot !== undefined };
}

export type SignInResult = { ok: true } | { ok: false; error: string };

export function useAuthActions() {
  const signIn = useCallback((email: string, password: string): SignInResult => {
    const match = DEMO_ACCOUNTS.find(
      (account) =>
        account.email.toLowerCase() === email.trim().toLowerCase() &&
        account.password === password
    );

    if (!match) {
      return {
        ok: false,
        error: "That email and password combination isn't recognised.",
      };
    }

    const next = sessionFromAccount(match);

    session = next;
    hydrated = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode — the session just won't survive a reload.
    }
    emit();
    return { ok: true };
  }, []);

  /**
   * Demo convenience: switches the active account without a password prompt, so
   * the permission model can be exercised from the access page. It exists
   * because there is no real identity provider — delete it along with
   * `DEMO_ACCOUNTS` when one arrives.
   */
  const switchAccount = useCallback((email: string) => {
    const match = DEMO_ACCOUNTS.find((account) => account.email === email);
    if (!match) return;

    const next = sessionFromAccount(match);

    session = next;
    hydrated = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode — the switch just won't survive a reload.
    }
    emit();
  }, []);

  const signOut = useCallback(() => {
    session = null;
    hydrated = true;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    emit();
  }, []);

  return { signIn, signOut, switchAccount };
}
