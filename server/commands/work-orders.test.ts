import { describe, expect, it } from "vitest";
import type { Row } from "@/server/db-port";
import { FakeDb, type FakeTables } from "@/server/testing/fake-db";
import type { CommandDeps, VerifiedUser } from "@/server/commands/context";
import {
  close,
  createWorkOrder,
  decideLines,
  markCollected,
  recordLines,
  sendForApproval,
  start,
} from "@/server/commands/work-orders";

/* ----------------------------------------------------------------- fixture */

// 11:00 in Manila — a working hour, and the same calendar day in UTC.
const NOW = new Date("2026-10-07T03:00:00.000Z");

const user = (id: string): VerifiedUser => ({ id, email: `${id}@example.test` });

const ADMIN = user("u-admin"); // provider_admin — every active client
const FM_ACTIMED = user("u-fm-actimed"); // fleet_manager, fc-actimed
const OPS_ACTIMED = user("u-ops-actimed"); // operations, fc-actimed
const VIEWER_ACTIMED = user("u-viewer-actimed"); // viewer, fc-actimed
const FM_NORTHWIND = user("u-fm-northwind"); // fleet_manager, sibling client
const FM_BAYANI = user("u-fm-bayani"); // fleet_manager, suspended client

function profile(id: string, role: string, fleetClientId: string | null): Row {
  return {
    id,
    email: `${id}@example.test`,
    name: `Person ${id}`,
    first_name: "Person",
    last_name: id,
    username: id,
    role,
    title: "",
    provider_id: "prov-a",
    fleet_client_id: fleetClientId,
  };
}

function client(id: string, status = "active"): Row {
  return {
    id,
    provider_id: "prov-a",
    name: id,
    slug: id,
    contact_name: "",
    contact_email: "",
    contract_terms: "",
    payment_terms_days: 30,
    approval_threshold_overrides: null,
    logo_url: null,
    brand_color: null,
    status,
    created_at: "2024-01-01",
  };
}

function vehicle(id: string, fleetClientId: string): Row {
  return {
    id,
    fleet_client_id: fleetClientId,
    plate_number: id.toUpperCase(),
    make: "Toyota",
    model: "Hilux",
    year: 2024,
    vin: "",
    vehicle_class: "pickup",
    fuel_type: "diesel",
    color: "",
    odometer: 40_000,
    odometer_read_at: "2026-10-01",
    avg_daily_km: 50,
    status: "active",
    task_state: { "oil-filter": { lastDoneOdometer: 35_000, lastDoneOn: "2026-04-01" } },
  };
}

function order(id: string, vehicleId: string, status: string, extra: Row = {}): Row {
  return {
    id,
    reference: status === "draft" ? "" : `WO-2026-00${id.slice(-2)}`,
    vehicle_id: vehicleId,
    title: `Job ${id}`,
    type: "corrective",
    status,
    priority: "medium",
    opened_on: "2026-10-01",
    scheduled_for: "2026-10-09",
    scheduled_time: null,
    completed_on: null,
    odometer_at_service: 40_000,
    technician: "",
    technician_id: null,
    vendor: "",
    vendor_id: null,
    bay_id: null,
    collected_at: null,
    collected_by: null,
    labor_cost: 0,
    parts_cost: 0,
    findings: "",
    notes: "",
    pending_approval_entered_at: status === "pending_approval" ? "2026-10-06T01:00:00.000Z" : null,
    approval_wait_hours: null,
    assigned_provider_id: null,
    ...extra,
  };
}

let seq = 1;
function line(id: string, orderId: string, partCost: number, approval = "pending"): Row {
  return {
    id,
    work_order_id: orderId,
    service_task_id: null,
    description: `Line ${id}`,
    category: "engine",
    quantity: 1,
    unit_part_rate: partCost,
    labour_hours: 0,
    labour_rate: 0,
    part_cost: partCost,
    labour_cost: 0,
    urgency: "recommended",
    parts_source: "supplier_provided",
    approval_status: approval,
    approved_by: approval === "pending" ? null : "Someone",
    approved_at: null,
    decline_reason: null,
    photo_urls: [],
    seq: seq++,
  };
}

function fixture(): FakeTables {
  return {
    pms_providers: [
      {
        id: "prov-a",
        name: "Shop A",
        slug: "shop-a",
        logo_url: null,
        brand_color: "#1d5ba6",
        support_email: "help@shop-a.test",
        created_at: "2024-01-01",
      },
    ],
    pms_fleet_clients: [
      client("fc-actimed"),
      client("fc-northwind"),
      client("fc-bayani", "suspended"),
    ],
    pms_profiles: [
      profile(ADMIN.id, "provider_admin", null),
      profile(FM_ACTIMED.id, "fleet_manager", "fc-actimed"),
      profile(OPS_ACTIMED.id, "operations", "fc-actimed"),
      profile(VIEWER_ACTIMED.id, "viewer", "fc-actimed"),
      profile(FM_NORTHWIND.id, "fleet_manager", "fc-northwind"),
      profile(FM_BAYANI.id, "fleet_manager", "fc-bayani"),
    ],
    pms_vehicles: [vehicle("veh-actimed", "fc-actimed"), vehicle("veh-northwind", "fc-northwind")],
    pms_approval_settings: [
      {
        provider_id: "prov-a",
        auto_approve_under: 5_000,
        ops_approval_under: 50_000,
        sla_hours: 4,
        variance_threshold_pct: 15,
        default_parts_source: "supplier_provided",
        monthly_budget: 150_000,
        vat_rate_pct: 12,
        misc_fee_flat: 0,
        default_labour_rate: 650,
      },
    ],
    pms_service_tasks: [
      {
        id: "oil-filter",
        provider_id: "prov-a",
        name: "Engine oil & filter change",
        category: "engine",
        interval_km: 5000,
        interval_months: 6,
        estimated_cost: 3200,
        estimated_hours: 1,
        critical: true,
      },
    ],
    pms_technicians: [{ id: "tech-lito", provider_id: "prov-a", name: "Lito Sarmiento" }],
    pms_vendors: [],
    pms_work_orders: [
      order("wo-pending-07", "veh-actimed", "pending_approval"),
      order("wo-bigquote-08", "veh-actimed", "pending_approval"),
      order("wo-draft", "veh-actimed", "draft"),
      order("wo-wip-05", "veh-actimed", "in_progress"),
      order("wo-closed-04", "veh-actimed", "closed", { completed_on: "2026-10-05" }),
    ],
    pms_work_order_lines: [
      line("l-p1", "wo-pending-07", 3_000),
      line("l-p2", "wo-pending-07", 4_000),
      line("l-big", "wo-bigquote-08", 60_000),
      line("l-d1", "wo-draft", 2_000),
      line("l-w1", "wo-wip-05", 10_000, "approved"),
    ],
    pms_work_order_events: [],
    pms_approval_log: [],
    pms_work_order_tasks: [{ work_order_id: "wo-wip-05", service_task_id: "oil-filter" }],
    pms_work_order_parts: [],
    pms_parts: [],
  };
}

function setup() {
  const db = new FakeDb(fixture());
  let n = 0;
  const deps: CommandDeps = { db, now: () => NOW, newId: () => `srv-${++n}` };
  return { db, deps };
}

const lineIntent = (overrides: Record<string, unknown> = {}) => ({
  description: "Brake pads",
  category: "brakes",
  quantity: 4,
  unitPartRate: 2_000,
  labourHours: 2,
  labourRate: 650,
  urgency: "safety_critical",
  partsSource: "supplier_provided",
  photoUrls: [],
  ...overrides,
});

const newOrder = (overrides: Record<string, unknown> = {}) => ({
  vehicleId: "veh-actimed",
  title: "Brake job",
  type: "corrective",
  priority: "high",
  technician: "Lito Sarmiento",
  vendor: "",
  taskIds: [],
  lines: [lineIntent()],
  ...overrides,
});

/* ------------------------------------------------------------ the preamble */

describe("every command's preamble", () => {
  it("refuses an unauthenticated caller without opening a transaction", async () => {
    const { db, deps } = setup();
    const result = await createWorkOrder(deps, null, newOrder());
    expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
    expect(db.actingAs).toEqual([]);
  });

  it("refuses a role without the capability", async () => {
    const { deps } = setup();
    const result = await createWorkOrder(deps, VIEWER_ACTIMED, newOrder());
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("fails closed for a suspended client's user", async () => {
    const { deps } = setup();
    const result = await createWorkOrder(deps, FM_BAYANI, newOrder());
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects malformed input as a validation failure, not a crash", async () => {
    const { deps } = setup();
    const result = await createWorkOrder(deps, ADMIN, newOrder({ lines: [{ quantity: -1 }] }));
    expect(result).toMatchObject({ ok: false, code: "validation" });
  });
});

/* ------------------------------------------------------------------ create */

describe("createWorkOrder", () => {
  it("rejects a vehicle belonging to a sibling client", async () => {
    const { db, deps } = setup();
    const before = db.rows("pms_work_orders").length;

    const result = await createWorkOrder(deps, FM_NORTHWIND, newOrder({ vehicleId: "veh-actimed" }));

    expect(result).toMatchObject({ ok: false, code: "out_of_scope" });
    expect(db.rows("pms_work_orders")).toHaveLength(before);
  });

  it("recomputes every stored cost from quantities and rates, ignoring tampered totals and ids", async () => {
    const { db, deps } = setup();
    const tampered = lineIntent({
      id: "client-chosen-id",
      partCost: 1,
      labourCost: 1,
      approvalStatus: "approved",
    });

    const result = await createWorkOrder(
      deps,
      ADMIN,
      newOrder({ id: "client-order-id", lines: [tampered], laborCost: 1, partsCost: 1 })
    );
    if (!result.ok) throw new Error(result.message);
    const { order } = result.data;

    expect(order.id).not.toBe("client-order-id");
    const [stored] = db.rows("pms_work_order_lines").filter((l) => l.work_order_id === order.id);
    expect(stored.id).not.toBe("client-chosen-id");
    expect(stored.part_cost).toBe(8_000); // 4 × 2,000
    expect(stored.labour_cost).toBe(1_300); // 2h × 650
    // 9,300 is above the 5,000 auto-approve ceiling: it waits for the client.
    expect(stored.approval_status).toBe("pending");
    expect(order.status).toBe("pending_approval");
    expect(order.partsCost).toBe(8_000);
    expect(order.laborCost).toBe(1_300);
  });

  it("auto-approves under the ceiling: numbered, assigned, and logged in the same transaction", async () => {
    const { db, deps } = setup();
    const result = await createWorkOrder(
      deps,
      ADMIN,
      newOrder({ lines: [lineIntent({ quantity: 1, unitPartRate: 1_000, labourHours: 1 })] })
    );
    if (!result.ok) throw new Error(result.message);
    const { order } = result.data;

    expect(order.status).toBe("approved");
    expect(order.assignedProviderId).toBe("prov-a");
    expect(order.vendor).toBe(""); // in-house: the provider is not its own vendor
    expect(order.reference).toBe("WO-2026-0009"); // highest seeded is …-0008
    expect(order.approvalLog.map((e) => e.action)).toEqual(["auto_approved"]);
    expect(order.history.map((e) => e.status)).toEqual(["approved"]);
    expect(db.rows("pms_work_orders").find((o) => o.id === order.id)?.technician_id).toBe(
      "tech-lito"
    );
  });

  it("opens a draft unnumbered and unpriced against the bands", async () => {
    const { deps } = setup();
    const result = await createWorkOrder(deps, ADMIN, newOrder({ asDraft: true }));
    if (!result.ok) throw new Error(result.message);
    expect(result.data.order).toMatchObject({ status: "draft", reference: "" });
  });

  it("leaves no partial rows when a write fails midway", async () => {
    const { db, deps } = setup();
    const ordersBefore = db.rows("pms_work_orders").length;
    db.failOn = (op, table) => op === "insert" && table === "pms_work_order_lines";

    const result = await createWorkOrder(deps, ADMIN, newOrder({ title: "Doomed" }));

    expect(result.ok).toBe(false);
    expect(db.rows("pms_work_orders")).toHaveLength(ordersBefore);
    expect(db.rows("pms_work_orders").some((o) => o.title === "Doomed")).toBe(false);
  });
});

/* ------------------------------------------------------------- transitions */

describe("the state machine is the only transition gate", () => {
  it("refuses to start an order still awaiting approval, and writes nothing", async () => {
    const { db, deps } = setup();
    const result = await start(deps, ADMIN, { orderId: "wo-pending-07" });

    expect(result).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(db.rows("pms_work_orders").find((o) => o.id === "wo-pending-07")?.status).toBe(
      "pending_approval"
    );
    expect(db.rows("pms_work_order_events")).toHaveLength(0);
  });

  it("treats another tenant's order as out of scope", async () => {
    const { deps } = setup();
    const result = await start(deps, FM_NORTHWIND, { orderId: "wo-wip-05" });
    expect(result).toMatchObject({ ok: false, code: "out_of_scope" });
  });

  it("only edits lines while the order is a draft", async () => {
    const { deps } = setup();
    const result = await recordLines(deps, ADMIN, {
      orderId: "wo-pending-07",
      upserts: [lineIntent()],
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_transition" });
  });

  it("re-prices an edited draft line from its inputs, never a supplied total", async () => {
    const { db, deps } = setup();
    const result = await recordLines(deps, ADMIN, {
      orderId: "wo-draft",
      upserts: [lineIntent({ id: "l-d1", quantity: 3, unitPartRate: 500, partCost: 999_999 })],
    });
    if (!result.ok) throw new Error(result.message);
    expect(db.rows("pms_work_order_lines").find((l) => l.id === "l-d1")?.part_cost).toBe(1_500);
  });
});

/* ---------------------------------------------------------------- approval */

describe("sendForApproval", () => {
  it("issues the order its number at draft -> pending_approval and logs the send", async () => {
    const { deps } = setup();
    const result = await sendForApproval(deps, ADMIN, { orderId: "wo-draft" });
    if (!result.ok) throw new Error(result.message);

    const { order } = result.data;
    expect(order.status).toBe("pending_approval");
    expect(order.reference).toBe("WO-2026-0009");
    expect(order.pendingApprovalEnteredAt).toBe(NOW.toISOString());
    expect(order.approvalLog.at(-1)).toMatchObject({ action: "sent_for_approval", actorId: ADMIN.id });
  });
});

describe("decideLines derives the order's status from its lines", () => {
  it("one approved and one declined reads partially_approved, and assigns the provider", async () => {
    const { db, deps } = setup();
    const result = await decideLines(deps, FM_ACTIMED, {
      orderId: "wo-pending-07",
      decisions: [
        { lineId: "l-p1", decision: "approved" },
        { lineId: "l-p2", decision: "declined", note: "Not this month" },
      ],
    });
    if (!result.ok) throw new Error(result.message);

    const { order } = result.data;
    expect(order.status).toBe("partially_approved");
    expect(order.assignedProviderId).toBe("prov-a");
    expect(order.pendingApprovalEnteredAt).toBeNull();
    // Entered 09:00 Manila on Tue the 6th, decided 11:00 Wed the 7th:
    // 09:00–18:00 (9h) + 08:00–11:00 (3h) of business time.
    expect(order.approvalWaitHours).toBe(12);
    expect(db.rows("pms_approval_log").map((e) => e.action)).toEqual(["approved", "declined"]);
    expect(db.rows("pms_work_order_events").map((e) => e.status)).toEqual(["partially_approved"]);
  });

  it("every line approved reads approved", async () => {
    const { deps } = setup();
    const result = await decideLines(deps, FM_ACTIMED, {
      orderId: "wo-pending-07",
      decisions: [
        { lineId: "l-p1", decision: "approved" },
        { lineId: "l-p2", decision: "approved" },
      ],
    });
    expect(result.ok && result.data.order.status).toBe("approved");
  });

  it("a partial decision leaves the order pending and adds no status event", async () => {
    const { db, deps } = setup();
    const result = await decideLines(deps, FM_ACTIMED, {
      orderId: "wo-pending-07",
      decisions: [{ lineId: "l-p1", decision: "approved" }],
    });
    expect(result.ok && result.data.order.status).toBe("pending_approval");
    expect(db.rows("pms_work_order_events")).toHaveLength(0);
  });

  it("enforces the approval band, not just the capability", async () => {
    const { deps } = setup();
    // 60,000 pending is above Operations' 50,000 band.
    const result = await decideLines(deps, OPS_ACTIMED, {
      orderId: "wo-bigquote-08",
      decisions: [{ lineId: "l-big", decision: "approved" }],
    });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses to decide lines on a draft — that would skip numbering", async () => {
    const { deps } = setup();
    const result = await decideLines(deps, FM_ACTIMED, {
      orderId: "wo-draft",
      decisions: [{ lineId: "l-d1", decision: "approved" }],
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_transition" });
  });

  it("requires a reason to decline", async () => {
    const { deps } = setup();
    const result = await decideLines(deps, FM_ACTIMED, {
      orderId: "wo-pending-07",
      decisions: [{ lineId: "l-p1", decision: "declined" }],
    });
    expect(result).toMatchObject({ ok: false, code: "validation" });
  });
});

/* --------------------------------------------------------------- close-out */

describe("close", () => {
  it("refuses a variance breach unless it is re-approved", async () => {
    const { deps } = setup();
    const parts = [{ partNumber: "BP-1", name: "Pads", quantity: 1, unitCost: 20_000 }];
    const result = await close(deps, ADMIN, { orderId: "wo-wip-05", parts });
    expect(result).toMatchObject({ ok: false, code: "validation" });
  });

  it("closes, logs the re-approved variance, and resets the vehicle's PMS clock atomically", async () => {
    const { db, deps } = setup();
    const result = await close(deps, ADMIN, {
      orderId: "wo-wip-05",
      odometer: 41_250,
      findings: "Pads at 2mm.",
      parts: [{ id: "ignored", partNumber: "BP-1", name: "Pads", quantity: 1, unitCost: 20_000 }],
      varianceApproved: true,
    });
    if (!result.ok) throw new Error(result.message);

    const { order, vehicle } = result.data;
    expect(order.status).toBe("closed");
    expect(order.completedOn).toBe("2026-10-07");
    expect(order.parts.map((p) => p.id)).not.toContain("ignored");
    expect(order.approvalLog.map((e) => e.action)).toEqual(["variance_approved"]);
    expect(vehicle.odometer).toBe(41_250);
    expect(vehicle.taskState["oil-filter"]).toEqual({
      lastDoneOdometer: 41_250,
      lastDoneOn: "2026-10-07",
    });
    expect(db.rows("pms_work_order_events").map((e) => e.status)).toEqual(["closed"]);
  });
});

describe("markCollected", () => {
  it("collects closed orders and skips anything else in the list", async () => {
    const { deps } = setup();
    const result = await markCollected(deps, ADMIN, {
      orderIds: ["wo-closed-04", "wo-wip-05", "does-not-exist"],
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.data.orders.map((o) => o.id)).toEqual(["wo-closed-04"]);
    expect(result.data.orders[0].collectedAt).toBe(NOW.toISOString());
  });
});
