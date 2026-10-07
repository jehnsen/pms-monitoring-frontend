import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import type { Db, Tx } from "@/server/db-port";
import { closeDb, pgDb } from "@/server/db";
import type { CommandDeps, VerifiedUser } from "@/server/commands/context";
import {
  close,
  createWorkOrder,
  decideLines,
  markCollected,
  schedule,
  start,
} from "@/server/commands/work-orders";
import { localSupabaseIsUp, signInAs } from "./supabase-test-client";

/**
 * The server write channel, against a real local Supabase (migration 0010).
 *
 *   (a) the browser — role `authenticated` through PostgREST — can no longer
 *       write the work-order tables;
 *   (b) server writes, made as `pms_server` with the user's claims, still pass
 *       through RLS tenancy checks;
 *   (c) a command is one transaction: a failure after its first insert leaves
 *       nothing behind.
 *
 * Commands are called directly with a VerifiedUser here; in the app the
 * server action supplies one from the cookie session via GoTrue.
 */

const dbUp = await localSupabaseIsUp();
if (!dbUp) {
  console.warn("\n[test:db] Local Supabase is not reachable — skipping write-channel tests.\n");
}

// A superuser-equivalent connection for setup assertions and cleanup only —
// it bypasses RLS, which is exactly why the code under test never uses it.
const admin = dbUp ? postgres(process.env.DATABASE_URL as string, { prepare: false, max: 2 }) : null;

const TAG = `itest-${Date.now().toString(36)}`;
const deps: CommandDeps = { db: pgDb };

async function userByEmail(email: string): Promise<VerifiedUser> {
  const [row] = await admin!`select id from auth.users where email = ${email}`;
  return { id: String(row.id), email };
}

async function ordersTitled(title: string) {
  return admin!`select id from pms_work_orders where title = ${title}`;
}

const brakeLine = {
  description: "Brake pads",
  category: "brakes",
  quantity: 4,
  unitPartRate: 2_000,
  labourHours: 2,
  labourRate: 650,
  urgency: "safety_critical",
  partsSource: "supplier_provided",
  photoUrls: [],
};

let vehicleBefore: { task_state: unknown; odometer: number; odometer_read_at: string; status: string } | null =
  null;

afterAll(async () => {
  if (!admin) return;
  // Children cascade. pms_server can never delete a work order; the test
  // harness's own connection can.
  await admin`delete from pms_work_orders where title like ${`${TAG}%`}`;
  if (vehicleBefore) {
    await admin`
      update pms_vehicles
         set task_state = ${admin.json(vehicleBefore.task_state as postgres.JSONValue)},
             odometer = ${vehicleBefore.odometer},
             odometer_read_at = ${vehicleBefore.odometer_read_at},
             status = ${vehicleBefore.status}
       where id = 'veh-001'`;
  }
  await admin.end();
  await closeDb();
});

describe.skipIf(!dbUp)("(a) the browser role cannot write work-order tables", () => {
  it("rejects INSERT and UPDATE on pms_work_orders from PostgREST", async () => {
    const browser = await signInAs("owner@mekanikomore.ph");

    const insert = await browser.from("pms_work_orders").insert({
      id: `${TAG}-browser`,
      reference: "",
      vehicle_id: "veh-001",
      title: `${TAG}-browser`,
      type: "corrective",
      status: "draft",
      priority: "low",
      opened_on: "2026-10-07",
    });
    expect(insert.error?.code).toBe("42501");

    const [existing] = await admin!`select id from pms_work_orders where vehicle_id = 'veh-001' limit 1`;
    const update = await browser
      .from("pms_work_orders")
      .update({ title: "tampered" })
      .eq("id", existing.id);
    expect(update.error?.code).toBe("42501");

    await browser.auth.signOut();
  });

  it.each(["pms_work_order_lines", "pms_work_order_events", "pms_approval_log", "pms_work_order_tasks"])(
    "rejects INSERT on %s from PostgREST",
    async (table) => {
      const browser = await signInAs("owner@mekanikomore.ph");
      const { error } = await browser.from(table).insert({ work_order_id: "wo-0208" });
      expect(error?.code).toBe("42501");
      await browser.auth.signOut();
    }
  );

  it("PostgREST's login role cannot assume pms_server", async () => {
    const [row] = await admin!`select pg_has_role('authenticator', 'pms_server', 'member') as member`;
    expect(row.member).toBe(false);
  });
});

describe.skipIf(!dbUp)("(b) server writes still pass through RLS", () => {
  it("a client-side user cannot raise an order on a sibling client's vehicle via the command", async () => {
    const northwind = await userByEmail("fleet@northwind.ph");
    const title = `${TAG}-sibling`;

    const result = await createWorkOrder(deps, northwind, {
      vehicleId: "veh-001", // Actimed's
      title,
      type: "corrective",
      lines: [brakeLine],
    });

    expect(result).toMatchObject({ ok: false, code: "out_of_scope" });
    expect(await ordersTitled(title)).toHaveLength(0);
  });

  it("RLS rejects the same write even if it bypasses the command's own scope check", async () => {
    const northwind = await userByEmail("fleet@northwind.ph");

    const attempt = pgDb.withUserTx(northwind, async (tx) => {
      const visible = await tx.select("pms_vehicles");
      expect(new Set(visible.map((v) => v.fleet_client_id))).toEqual(new Set(["fc-northwind"]));
      await tx.insert("pms_work_orders", {
        id: `${TAG}-raw`,
        reference: "",
        vehicle_id: "veh-001",
        title: `${TAG}-raw`,
        type: "corrective",
        status: "draft",
        priority: "low",
        opened_on: "2026-10-07",
      });
    });

    await expect(attempt).rejects.toMatchObject({ code: "42501" });
    expect(await ordersTitled(`${TAG}-raw`)).toHaveLength(0);
  });

  it("pms_server cannot rewrite the append-only history", async () => {
    const owner = await userByEmail("owner@mekanikomore.ph");
    const attempt = pgDb.withUserTx(owner, (tx) =>
      tx.update("pms_work_order_events", { work_order_id: "wo-0208" }, { actor: "tampered" })
    );
    await expect(attempt).rejects.toMatchObject({ code: "42501" });
  });
});

describe.skipIf(!dbUp)("(c) a command is one transaction", () => {
  it("a failure after the order row is inserted leaves no partial rows", async () => {
    const owner = await userByEmail("owner@mekanikomore.ph");
    const title = `${TAG}-atomic`;
    const writes: string[] = [];

    // The real database, with a fault injected after the first insert.
    const faulty: Db = {
      withUserTx: (user, fn) =>
        pgDb.withUserTx(user, (tx) => {
          const wrapped: Tx = {
            ...tx,
            insert: async (table, rows) => {
              if (table === "pms_work_order_lines") {
                throw new Error("injected failure after the work order row was written");
              }
              await tx.insert(table, rows);
              writes.push(table);
            },
          };
          return fn(wrapped);
        }),
    };

    const result = await createWorkOrder({ db: faulty }, owner, {
      vehicleId: "veh-001",
      title,
      type: "corrective",
      lines: [brakeLine],
    });

    expect(writes).toEqual(["pms_work_orders"]); // the order row really was written…
    expect(result.ok).toBe(false);
    expect(await ordersTitled(title)).toHaveLength(0); // …and rolled back with the rest
  });
});

describe.skipIf(!dbUp)("the lifecycle, end to end on Postgres", () => {
  it("create → approve → schedule → start → close → collect", async () => {
    const owner = await userByEmail("owner@mekanikomore.ph");
    const fleetManager = await userByEmail("fleet@actimed.ph");
    const title = `${TAG}-lifecycle`;
    [vehicleBefore] = (await admin!`
      select task_state, odometer, odometer_read_at::text, status::text
        from pms_vehicles where id = 'veh-001'`) as unknown as (typeof vehicleBefore)[];

    // A tampered total and a client-chosen id ride along; neither survives.
    const created = await createWorkOrder(deps, owner, {
      id: "client-chosen",
      vehicleId: "veh-001",
      title,
      type: "corrective",
      priority: "high",
      technician: "Lito Sarmiento",
      taskIds: ["oil-filter"],
      lines: [{ ...brakeLine, partCost: 1, labourCost: 1 }],
    });
    if (!created.ok) throw new Error(created.message);
    const orderId = created.data.order.id;
    expect(orderId).not.toBe("client-chosen");
    expect(created.data.order.status).toBe("pending_approval");
    expect(created.data.order.reference).toMatch(/^WO-\d{4}-\d{4,}$/);

    const [line] = await admin!`
      select part_cost::float as part_cost, labour_cost::float as labour_cost
        from pms_work_order_lines where work_order_id = ${orderId}`;
    expect(line).toEqual({ part_cost: 8_000, labour_cost: 1_300 });

    const lineId = created.data.order.lines[0].id;
    const approved = await decideLines(deps, fleetManager, {
      orderId,
      decisions: [{ lineId, decision: "approved" }],
    });
    if (!approved.ok) throw new Error(approved.message);
    expect(approved.data.order).toMatchObject({
      status: "approved",
      assignedProviderId: "prov-mekanikomore",
    });

    const scheduled = await schedule(deps, owner, { orderId, scheduledFor: "2026-10-09" });
    expect(scheduled.ok && scheduled.data.order.status).toBe("scheduled");

    const started = await start(deps, owner, { orderId });
    expect(started.ok && started.data.order.status).toBe("in_progress");

    const closed = await close(deps, owner, {
      orderId,
      odometer: 999_999,
      findings: "Pads replaced.",
      taskIds: ["oil-filter"],
    });
    if (!closed.ok) throw new Error(closed.message);
    expect(closed.data.order.status).toBe("closed");
    expect(closed.data.vehicle.odometer).toBe(999_999);
    expect(closed.data.vehicle.taskState["oil-filter"].lastDoneOdometer).toBe(999_999);

    const collected = await markCollected(deps, owner, { orderIds: [orderId] });
    expect(collected.ok && collected.data.orders[0].collectedAt).toBeTruthy();

    const events = await admin!`
      select status::text from pms_work_order_events where work_order_id = ${orderId} order by seq`;
    expect(events.map((e) => e.status)).toEqual([
      "pending_approval",
      "approved",
      "scheduled",
      "in_progress",
      "closed",
    ]);
    const log = await admin!`
      select action::text, actor_id from pms_approval_log where work_order_id = ${orderId} order by seq`;
    expect(log).toEqual([{ action: "approved", actor_id: fleetManager.id }]);
  });
});
