import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Local Supabase connection details.
 *
 * `supabase start`'s anon key is a fixed demo JWT (the CLI ships the same
 * `JWT_SECRET` for every project unless overridden), so these are stable
 * across machines — no `.env` needed to run `npm run test:db` after
 * `supabase start`. Override via env vars if a project has customised them.
 */
const API_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const DEMO_PASSWORD = "demo1234";

/** A fresh, unauthenticated client — each test gets its own so sessions never leak between cases. */
export function newAnonClient(): SupabaseClient {
  return createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs in as a demo account and returns the authenticated client. */
export async function signInAs(email: string, password = DEMO_PASSWORD): Promise<SupabaseClient> {
  const client = newAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `Could not sign in as ${email}: ${error.message}. Is "supabase start" running with ` +
        `the seed migrations applied ("supabase db reset")?`
    );
  }
  return client;
}

/**
 * Whether a local Supabase actually answers. Tests use this to skip (not
 * fail) when Docker/the local stack isn't up, rather than reporting a false
 * red for an environment problem unrelated to the code under test.
 */
export async function localSupabaseIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}
