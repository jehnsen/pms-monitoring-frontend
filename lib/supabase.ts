"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase browser client.
 *
 * This database is **shared with an unrelated application**, so everything this
 * app owns is prefixed `pms_`. Never query an unprefixed table from here.
 *
 * Only the anon key is used. Row Level Security is what constrains which rows
 * a session can see (see `supabase/migrations/0001_pms_schema.sql`), so the key
 * being public is expected — it grants nothing on its own, and `anon` has no
 * table grants at all. The service_role key must never reach the browser.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Whether the app is configured to talk to Supabase at all. Checked before
 * every query so a missing or blank env var surfaces as one clear message
 * rather than a wall of failed requests.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/**
 * The shared client instance, or null when unconfigured.
 *
 * Created lazily and memoised: a module-level `createClient` would run during
 * the server render pass, where `window` does not exist and the auth storage
 * adapter has nothing to bind to.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (client) return client;

  client = createClient(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The session lives in localStorage under this key. Namespaced because
      // the shared project may host another app's client on the same origin.
      storageKey: "pms.supabase.auth",
      detectSessionInUrl: false,
    },
  });

  return client;
}

/**
 * Throwing accessor for the many call sites that cannot proceed without a
 * client and would otherwise each need a null check.
 */
export function requireSupabase(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env, then restart the dev server."
    );
  }
  return supabase;
}

/**
 * Normalises a PostgREST error into something a user can act on.
 *
 * RLS denials are the interesting case: a blocked write comes back as a
 * violation rather than a permission error, and "new row violates row-level
 * security policy" means the record was outside the session's tenant scope —
 * the fail-closed path, not a bug.
 */
export function describeError(error: unknown): string {
  if (!error) return "";
  const err = error as { message?: string; code?: string; details?: string };

  if (err.code === "42501" || err.message?.includes("row-level security")) {
    return "That record isn't yours to change.";
  }
  if (err.code === "23505") {
    return "That record already exists.";
  }
  if (err.code === "PGRST301" || err.message?.includes("JWT")) {
    return "Your session has expired. Sign in again.";
  }
  return err.message || "Something went wrong talking to the database.";
}
