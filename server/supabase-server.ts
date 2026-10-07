import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { VerifiedUser } from "@/server/commands/context";

/**
 * A Supabase client bound to the request's cookies.
 *
 * Used only to *identify* the caller. Writes never go through it: commands
 * write over the transactional connection in `server/db.ts`.
 */
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // middleware.ts refreshes the session on every request instead.
        }
      },
    },
  });
}

/**
 * The signed-in user, verified against GoTrue.
 *
 * `auth.getUser()` makes a round trip to the auth server, which checks the
 * token's signature and that the session has not been revoked. Decoding the
 * cookie's JWT locally (or trusting `getSession()`) would accept a token that
 * was forged or already signed out — never use either to authorise a write.
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
