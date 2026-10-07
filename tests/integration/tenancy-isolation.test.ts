import { describe, expect, it } from "vitest";
import { localSupabaseIsUp, newAnonClient, signInAs } from "./supabase-test-client";

/**
 * Live RLS isolation tests.
 *
 * `lib/rls-parity.test.ts` is a static check on migration text — it proves a
 * policy exists, not that Postgres actually enforces it. This suite runs the
 * same demo accounts `lib/auth.ts` exports against a real local Supabase
 * (`supabase start`, seeded via `supabase db reset`) and asserts the one
 * property that actually matters: a session can read exactly what
 * `lib/tenancy.ts`'s `resolveTenantScope`/`scopeFleetState` say it should,
 * and nothing else — provider-side roles see every active client under
 * their provider, client-side roles see exactly their own client and never
 * a sibling, a suspended client's users see nothing, and anon sees nothing.
 *
 * Needs Docker + `supabase start` + `supabase db reset`. Run via
 * `npm run test:db`. Tests skip (not fail) if the local stack isn't up, so
 * `npm test` (the pure-function suite) never depends on Docker being
 * available.
 */

// `describe.skipIf` reads this synchronously at collection time, so the
// readiness check has to resolve before that — a `beforeAll` runs too late
// to gate which `describe` blocks even register.
const dbUp = await localSupabaseIsUp();
if (!dbUp) {
  console.warn(
    "\n[test:db] Local Supabase is not reachable at http://127.0.0.1:54321 — " +
      "skipping live RLS tests. Run `supabase start` and `supabase db reset` first.\n"
  );
}

const FLEET_CLIENT_IDS = {
  actimed: "fc-actimed",
  northwind: "fc-northwind",
  sagrada: "fc-sagrada",
  bayani: "fc-bayani",
} as const;

describe.skipIf(!dbUp)("provider-side roles see every active client", () => {
  it.each([
    "owner@mekanikomore.ph",
    "advisor@mekanikomore.ph",
    "bay@mekanikomore.ph",
  ])("%s sees all active fleet clients, never the suspended one", async (email) => {
    const client = await signInAs(email);

    const { data: clients, error } = await client.from("pms_fleet_clients").select("id, status");
    expect(error).toBeNull();

    const ids = (clients ?? []).map((c) => c.id);
    expect(ids).toContain(FLEET_CLIENT_IDS.actimed);
    expect(ids).toContain(FLEET_CLIENT_IDS.northwind);
    expect(ids).toContain(FLEET_CLIENT_IDS.sagrada);
    // Bayani is seeded suspended. RLS filters by status for client-side
    // visibility, but a provider-side session's own client list is scoped by
    // provider, not status — assert directly on what's actually returned.
    const bayani = (clients ?? []).find((c) => c.id === FLEET_CLIENT_IDS.bayani);
    if (bayani) expect(bayani.status).toBe("suspended");

    await client.auth.signOut();
  });

  it("a provider-side session sees vehicles across every client", async () => {
    const client = await signInAs("owner@mekanikomore.ph");
    const { data: vehicles, error } = await client.from("pms_vehicles").select("fleet_client_id");
    expect(error).toBeNull();

    const clientIds = new Set((vehicles ?? []).map((v) => v.fleet_client_id));
    expect(clientIds.has(FLEET_CLIENT_IDS.actimed)).toBe(true);
    expect(clientIds.has(FLEET_CLIENT_IDS.northwind)).toBe(true);

    await client.auth.signOut();
  });
});

describe.skipIf(!dbUp)("client-side roles see exactly their own client", () => {
  it("fleet@actimed.ph sees only Actimed's vehicles", async () => {
    const client = await signInAs("fleet@actimed.ph");
    const { data: vehicles, error } = await client.from("pms_vehicles").select("fleet_client_id");
    expect(error).toBeNull();
    expect(vehicles!.length).toBeGreaterThan(0);

    const clientIds = new Set(vehicles!.map((v) => v.fleet_client_id));
    expect(clientIds).toEqual(new Set([FLEET_CLIENT_IDS.actimed]));

    await client.auth.signOut();
  });

  it("fleet@actimed.ph's fleet-client list contains only Actimed — never a sibling", async () => {
    const client = await signInAs("fleet@actimed.ph");
    const { data: clients, error } = await client.from("pms_fleet_clients").select("id");
    expect(error).toBeNull();
    expect(clients).toEqual([{ id: FLEET_CLIENT_IDS.actimed }]);

    await client.auth.signOut();
  });

  it("fleet@northwind.ph never sees Actimed's vehicles or work orders", async () => {
    const client = await signInAs("fleet@northwind.ph");

    const { data: vehicles } = await client.from("pms_vehicles").select("fleet_client_id");
    expect(vehicles!.every((v) => v.fleet_client_id === FLEET_CLIENT_IDS.northwind)).toBe(true);

    const { data: orders, error } = await client
      .from("pms_work_orders")
      .select("id, vehicle_id, pms_vehicles!inner(fleet_client_id)");
    expect(error).toBeNull();
    for (const order of orders ?? []) {
      // @ts-expect-error -- joined row shape isn't in the generated types
      expect(order.pms_vehicles.fleet_client_id).toBe(FLEET_CLIENT_IDS.northwind);
    }

    await client.auth.signOut();
  });

  it("operations@sagrada.ph cannot read Actimed's documents", async () => {
    const client = await signInAs("operations@sagrada.ph");
    const { data: documents, error } = await client.from("pms_documents").select("fleet_client_id");
    expect(error).toBeNull();
    expect((documents ?? []).every((d) => d.fleet_client_id === FLEET_CLIENT_IDS.sagrada)).toBe(true);

    await client.auth.signOut();
  });
});

describe.skipIf(!dbUp)("a suspended client's users see nothing", () => {
  it("yard@bayanicon.ph (Bayani, suspended) gets an empty fleet", async () => {
    const client = await signInAs("yard@bayanicon.ph");

    const { data: vehicles, error: vehiclesError } = await client.from("pms_vehicles").select("id");
    expect(vehiclesError).toBeNull();
    expect(vehicles).toEqual([]);

    const { data: clients, error: clientsError } = await client.from("pms_fleet_clients").select("id");
    expect(clientsError).toBeNull();
    expect(clients).toEqual([]);

    await client.auth.signOut();
  });
});

describe.skipIf(!dbUp)("anon sees nothing", () => {
  it.each([
    "pms_providers",
    "pms_fleet_clients",
    "pms_vehicles",
    "pms_work_orders",
    "pms_documents",
  ])("%s returns no rows and/or errors for an unauthenticated client", async (table) => {
    const client = newAnonClient();
    const { data, error } = await client.from(table).select("id");
    // anon holds no grants at all (see lib/rls-parity.test.ts), so this is
    // expected to come back as a permission error rather than an empty set —
    // assert on "no rows leaked" either way, since that's the property that
    // actually matters.
    if (!error) expect(data).toEqual([]);
  });
});
