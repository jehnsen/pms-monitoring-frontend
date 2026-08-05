"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { UserRole } from "@/types";

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
}

/** One account per role, so every permission level can be demonstrated. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "fleet@mekanikomore.ph",
    password: "demo1234",
    name: "Mike Manabat",
    role: "fleet_manager",
    title: "Fleet Manager",
  },
  {
    email: "ops@mekanikomore.ph",
    password: "demo1234",
    name: "Marisol Bautista",
    role: "operations",
    title: "Operations Supervisor",
  },
  {
    email: "tech@mekanikomore.ph",
    password: "demo1234",
    name: "Arnel Pascual",
    role: "technician",
    title: "Lead Technician",
  },
  {
    email: "viewer@mekanikomore.ph",
    password: "demo1234",
    name: "Camille Ortega",
    role: "viewer",
    title: "Authorised Viewer",
  },
];

export interface Session {
  email: string;
  name: string;
  role: UserRole;
  /** Job title for display; `role` is what permissions key off. */
  title: string;
  signedInAt: string;
}

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
    return parsed?.email ? parsed : null;
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

    const next: Session = {
      email: match.email,
      name: match.name,
      role: match.role,
      title: match.title,
      signedInAt: new Date().toISOString(),
    };

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

    const next: Session = {
      email: match.email,
      name: match.name,
      role: match.role,
      title: match.title,
      signedInAt: new Date().toISOString(),
    };

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
