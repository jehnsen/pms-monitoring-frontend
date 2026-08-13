import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types";

/**
 * Creates a user: a real Supabase Auth account plus its `pms_profiles` row,
 * in one request.
 *
 * This has to run server-side because it needs `auth.admin.createUser`,
 * which only works with the `service_role` key — a key that must never
 * reach the browser (see `lib/supabase.ts`). The browser instead sends the
 * caller's own access token, and every permission decision below is made
 * from what THAT token resolves to server-side, never from anything the
 * request body claims about itself.
 *
 * If the profile insert fails after the auth user was created, the auth
 * user is deleted rather than left behind — an auth user with no
 * `pms_profiles` row is exactly the orphaned-account bug that motivated
 * building this endpoint in the first place (see `lib/auth.ts`'s
 * `loadSession`, which fails closed on that state).
 *
 * `lib/rbac.ts` and `lib/tenancy.ts` are `"use client"` modules, so they
 * can't be imported into a Route Handler — Next fails the build on it. The
 * handful of constants this route needs are mirrored below instead; keep
 * them in step with `ROLE_CAPABILITIES` / `PROVIDER_ROLES` / `CLIENT_ROLES`
 * in `lib/rbac.ts` by hand.
 */

const PROVIDER_ROLES: UserRole[] = ["provider_admin", "service_advisor", "provider_technician"];
const CLIENT_ROLES: UserRole[] = [
  "fleet_manager",
  "operations",
  "technician",
  "purchasing_officer",
  "viewer",
];
const ALL_ROLES: UserRole[] = [...PROVIDER_ROLES, ...CLIENT_ROLES];
/** Mirrors `ROLE_CAPABILITIES`: only the provider admin holds `access:manage`. */
const ROLES_WITH_ACCESS_MANAGE: UserRole[] = ["provider_admin"];

function isProviderRole(role: UserRole): boolean {
  return (PROVIDER_ROLES as string[]).includes(role);
}

function serverClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

export async function POST(request: NextRequest) {
  const env = serverClients();
  if (!env) {
    return NextResponse.json(
      { error: "Supabase is not configured on the server." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  // Identifies the caller from their own token — RLS still applies on this
  // client, so it can only ever read the caller's own profile row.
  const callerClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: callerAuth, error: callerAuthError } =
    await callerClient.auth.getUser(accessToken);
  if (callerAuthError || !callerAuth.user) {
    return NextResponse.json(
      { error: "Your session has expired. Sign in again." },
      { status: 401 }
    );
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("pms_profiles")
    .select("role, provider_id, fleet_client_id")
    .eq("id", callerAuth.user.id)
    .maybeSingle();

  if (callerProfileError || !callerProfile) {
    return NextResponse.json(
      { error: "Your account has no tenant scope." },
      { status: 403 }
    );
  }

  const callerRole = callerProfile.role as UserRole;
  if (!ROLES_WITH_ACCESS_MANAGE.includes(callerRole)) {
    return NextResponse.json(
      { error: "You don't have permission to manage access." },
      { status: 403 }
    );
  }

  let body: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    role?: string;
    title?: string;
    fleetClientId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const username = body.username?.trim() ?? "";
  const title = body.title?.trim() ?? "";
  const role = body.role as UserRole;

  if (!email || !password || !firstName || !lastName || !username || !role) {
    return NextResponse.json(
      { error: "Email, password, first name, last name, username, and role are all required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password needs to be at least 8 characters." },
      { status: 400 }
    );
  }
  if (!ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: "Unrecognised role." }, { status: 400 });
  }

  // A client-side caller (fleet_manager) can only add people to their own
  // client, and never a provider-side role — that would be a privilege
  // escalation across the tenancy boundary this whole app is built around.
  const callerIsProviderSide = isProviderRole(callerRole);
  if (!callerIsProviderSide && (isProviderRole(role) || body.fleetClientId !== callerProfile.fleet_client_id)) {
    return NextResponse.json(
      { error: "You can only add people to your own fleet." },
      { status: 403 }
    );
  }

  const providerId = callerProfile.provider_id as string | null;
  if (!providerId) {
    return NextResponse.json({ error: "Your account has no provider." }, { status: 403 });
  }

  let fleetClientId: string | null = null;
  const serviceClient = createClient(env.url, env.serviceKey);

  if (!isProviderRole(role)) {
    fleetClientId = callerIsProviderSide
      ? body.fleetClientId ?? null
      : callerProfile.fleet_client_id;

    if (!fleetClientId) {
      return NextResponse.json(
        { error: "Choose which fleet client this person belongs to." },
        { status: 400 }
      );
    }

    // Bypasses RLS (service key), so the client's provider ownership is
    // checked by hand rather than trusted from the request.
    const { data: client, error: clientError } = await serviceClient
      .from("pms_fleet_clients")
      .select("id, provider_id, status")
      .eq("id", fleetClientId)
      .maybeSingle();

    if (clientError || !client || client.provider_id !== providerId) {
      return NextResponse.json(
        { error: "That fleet client doesn't belong to your provider." },
        { status: 400 }
      );
    }
    if (client.status === "suspended") {
      return NextResponse.json(
        { error: "That fleet client is suspended — a new account there would resolve to no scope." },
        { status: 400 }
      );
    }
  } else if (!callerIsProviderSide) {
    return NextResponse.json(
      { error: "Only provider staff can add provider-side accounts." },
      { status: 403 }
    );
  }

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "";
    return NextResponse.json(
      {
        error: message.toLowerCase().includes("already")
          ? "An account with that email already exists."
          : message || "Could not create the account.",
      },
      { status: 400 }
    );
  }

  const { error: profileError } = await serviceClient.from("pms_profiles").insert({
    id: created.user.id,
    email,
    name: `${firstName} ${lastName}`,
    first_name: firstName,
    last_name: lastName,
    username,
    role,
    title,
    provider_id: providerId,
    fleet_client_id: fleetClientId,
  });

  if (profileError) {
    await serviceClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      {
        error:
          (profileError as { code?: string }).code === "23505"
            ? "That username is already taken."
            : profileError.message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
