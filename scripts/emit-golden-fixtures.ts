/**
 * Emits golden fixtures: the exact behaviour of the lib/ domain modules as
 * language-neutral JSON, so the PHP port in the Laravel API can be proven
 * against it case by case.
 *
 * Run via: npx vitest run scripts/emit-golden-fixtures.ts
 *          (after npx vitest run scripts/emit-seed-json.ts if the seed changed)
 * Writes:  fixtures/golden/<module>.json, fixtures/golden/COVERAGE.md
 *
 * Two sources of cases, both recorded the same way (scripts/golden/recorder.ts):
 *
 *   1. Replay. Every lib/*.test.ts is imported and run here, with the domain
 *      modules wrapped, so each top-level call a test makes becomes a case named
 *      after that test. The tests' own assertions still run: fixtures are only
 *      written if the existing suite passes against the same code.
 *   2. Sweeps. Systematic coverage the unit tests don't attempt: the whole seed
 *      fleet, every transition × role, every demo account, edge-case grids.
 *
 * The clock is frozen to a Manila instant (scripts/golden/clock.ts) and recorded
 * as the first case of every file. The format is specified in
 * fixtures/golden/README.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { addDays, addMonths, formatISO, startOfMonth, subDays } from "date-fns";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Freeze the clock and create the recorder before any domain module loads.
const golden = await vi.hoisted(async () => {
  const { freezeClock } = await import("./golden/clock");
  freezeClock();
  const { Recorder } = await import("./golden/recorder");
  return new Recorder();
});

vi.mock("@/lib/pms", async (load) => golden.wrap("pms", await load()));
vi.mock("@/lib/interval-status", async (load) => golden.wrap("interval-status", await load()));
vi.mock("@/lib/odometer-validation", async (load) => golden.wrap("odometer-validation", await load()));
vi.mock("@/lib/compliance", async (load) => golden.wrap("compliance", await load()));
vi.mock("@/lib/work-order-machine", async (load) => golden.wrap("work-order-machine", await load()));
vi.mock("@/lib/approvals", async (load) => golden.wrap("approvals", await load()));
vi.mock("@/lib/billing", async (load) => golden.wrap("billing", await load()));
vi.mock("@/lib/checkin", async (load) => golden.wrap("checkin", await load()));
vi.mock("@/lib/parts-forecast", async (load) => golden.wrap("parts-forecast", await load()));
vi.mock("@/lib/parts", async (load) => golden.wrap("parts", await load()));
vi.mock("@/lib/shop", async (load) => golden.wrap("shop", await load()));
vi.mock("@/lib/analytics", async (load) => golden.wrap("analytics", await load()));
vi.mock("@/lib/alerts", async (load) => golden.wrap("alerts", await load()));
vi.mock("@/lib/tenancy", async (load) => golden.wrap("tenancy", await load()));
vi.mock("@/lib/rbac", async (load) => golden.wrap("rbac", await load()));
// The generator calls the engine thousands of times; none of that is a case.
vi.mock("@/lib/seed", async (load) => golden.shield(await load()));

import * as pms from "@/lib/pms";
import * as intervalStatus from "@/lib/interval-status";
import * as odometer from "@/lib/odometer-validation";
import * as compliance from "@/lib/compliance";
import * as machine from "@/lib/work-order-machine";
import * as approvals from "@/lib/approvals";
import * as billing from "@/lib/billing";
import * as checkin from "@/lib/checkin";
import * as partsForecast from "@/lib/parts-forecast";
import * as parts from "@/lib/parts";
import * as shop from "@/lib/shop";
import * as analytics from "@/lib/analytics";
import * as alerts from "@/lib/alerts";
import * as tenancy from "@/lib/tenancy";
import * as rbac from "@/lib/rbac";
import { BAYS, TOTAL_BAY_CAPACITY_HOURS } from "@/lib/bays";
import { TECHNICIAN_NAMES } from "@/lib/technicians";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/auth";
import { buildRefIndex, type GoldenCase } from "./golden/recorder";
import { FROZEN_AT, TIMEZONE } from "./golden/clock";
import {
  buildSeedDocument,
  SEED_JSON_PATH,
  serialiseSeedDocument,
  type SeedDocument,
} from "./golden/seed-document";
import type {
  ApprovalSettings,
  FleetClient,
  FleetState,
  LineApprovalStatus,
  Provider,
  Session,
  UserRole,
  Vehicle,
  VehicleHealth,
  WorkOrder,
  WorkOrderLine,
  WorkOrderStatus,
} from "@/types";

const OUT_DIR = resolve(process.cwd(), "fixtures/golden");

/* ------------------------------------------------------------------ setup */

let doc: SeedDocument;
let state: FleetState;
let health: VehicleHealth[];
let now: Date;

beforeAll(() => {
  now = new Date();
  doc = buildSeedDocument();
  state = doc.state;

  // $seed references point into the committed file, so it must be current.
  const onDisk = readFileSync(SEED_JSON_PATH, "utf8").replace(/\r\n/g, "\n");
  if (onDisk !== serialiseSeedDocument(doc)) {
    throw new Error(
      "fixtures/seed/demo-seed.json is stale. Run `npx vitest run scripts/emit-seed-json.ts` first."
    );
  }

  // Unrecorded: this is the reference fleet health that "$health" points at.
  // The same computation is recorded below as the case that defines it.
  const evaluateFleet = golden.original<typeof pms.evaluateFleet>("pms", "evaluateFleet");
  health = evaluateFleet(state.vehicles, now);
  golden.index = buildRefIndex(doc, health);
});

afterEach(() => golden.noteTest(expect.getState().currentTestName));

/* ----------------------------------------------------- 1. replay the tests */

const TEST_FILES: [string, () => Promise<unknown>][] = [
  ["lib/analytics.test.ts", () => import("@/lib/analytics.test")],
  ["lib/approvals.test.ts", () => import("@/lib/approvals.test")],
  ["lib/billing.test.ts", () => import("@/lib/billing.test")],
  ["lib/checkin.test.ts", () => import("@/lib/checkin.test")],
  ["lib/compliance.test.ts", () => import("@/lib/compliance.test")],
  ["lib/interval-status.test.ts", () => import("@/lib/interval-status.test")],
  ["lib/odometer-validation.test.ts", () => import("@/lib/odometer-validation.test")],
  ["lib/parts-forecast.test.ts", () => import("@/lib/parts-forecast.test")],
  ["lib/rls-parity.test.ts", () => import("@/lib/rls-parity.test")],
  ["lib/seed.test.ts", () => import("@/lib/seed.test")],
  ["lib/shop.test.ts", () => import("@/lib/shop.test")],
  ["lib/tenancy.test.ts", () => import("@/lib/tenancy.test")],
  ["lib/work-order-machine.test.ts", () => import("@/lib/work-order-machine.test")],
];

for (const [file, load] of TEST_FILES) {
  golden.registerRoot(
    describe(file, async () => {
      await load();
    }),
    file
  );
}

/* ---------------------------------------------------------------- helpers */

const rec = <T>(label: string, run: () => T): T => golden.as(label, run);

const STATUSES: WorkOrderStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "partially_approved",
  "declined",
  "scheduled",
  "in_progress",
  "closed",
  "cancelled",
];
const LINE_STATUSES: LineApprovalStatus[] = ["pending", "approved", "declined", "deferred"];
const ROLES = Object.keys(rbac.ROLE_CAPABILITIES) as UserRole[];

/** A local (Manila) calendar date — never toISOString(), which is the UTC date. */
const isoDay = (date: Date) => formatISO(date, { representation: "date" });

/** A Manila wall-clock time as a Date (the process TZ is Asia/Manila). */
const manila = (local: string) => new Date(`${local}+08:00`);

const clientOfVehicle = () => new Map(state.vehicles.map((v) => [v.id, v.fleetClientId]));

function ordersOfClient(clientId: string): WorkOrder[] {
  const owner = clientOfVehicle();
  return state.workOrders.filter((order) => owner.get(order.vehicleId) === clientId);
}

function healthOfClient(clientId: string): VehicleHealth[] {
  return health.filter((entry) => entry.vehicle.fleetClientId === clientId);
}

function settingsFor(clientId: string): ApprovalSettings {
  const client = state.fleetClients.find((c) => c.id === clientId);
  const fold = golden.original<typeof tenancy.approvalSettingsForClient>("tenancy", "approvalSettingsForClient");
  return client ? fold(client, state.approvalSettings) : state.approvalSettings;
}

let lineSeq = 0;
function line(overrides: Partial<WorkOrderLine> = {}): WorkOrderLine {
  lineSeq += 1;
  return {
    id: `golden-line-${lineSeq}`,
    serviceTaskId: null,
    description: "Golden fixture line",
    category: "other",
    quantity: 1,
    unitPartRate: 0,
    labourHours: 0,
    labourRate: 0,
    partCost: 0,
    labourCost: 0,
    urgency: "recommended",
    partsSource: "supplier_provided",
    approvalStatus: "pending",
    approvedBy: null,
    approvedAt: null,
    declineReason: null,
    photoUrls: [],
    ...overrides,
  };
}

/** A seed vehicle with overrides, for edge cases the seed doesn't happen to contain. */
function vehicle(overrides: Partial<Vehicle>): Vehicle {
  return { ...state.vehicles[0], id: "golden-vehicle", plateNumber: "GLD 0001", ...overrides };
}

function sessionFor(account: DemoAccount): Session {
  const [firstName, ...rest] = account.name.split(" ");
  return {
    uid: `demo:${account.email}`,
    email: account.email,
    name: account.name,
    firstName,
    lastName: rest.join(" "),
    username: account.email.split("@")[0],
    role: account.role,
    title: account.title,
    signedInAt: FROZEN_AT,
    providerId: account.providerId,
    fleetClientId: account.fleetClientId,
  };
}

/* -------------------------------------------------------------- 2. sweeps */

describe("sweep", () => {
  describe("pms", () => {
    it("whole seed fleet", () => {
      golden.definingHealth(() =>
        rec("sweep › evaluateFleet › whole seed fleet (defines $health)", () =>
          pms.evaluateFleet(state.vehicles, now)
        )
      );
      rec("sweep › summariseFleet › whole seed fleet", () => pms.summariseFleet(health));
      for (const client of state.fleetClients) {
        rec(`sweep › summariseFleet › ${client.id}`, () => pms.summariseFleet(healthOfClient(client.id)));
      }
      rec("sweep › summariseFleet › empty fleet", () => pms.summariseFleet([]));
    });

    it("every vehicle and every task", () => {
      for (const v of state.vehicles) {
        rec(`sweep › evaluateVehicle › ${v.id}`, () => pms.evaluateVehicle(v, now));
        for (const task of doc.serviceTasks) {
          rec(`sweep › evaluateTask › ${v.id} × ${task.id}`, () => pms.evaluateTask(v, task, now));
        }
        rec(`sweep › odometerAgeDays › ${v.id}`, () => pms.odometerAgeDays(v, now));
        rec(`sweep › isOdometerStale › ${v.id}`, () => pms.isOdometerStale(v, now));
      }
      for (const entry of health) {
        if (entry.items.length < 2) continue;
        rec(`sweep › compareUrgency › ${entry.vehicle.id} first two items`, () =>
          pms.compareUrgency(entry.items[0], entry.items[1])
        );
      }
    });

    it("applyCompletion against each vehicle's latest closed order", () => {
      for (const v of state.vehicles) {
        const latest = state.workOrders
          .filter((o) => o.vehicleId === v.id && o.status === "closed" && o.completedOn)
          .sort((a, b) => (b.completedOn ?? "").localeCompare(a.completedOn ?? ""))[0];
        if (latest) rec(`sweep › applyCompletion › ${v.id} ← ${latest.id}`, () => pms.applyCompletion(v, latest));
      }
      const v = state.vehicles[0];
      const order = state.workOrders.find((o) => o.vehicleId === v.id) ?? state.workOrders[0];
      rec("sweep › applyCompletion › no completion date uses the frozen clock", () =>
        pms.applyCompletion(v, { ...order, completedOn: null, taskIds: ["oil-filter"] })
      );
      rec("sweep › applyCompletion › service odometer below the vehicle's keeps the higher reading", () =>
        pms.applyCompletion(v, { ...order, odometerAtService: v.odometer - 500, completedOn: "2026-10-01" })
      );
      rec("sweep › applyCompletion › several tasks, one never done before", () =>
        pms.applyCompletion(
          { ...v, taskState: {} },
          { ...order, taskIds: ["oil-filter", "timing-belt", "brake-fluid"], completedOn: "2026-10-07" }
        )
      );
    });

    it("work order cost for every seed order", () => {
      for (const order of state.workOrders) {
        rec(`sweep › resolvePartsCost › ${order.id}`, () => pms.resolvePartsCost(order));
        rec(`sweep › workOrderCost › ${order.id}`, () => pms.workOrderCost(order));
      }
      const order = state.workOrders[0];
      rec("sweep › resolvePartsCost › itemised parts win over the aggregate", () =>
        pms.resolvePartsCost({
          ...order,
          partsCost: 99_999,
          parts: [
            { id: "pl-1", partNumber: "A", name: "Filter", quantity: 2, unitCost: 380.5 },
            { id: "pl-2", partNumber: "B", name: "Oil", quantity: 5, unitCost: 520 },
          ],
        })
      );
    });

    it("edge cases", () => {
      const oil = doc.serviceTasks.find((t) => t.id === "oil-filter") ?? doc.serviceTasks[0];
      const timing = doc.serviceTasks.find((t) => t.id === "timing-belt") ?? doc.serviceTasks[1];
      const today = "2026-10-08";

      const neverServiced = vehicle({ taskState: {} });
      rec("sweep › evaluateVehicle › never serviced (no task history)", () => pms.evaluateVehicle(neverServiced, now));
      rec("sweep › evaluateTask › never serviced, odometer below one interval", () =>
        pms.evaluateTask(vehicle({ taskState: {}, odometer: 1_200, odometerReadAt: today }), timing, now)
      );

      for (const days of [0, 14, 15, 60]) {
        const v = vehicle({ odometerReadAt: isoDay(addDays(now, -days)) });
        rec(`sweep › isOdometerStale › reading ${days} days old`, () => pms.isOdometerStale(v, now));
        rec(`sweep › evaluateTask › odometer read ${days} days ago, rolled forward`, () =>
          pms.evaluateTask(v, oil, now)
        );
      }
      rec("sweep › odometerAgeDays › reading dated in the future clamps to 0", () =>
        pms.odometerAgeDays(vehicle({ odometerReadAt: "2026-10-20" }), now)
      );

      const fromLastService = (avgDailyKm: number, lastDoneOn: string, lastDoneOdometer: number, odometer: number) =>
        vehicle({
          avgDailyKm,
          odometer,
          odometerReadAt: today,
          taskState: { [oil.id]: { lastDoneOn, lastDoneOdometer } },
        });

      rec("sweep › evaluateTask › km-governed (heavy daily use)", () =>
        pms.evaluateTask(fromLastService(200, "2026-09-01", 50_000, 55_000), oil, now)
      );
      rec("sweep › evaluateTask › month-governed (barely driven)", () =>
        pms.evaluateTask(fromLastService(5, "2026-05-01", 50_000, 50_800), oil, now)
      );
      rec("sweep › evaluateTask › both limits breached", () =>
        pms.evaluateTask(fromLastService(60, "2023-06-01", 20_000, 90_000), oil, now)
      );
      rec("sweep › evaluateTask › not moving (avgDailyKm 0) falls back to time", () =>
        pms.evaluateTask(fromLastService(0, "2026-08-01", 50_000, 50_000), oil, now)
      );
      rec("sweep › evaluateVehicle › both critical intervals breached scores steeply", () =>
        pms.evaluateVehicle(
          vehicle({
            avgDailyKm: 60,
            odometer: 150_000,
            odometerReadAt: today,
            taskState: Object.fromEntries(
              doc.serviceTasks.map((t) => [t.id, { lastDoneOn: "2022-01-01", lastDoneOdometer: 10_000 }])
            ),
          }),
          now
        )
      );
      rec("sweep › evaluateVehicle › a custom task catalogue", () =>
        pms.evaluateVehicle(vehicle({}), now, [oil, timing])
      );
    });
  });

  describe("interval-status", () => {
    it("governor, status bands, and calendar edges", () => {
      const base = {
        lastCompletedAt: manila("2026-01-15T00:00:00"),
        lastCompletedOdometer: 40_000,
        distanceIntervalKm: 5_000,
        timeIntervalMonths: 6,
        currentOdometer: 42_000,
        currentOdometerReadAt: manila("2026-10-08T00:00:00"),
        avgKmPerDay: 40,
        today: now,
      };
      const grid: [string, Partial<typeof base>][] = [
        ["distance governs (40 km/day)", {}],
        ["time governs (5 km/day)", { avgKmPerDay: 5, currentOdometer: 41_000 }],
        ["not moving", { avgKmPerDay: 0, currentOdometer: 40_000 }],
        ["fractional average", { avgKmPerDay: 27.17 }],
        ["on schedule", { lastCompletedAt: manila("2026-09-01T00:00:00"), lastCompletedOdometer: 41_900, avgKmPerDay: 10 }],
        ["km remaining exactly at the warning band (750)", { lastCompletedAt: manila("2026-09-01T00:00:00"), lastCompletedOdometer: 37_750, avgKmPerDay: 1 }],
        ["km remaining one past the warning band (751)", { lastCompletedAt: manila("2026-09-01T00:00:00"), lastCompletedOdometer: 37_751, avgKmPerDay: 1 }],
        ["km remaining exactly 0", { lastCompletedAt: manila("2026-09-01T00:00:00"), lastCompletedOdometer: 37_000, avgKmPerDay: 1 }],
        ["km remaining -1", { lastCompletedAt: manila("2026-09-01T00:00:00"), lastCompletedOdometer: 36_999, avgKmPerDay: 1 }],
        ["days remaining exactly 21", { lastCompletedAt: manila("2026-04-29T00:00:00"), lastCompletedOdometer: 41_900, avgKmPerDay: 1 }],
        ["days remaining 22", { lastCompletedAt: manila("2026-04-30T00:00:00"), lastCompletedOdometer: 41_900, avgKmPerDay: 1 }],
        ["due today (days remaining 0)", { lastCompletedAt: manila("2026-04-08T00:00:00"), lastCompletedOdometer: 41_900, avgKmPerDay: 1 }],
        ["one day overdue", { lastCompletedAt: manila("2026-04-07T00:00:00"), lastCompletedOdometer: 41_900, avgKmPerDay: 1 }],
        ["both breached, counted from the earlier limit", { lastCompletedAt: manila("2024-01-15T00:00:00"), lastCompletedOdometer: 10_000, currentOdometer: 60_000 }],
        ["month-end anchor (Aug 31 + 1 month)", { lastCompletedAt: manila("2026-08-31T00:00:00"), timeIntervalMonths: 1, avgKmPerDay: 1, lastCompletedOdometer: 41_900 }],
        ["leap-day anchor (2024-02-29 + 12 months)", { lastCompletedAt: manila("2024-02-29T00:00:00"), timeIntervalMonths: 12, avgKmPerDay: 1, lastCompletedOdometer: 41_900 }],
        ["reading dated after today does not roll backwards", { currentOdometerReadAt: manila("2026-10-20T00:00:00") }],
        ["stale reading rolled forward 90 days", { currentOdometerReadAt: manila("2026-07-10T00:00:00") }],
        ["zero distance interval", { distanceIntervalKm: 0 }],
        ["completed later today (time of day ignored)", { lastCompletedAt: manila("2026-10-08T23:00:00"), lastCompletedOdometer: 42_000 }],
      ];
      for (const [label, overrides] of grid) {
        rec(`sweep › computeIntervalStatus › ${label}`, () =>
          intervalStatus.computeIntervalStatus({ ...base, ...overrides })
        );
      }
    });
  });

  describe("odometer-validation", () => {
    it("every seed vehicle around each boundary", () => {
      for (const v of state.vehicles) {
        const days = Math.max(1, Math.round((now.getTime() - new Date(`${v.odometerReadAt}T00:00:00+08:00`).getTime()) / 86_400_000));
        const readings: [string, number][] = [
          ["lower than last", v.odometer - 1],
          ["equal to last", v.odometer],
          ["at the average", Math.round(v.odometer + v.avgDailyKm * days)],
          ["exactly 3x the average", v.odometer + v.avgDailyKm * 3 * days],
          ["just over 3x the average", v.odometer + v.avgDailyKm * 3 * days + 1],
          ["exactly 10% of the average", v.odometer + v.avgDailyKm * 0.1 * days],
          ["just under 10% of the average", v.odometer + v.avgDailyKm * 0.1 * days - 0.5],
        ];
        for (const [label, reading] of readings) {
          rec(`sweep › validateOdometerReading › ${v.id} ${label}`, () =>
            odometer.validateOdometerReading({ vehicle: v, reading, readAt: now })
          );
        }
      }
      rec("sweep › validateOdometerReading › no average yet skips the rate checks", () =>
        odometer.validateOdometerReading({ vehicle: vehicle({ avgDailyKm: 0 }), reading: state.vehicles[0].odometer + 5_000, readAt: now })
      );
      rec("sweep › validateOdometerReading › same-day reading counts as one day", () =>
        odometer.validateOdometerReading({
          vehicle: vehicle({ odometerReadAt: "2026-10-08", avgDailyKm: 50 }),
          reading: state.vehicles[0].odometer + 120,
          readAt: now,
        })
      );
      rec("sweep › validateOdometerReading › readAt omitted uses the frozen clock", () =>
        odometer.validateOdometerReading({ vehicle: state.vehicles[0], reading: state.vehicles[0].odometer + 10 })
      );
    });
  });

  describe("compliance", () => {
    it("every seed vehicle, document and plate", () => {
      for (const v of state.vehicles) {
        rec(`sweep › vehicleComplianceStatus › ${v.id}`, () =>
          compliance.vehicleComplianceStatus(v, state.documents, now)
        );
        rec(`sweep › plateEndingRenewalMonth › ${v.plateNumber}`, () => compliance.plateEndingRenewalMonth(v.plateNumber));
      }
      for (const d of state.documents) {
        rec(`sweep › documentExpiryStatus › ${d.id}`, () => compliance.documentExpiryStatus(d, now));
      }
      for (const window of [0, 30, 45, 60, 90]) {
        rec(`sweep › expiringDocumentSummary › ${window}-day window`, () =>
          compliance.expiringDocumentSummary(state.vehicles, state.documents, window, now)
        );
      }
      for (const plate of ["ABC 1230", "NO DIGITS", "", "A1B2C3", "9", "XYZ-0001"]) {
        rec(`sweep › plateEndingRenewalMonth › "${plate}"`, () => compliance.plateEndingRenewalMonth(plate));
      }
      const v = state.vehicles[0];
      for (const offset of [-1, 0, 30, 31]) {
        const expiry = isoDay(addDays(now, offset));
        rec(`sweep › vehicleComplianceStatus › driver licence expires in ${offset} days`, () =>
          compliance.vehicleComplianceStatus({ ...v, driverLicenceExpiry: expiry }, [], now)
        );
      }
    });
  });

  describe("work-order-machine", () => {
    it("checkTransition for every from × to, with and without lines", () => {
      const someLine = line();
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          rec(`sweep › checkTransition › ${from} → ${to} (no lines)`, () =>
            machine.checkTransition({ status: from, lines: [] }, to)
          );
          rec(`sweep › checkTransition › ${from} → ${to} (1 line)`, () =>
            machine.checkTransition({ status: from, lines: [someLine] }, to)
          );
        }
      }
    });

    it("every from × to × role", () => {
      const lines = [line()];
      const can = golden.original<typeof rbac.can>("rbac", "can");
      const check = golden.original<typeof machine.checkTransition>("work-order-machine", "checkTransition");
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          for (const role of ROLES) {
            golden.compose(
              "work-order-machine",
              "$authorizeTransition",
              `sweep › $authorizeTransition › ${from} → ${to} as ${role}`,
              [{ status: from, lines }, to, role],
              () => {
                const transition = check({ status: from, lines }, to);
                const roleHasCapability = transition.ok
                  ? transition.capability === null || can(role, transition.capability)
                  : null;
                return { transition, roleHasCapability, allowed: transition.ok && roleHasCapability === true };
              }
            );
          }
        }
      }
    });

    it("stages, edges, references and assignment", () => {
      for (const status of STATUSES) {
        rec(`sweep › lifecycleStage › ${status}, not collected`, () => machine.lifecycleStage({ status, collectedAt: null }));
        rec(`sweep › lifecycleStage › ${status}, collected`, () =>
          machine.lifecycleStage({ status, collectedAt: "2026-10-08T09:00:00+08:00" })
        );
        rec(`sweep › nextStatuses › ${status}`, () => machine.nextStatuses(status));
        rec(`sweep › capabilityFor › ${status}`, () => machine.capabilityFor(status));
        for (const to of STATUSES) rec(`sweep › canTransition › ${status} → ${to}`, () => machine.canTransition(status, to));
      }

      const refs = (...references: string[]) => references.map((reference) => ({ reference }));
      const sequences: [string, { reference: string }[], number][] = [
        ["empty book", [], 2026],
        ["continues from the highest", refs("WO-2026-0001", "WO-2026-0007", "WO-2026-0003"), 2026],
        ["ignores drafts", refs("", "WO-2026-0002", ""), 2026],
        ["ignores other years", refs("WO-2025-0412", "WO-2027-0001"), 2026],
        ["ignores malformed", refs("WO-2026-12A", "wo-2026-0009", "WO-26-0004", "WO-2026-0005 "), 2026],
        ["past 9999 widens", refs("WO-2026-9999"), 2026],
        ["new year restarts", refs("WO-2026-0420"), 2027],
      ];
      for (const [label, existing, year] of sequences) {
        rec(`sweep › nextReference › ${label}`, () => machine.nextReference(existing, year));
      }
      rec("sweep › nextReference › whole seed book, current year", () => machine.nextReference(state.workOrders, 2026));
      rec("sweep › nextReference › year omitted uses the frozen clock", () => machine.nextReference(state.workOrders));

      for (const reference of ["", "   ", "WO-2026-0001"]) {
        rec(`sweep › hasReference › "${reference}"`, () => machine.hasReference({ reference }));
        rec(`sweep › displayReference › "${reference}"`, () => machine.displayReference({ reference }));
      }
      for (const vendor of ["", "   ", "Bridgestone Tire Center"]) {
        rec(`sweep › assignOnApproval › vendor "${vendor}"`, () =>
          machine.assignOnApproval({ vendor }, state.providers[0].id)
        );
        rec(`sweep › isInHouse › vendor "${vendor}"`, () => machine.isInHouse({ vendor }));
      }
    });
  });

  describe("approvals", () => {
    it("bands, roles and line derivation", () => {
      const amounts = [0, 0.01, 4_999.99, 5_000, 5_000.01, 49_999.99, 50_000, 50_000.01, 1_000_000];
      const settings: [string, ApprovalSettings][] = [
        ["default", approvals.DEFAULT_APPROVAL_SETTINGS],
        ...state.fleetClients.map((c): [string, ApprovalSettings] => [`${c.id} effective`, settingsFor(c.id)]),
      ];
      for (const [label, s] of settings) {
        for (const amount of amounts) {
          rec(`sweep › requiredApprover › ${amount} under ${label}`, () => approvals.requiredApprover(amount, s));
        }
      }
      for (const role of ROLES) {
        for (const amount of amounts) {
          rec(`sweep › canApprove › ${role} at ${amount}`, () =>
            approvals.canApprove(role, amount, approvals.DEFAULT_APPROVAL_SETTINGS)
          );
        }
      }

      // Every multiset of up to three line statuses.
      const combos: LineApprovalStatus[][] = [[]];
      const extend = (prefix: LineApprovalStatus[], start: number, size: number) => {
        if (prefix.length === size) return void combos.push(prefix);
        for (let i = start; i < LINE_STATUSES.length; i++) extend([...prefix, LINE_STATUSES[i]], i, size);
      };
      for (const size of [1, 2, 3]) extend([], 0, size);
      for (const combo of combos) {
        const lines = combo.map((approvalStatus) => line({ approvalStatus, unitPartRate: 1_000, partCost: 1_000 }));
        rec(`sweep › deriveOrderStatus › [${combo.join(", ")}]`, () => approvals.deriveOrderStatus(lines));
      }

      for (const order of state.workOrders) {
        if (order.lines.length === 0) continue;
        rec(`sweep › pendingValue › ${order.id}`, () => approvals.pendingValue(order.lines));
        rec(`sweep › approvedValue › ${order.id}`, () => approvals.approvedValue(order.lines));
        rec(`sweep › declinedValue › ${order.id}`, () => approvals.declinedValue(order.lines));
      }
      const sample = state.workOrders.find((o) => o.lines.length > 0);
      if (sample) {
        rec("sweep › lineCost › first line of the first itemised seed order", () => approvals.lineCost(sample.lines[0]));
        for (const status of LINE_STATUSES) {
          rec(`sweep › sumLinesByStatus › ${sample.id} ${status}`, () => approvals.sumLinesByStatus(sample.lines, status));
        }
      }

      for (const approved of [0, 1_000, 10_000]) {
        for (const actual of [0, 1_000, 1_150, 1_150.01, 1_500]) {
          for (const pct of [0, 15, 100]) {
            rec(`sweep › varianceExceeds › approved ${approved}, actual ${actual}, ${pct}%`, () =>
              approvals.varianceExceeds(approved, actual, pct)
            );
          }
        }
      }
    });

    it("business hours across weekends and after-hours", () => {
      // 2026-10-08 is a Thursday.
      const spans: [string, string, string][] = [
        ["same day inside hours", "2026-10-08T09:00:00", "2026-10-08T11:30:00"],
        ["clamped to 08:00–18:00", "2026-10-08T07:00:00", "2026-10-08T19:00:00"],
        ["overnight after-hours only", "2026-10-08T20:00:00", "2026-10-09T07:00:00"],
        ["evening into next morning", "2026-10-08T17:30:00", "2026-10-09T08:30:00"],
        ["Friday afternoon to Monday morning", "2026-10-09T17:00:00", "2026-10-12T09:00:00"],
        ["inside a weekend", "2026-10-10T10:00:00", "2026-10-11T15:00:00"],
        ["Saturday to Monday", "2026-10-10T10:00:00", "2026-10-12T10:00:00"],
        ["one full working week", "2026-10-12T08:00:00", "2026-10-19T08:00:00"],
        ["two weeks, mid-day to mid-day", "2026-10-07T13:00:00", "2026-10-21T13:00:00"],
        ["starts exactly at close", "2026-10-08T18:00:00", "2026-10-09T09:00:00"],
        ["ends exactly at open", "2026-10-08T12:00:00", "2026-10-09T08:00:00"],
        ["20 minutes (rounds to 0.3)", "2026-10-08T09:00:00", "2026-10-08T09:20:00"],
        ["5 minutes (rounds to 0.1)", "2026-10-08T09:00:00", "2026-10-08T09:05:00"],
        ["2 minutes (rounds to 0)", "2026-10-08T09:00:00", "2026-10-08T09:02:00"],
        ["3 minutes (0.05 rounds half up)", "2026-10-08T09:00:00", "2026-10-08T09:03:00"],
        ["across month end", "2026-10-30T16:00:00", "2026-11-02T10:00:00"],
        ["across year end", "2026-12-31T16:00:00", "2027-01-04T10:00:00"],
        ["identical instants", "2026-10-08T10:00:00", "2026-10-08T10:00:00"],
        ["reversed span", "2026-10-08T12:00:00", "2026-10-08T10:00:00"],
        ["seconds and milliseconds", "2026-10-08T09:00:30.500", "2026-10-08T10:15:45.250"],
      ];
      for (const [label, from, to] of spans) {
        rec(`sweep › businessHoursBetween › ${label}`, () => approvals.businessHoursBetween(manila(from), manila(to)));
      }
    });
  });

  describe("billing", () => {
    const rates: [string, Partial<WorkOrderLine>][] = [
      ["parts and labour", { quantity: 2, unitPartRate: 1_250, labourHours: 1.5, labourRate: 650 }],
      ["3 × 0.335 (= 1.005)", { quantity: 3, unitPartRate: 0.335 }],
      ["1 × 1.005", { quantity: 1, unitPartRate: 1.005 }],
      ["1 × 2.675", { quantity: 1, unitPartRate: 2.675 }],
      ["1 × 1.015", { quantity: 1, unitPartRate: 1.015 }],
      ["1 × 0.005", { quantity: 1, unitPartRate: 0.005 }],
      ["7 × 0.145", { quantity: 7, unitPartRate: 0.145 }],
      ["1.5 h × 333.33", { labourHours: 1.5, labourRate: 333.33 }],
      ["0.25 h × 650", { labourHours: 0.25, labourRate: 650 }],
      ["2.5 × 199.99", { quantity: 2.5, unitPartRate: 199.99 }],
      ["0.1 + 0.2 style float", { quantity: 3, unitPartRate: 0.1, labourHours: 1, labourRate: 0.2 }],
      ["zero quantity", { quantity: 0, unitPartRate: 500 }],
      ["large order", { quantity: 12, unitPartRate: 98_765.43, labourHours: 37.25, labourRate: 1_234.56 }],
    ];

    it("line amounts and recalcLine", () => {
      for (const [label, r] of rates) {
        const l = line(r);
        rec(`sweep › linePartAmount › ${label}`, () => billing.linePartAmount(l));
        rec(`sweep › lineLabourAmount › ${label}`, () => billing.lineLabourAmount(l));
        rec(`sweep › lineAmount › ${label}`, () => billing.lineAmount(l));
        rec(`sweep › recalcLine › ${label}`, () => billing.recalcLine(l));
      }
      for (const value of [1.005, 2.675, 1.015, 0.005, 0.015, 1.255, 10.235, -1.005, 0.1 + 0.2, 1_234.565, 99_999.995, 0, -0]) {
        rec(`sweep › roundMoney › ${value}`, () => billing.roundMoney(value));
      }
    });

    it("withRates on legacy rows", () => {
      const legacy = (partCost: number, labourCost: number, extra: Partial<WorkOrderLine> = {}) => {
        const { quantity: _q, unitPartRate: _u, labourHours: _h, labourRate: _r, ...rest } = line({
          partCost,
          labourCost,
          ...extra,
        });
        return rest;
      };
      rec("sweep › withRates › parts only, no rates", () => billing.withRates(legacy(1_234.56, 0)));
      rec("sweep › withRates › labour only, no hours", () => billing.withRates(legacy(0, 975)));
      rec("sweep › withRates › both, no rates", () => billing.withRates(legacy(2_450, 1_300)));
      rec("sweep › withRates › nothing billed", () => billing.withRates(legacy(0, 0)));
      rec("sweep › withRates › quantity 3 of 100 does not divide evenly", () =>
        billing.withRates({ ...legacy(100, 0), quantity: 3 })
      );
      rec("sweep › withRates › quantity 0 with a part cost", () => billing.withRates({ ...legacy(500, 0), quantity: 0 }));
      rec("sweep › withRates › rates already present are kept", () =>
        billing.withRates(line({ quantity: 2, unitPartRate: 380, labourHours: 1, labourRate: 650, partCost: 760, labourCost: 650 }))
      );
      rec("sweep › withRates › labour rate given, hours absent", () =>
        billing.withRates({ ...legacy(0, 975), labourRate: 650 })
      );
    });

    it("totals under every VAT and misc setting", () => {
      const settings: [string, Pick<ApprovalSettings, "vatRatePct" | "miscFeeFlat">][] = [
        ["VAT 12%, no misc", { vatRatePct: 12, miscFeeFlat: 0 }],
        ["VAT 12%, misc 150", { vatRatePct: 12, miscFeeFlat: 150 }],
        ["VAT 0%, no misc", { vatRatePct: 0, miscFeeFlat: 0 }],
        ["VAT 0%, misc 150", { vatRatePct: 0, miscFeeFlat: 150 }],
        ["VAT 12%, misc 99.995", { vatRatePct: 12, miscFeeFlat: 99.995 }],
      ];
      const sets: [string, WorkOrderLine[]][] = [
        ["no lines", []],
        ["one line", [line({ quantity: 2, unitPartRate: 1_250, labourHours: 1.5, labourRate: 650, approvalStatus: "approved" })]],
        [
          "mixed statuses",
          [
            line({ quantity: 1, unitPartRate: 2_450, labourHours: 1, labourRate: 650, approvalStatus: "approved" }),
            line({ quantity: 4, unitPartRate: 85, approvalStatus: "declined" }),
            line({ quantity: 1, unitPartRate: 720, labourHours: 0.5, labourRate: 650, approvalStatus: "pending" }),
            line({ quantity: 1, unitPartRate: 1_800, approvalStatus: "deferred" }),
          ],
        ],
        [
          "per-line rounding would drift (three × 0.335 × 3)",
          [1, 2, 3].map(() => line({ quantity: 3, unitPartRate: 0.335, approvalStatus: "approved" })),
        ],
        [
          "sub-centavo labour on every line",
          [1, 2, 3, 4].map(() => line({ labourHours: 0.333, labourRate: 650, approvalStatus: "approved" })),
        ],
      ];
      const statusSets: [string, LineApprovalStatus[] | undefined][] = [
        ["all lines", undefined],
        ["approved", ["approved"]],
        ["approved + pending", ["approved", "pending"]],
        ["no statuses", []],
      ];
      for (const [setLabel, lines] of sets) {
        for (const [settingsLabel, s] of settings) {
          for (const [statusLabel, statuses] of statusSets) {
            rec(`sweep › computeTotals › ${setLabel} · ${settingsLabel} · ${statusLabel}`, () =>
              statuses === undefined ? billing.computeTotals(lines, s) : billing.computeTotals(lines, s, statuses)
            );
          }
          rec(`sweep › approvedGrandTotal › ${setLabel} · ${settingsLabel}`, () => billing.approvedGrandTotal(lines, s));
        }
      }
      for (const [settingsLabel, s] of settings) {
        for (const [p, l] of [[0, 0], [0.005, 0], [1_234.5, 650], [0.004, 0.004], [99_999.99, 0.01]] as [number, number][]) {
          rec(`sweep › totalsFromSubtotal › parts ${p}, labour ${l} · ${settingsLabel}`, () =>
            billing.totalsFromSubtotal(p, l, s)
          );
        }
      }
    });

    it("every seed order under its client's effective settings", () => {
      const owner = clientOfVehicle();
      for (const order of state.workOrders) {
        const s = settingsFor(owner.get(order.vehicleId) ?? "");
        if (order.lines.length > 0) {
          rec(`sweep › computeTotals › ${order.id}`, () => billing.computeTotals(order.lines, s));
          rec(`sweep › computeTotals › ${order.id} approved only`, () => billing.computeTotals(order.lines, s, ["approved"]));
          rec(`sweep › approvedGrandTotal › ${order.id}`, () => billing.approvedGrandTotal(order.lines, s));
        } else {
          rec(`sweep › totalsFromSubtotal › ${order.id}`, () =>
            billing.totalsFromSubtotal(pms.resolvePartsCost(order), order.laborCost, s)
          );
        }
      }
    });
  });

  describe("checkin", () => {
    it("normalisation of every seed plate and VIN", () => {
      for (const v of state.vehicles) {
        for (const input of [v.plateNumber, v.plateNumber.toLowerCase(), v.plateNumber.replace(/\s/g, "-"), ` ${v.plateNumber.replace(/\s/g, "  ")} `]) {
          rec(`sweep › normalisePlate › "${input}"`, () => checkin.normalisePlate(input));
        }
        for (const input of [v.vin, v.vin.toLowerCase(), `${v.vin.slice(0, 8)} ${v.vin.slice(8)}`]) {
          rec(`sweep › normaliseVin › "${input}"`, () => checkin.normaliseVin(input));
        }
      }
    });

    it("lookups, hits and misses, and the forms they hydrate", () => {
      const lookup = (label: string, input: string, vehicles: Vehicle[] = state.vehicles) => {
        const result = rec(`sweep › lookupVehicle › ${label}`, () =>
          checkin.lookupVehicle(input, vehicles, state.fleetClients, now)
        );
        rec(`sweep › hydrateCheckInForm › ${label}`, () => checkin.hydrateCheckInForm(result));
      };
      for (const v of state.vehicles) {
        lookup(`${v.id} by plate as printed`, v.plateNumber);
        lookup(`${v.id} by plate, lower-case with dashes`, v.plateNumber.toLowerCase().replace(/\s/g, "-"));
        lookup(`${v.id} by VIN`, v.vin.toLowerCase());
      }
      lookup("empty input", "");
      lookup("whitespace only", "     ");
      lookup("two characters", "AB");
      lookup("three characters, no match", "ABC");
      lookup("partial plate", state.vehicles[0].plateNumber.slice(0, 4));
      lookup("unknown plate", "ZZZ 9999");
      lookup("unknown 17-character VIN", "1hgcm82633a004352");
      lookup("padded plate", `   ${state.vehicles[1].plateNumber}   `);

      const actimed = state.vehicles.filter((v) => v.fleetClientId === "fc-actimed");
      const sibling = state.vehicles.find((v) => v.fleetClientId !== "fc-actimed");
      if (sibling) {
        lookup("a sibling client's plate, from Actimed's scoped list", sibling.plateNumber, actimed);
      }
      for (const days of [14, 15]) {
        const v = vehicle({ odometerReadAt: isoDay(addDays(now, -days)) });
        lookup(`reading ${days} days old`, v.plateNumber, [v]);
      }
      rec("sweep › lookupVehicle › clients omitted", () => checkin.lookupVehicle(state.vehicles[0].plateNumber, state.vehicles));
    });

    it("suggested work for every vehicle", () => {
      for (const entry of health) {
        rec(`sweep › suggestedWorkAtCheckIn › ${entry.vehicle.id}`, () => checkin.suggestedWorkAtCheckIn(entry));
        rec(`sweep › suggestedWorkAtCheckIn › ${entry.vehicle.id}, limit 2`, () => checkin.suggestedWorkAtCheckIn(entry, 2));
      }
      rec("sweep › suggestedWorkAtCheckIn › no health", () => checkin.suggestedWorkAtCheckIn(null));
    });
  });

  describe("parts-forecast", () => {
    it("demand across horizons and scopes", () => {
      for (const weeks of [1, 2, 4, 6, 12]) {
        const rows = rec(`sweep › computePartsDemand › whole fleet, ${weeks} weeks`, () =>
          partsForecast.computePartsDemand(health, state.workOrders, state.purchaseOrders, state.parts, weeks, now)
        );
        rec(`sweep › summariseDemand › whole fleet, ${weeks} weeks`, () => partsForecast.summariseDemand(rows, weeks));
      }
      for (const client of state.fleetClients) {
        const rows = rec(`sweep › computePartsDemand › ${client.id}, 6 weeks`, () =>
          partsForecast.computePartsDemand(
            healthOfClient(client.id),
            ordersOfClient(client.id),
            state.purchaseOrders.filter((po) => po.fleetClientId === client.id),
            state.parts.filter((p) => p.fleetClientId === client.id),
            6,
            now
          )
        );
        rec(`sweep › summariseDemand › ${client.id}, 6 weeks`, () => partsForecast.summariseDemand(rows, 6));
      }
      rec("sweep › computePartsDemand › no work and no purchase orders covering anything", () =>
        partsForecast.computePartsDemand(health, [], [], state.parts, 6, now)
      );
      rec("sweep › summariseDemand › nothing due", () => partsForecast.summariseDemand([], 4));
    });
  });

  describe("shop", () => {
    it("per-order selectors over the seed book", () => {
      for (const order of state.workOrders) {
        rec(`sweep › isActiveJob › ${order.id}`, () => shop.isActiveJob(order));
        rec(`sweep › estimatedHours › ${order.id}`, () => shop.estimatedHours(order));
        rec(`sweep › startedAt › ${order.id}`, () => shop.startedAt(order));
        rec(`sweep › finishedAt › ${order.id}`, () => shop.finishedAt(order));
        rec(`sweep › authorisedValue › ${order.id}`, () => shop.authorisedValue(order));
        if (order.status === "in_progress") {
          rec(`sweep › elapsedMinutes › ${order.id}`, () => shop.elapsedMinutes(order, now));
        }
      }
      for (const minutes of [null, 0, 1, 59, 60, 61, 125, 180, 1_440]) {
        rec(`sweep › formatDuration › ${minutes}`, () => shop.formatDuration(minutes));
      }
    });

    it("the floor, day by day", () => {
      for (let offset = -3; offset <= 7; offset++) {
        const day = addDays(now, offset);
        const label = isoDay(day);
        rec(`sweep › jobsScheduledFor › ${label}`, () => shop.jobsScheduledFor(state.workOrders, day));
        rec(`sweep › bayLoadFor › ${label}`, () => shop.bayLoadFor(state.workOrders, day));
        rec(`sweep › floorUtilisation › ${label}`, () => shop.floorUtilisation(state.workOrders, day));
        rec(`sweep › arrivingToday › ${label}`, () => shop.arrivingToday(state.workOrders, day));
      }
      rec("sweep › utilisationSeries › 14 days", () => shop.utilisationSeries(state.workOrders, 14, now));
      rec("sweep › utilisationSeries › 7 days", () => shop.utilisationSeries(state.workOrders, 7, now));
      rec("sweep › today › frozen clock", () => shop.today(now));
      rec("sweep › today › late evening", () => shop.today(manila("2026-10-08T23:59:59")));
    });

    it("queues, revenue and rollups", () => {
      rec("sweep › inProgress › whole book", () => shop.inProgress(state.workOrders));
      rec("sweep › readyForCollection › whole book", () => shop.readyForCollection(state.workOrders));
      rec("sweep › awaitingApproval › now", () => shop.awaitingApproval(state.workOrders, now));
      rec("sweep › awaitingApproval › two days later", () => shop.awaitingApproval(state.workOrders, addDays(now, 2)));

      const windows: [string, Date, Date][] = [
        ["month to date", startOfMonth(now), now],
        ["last 7 days", subDays(now, 7), now],
        ["last 30 days", subDays(now, 30), now],
        ["last 90 days", subDays(now, 90), now],
        ["previous month", startOfMonth(addMonths(now, -1)), startOfMonth(now)],
        ["last 365 days", subDays(now, 365), now],
      ];
      for (const [label, from, to] of windows) {
        rec(`sweep › revenueBetween › ${label}`, () => shop.revenueBetween(state.workOrders, from, to));
        rec(`sweep › rollupClients › ${label}`, () =>
          shop.rollupClients(state.fleetClients, state.vehicles, state.workOrders, from, to)
        );
        rec(`sweep › revenueByClient › ${label}`, () =>
          shop.revenueByClient(state.fleetClients, state.vehicles, state.workOrders, from, to)
        );
        rec(`sweep › revenueByServiceItem › ${label}`, () => shop.revenueByServiceItem(state.workOrders, from, to));
        rec(`sweep › technicianLoad › ${label}`, () =>
          shop.technicianLoad(
            [...new Set([...TECHNICIAN_NAMES, ...state.workOrders.map((o) => o.technician)])],
            state.workOrders,
            from,
            to
          )
        );
      }
      rec("sweep › approvalTurnaroundByClient › whole book", () =>
        shop.approvalTurnaroundByClient(state.fleetClients, state.vehicles, state.workOrders)
      );
      rec("sweep › partsMargin › whole book", () => shop.partsMargin(state.workOrders));
      for (const client of state.fleetClients) {
        rec(`sweep › partsMargin › ${client.id}`, () => shop.partsMargin(ordersOfClient(client.id)));
        rec(`sweep › awaitingApproval › ${client.id}`, () => shop.awaitingApproval(ordersOfClient(client.id), now));
      }
      for (const entry of health) {
        rec(`sweep › serviceableItems › ${entry.vehicle.id}`, () => shop.serviceableItems(entry));
      }
      rec("sweep › serviceableItems › no health", () => shop.serviceableItems(undefined));
    });
  });

  describe("analytics", () => {
    it("fleet-wide and per-client reports", () => {
      const scopes: [string, WorkOrder[], VehicleHealth[], Vehicle[]][] = [
        ["whole fleet", state.workOrders, health, state.vehicles],
        ...state.fleetClients.map((c): [string, WorkOrder[], VehicleHealth[], Vehicle[]] => [
          c.id,
          ordersOfClient(c.id),
          healthOfClient(c.id),
          state.vehicles.filter((v) => v.fleetClientId === c.id),
        ]),
      ];
      for (const [label, orders, h, vehicles] of scopes) {
        rec(`sweep › monthlyCosts › ${label}, 12 months`, () => analytics.monthlyCosts(orders, 12, now));
        rec(`sweep › spendByVehicle › ${label}`, () => analytics.spendByVehicle(orders, h));
        rec(`sweep › spendByCategory › ${label}`, () => analytics.spendByCategory(orders));
        rec(`sweep › upcomingLoad › ${label}`, () => analytics.upcomingLoad(h, 6, now));
        rec(`sweep › urgentItems › ${label}`, () => analytics.urgentItems(h));
        rec(`sweep › serviceDemand › ${label}`, () => analytics.serviceDemand(h));
        rec(`sweep › rollingSpend › ${label}, 30 days`, () => analytics.rollingSpend(orders, 30, now));
        rec(`sweep › fleetKmInPeriod › ${label}, 30 days`, () => analytics.fleetKmInPeriod(vehicles, 30));
        rec(`sweep › serviceFrequency › ${label}`, () => analytics.serviceFrequency(orders, h));
        rec(`sweep › meanDaysBetweenServices › ${label}`, () =>
          analytics.meanDaysBetweenServices(orders, vehicles.length)
        );
      }
      rec("sweep › monthlyCosts › whole fleet, 6 months", () => analytics.monthlyCosts(state.workOrders, 6, now));
      rec("sweep › monthlyCosts › defaults", () => analytics.monthlyCosts(state.workOrders));
      rec("sweep › spendByVehicle › every vehicle", () => analytics.spendByVehicle(state.workOrders, health, 100));
      rec("sweep › upcomingLoad › 12 weeks", () => analytics.upcomingLoad(health, 12, now));
      for (const days of [7, 90]) {
        rec(`sweep › rollingSpend › whole fleet, ${days} days`, () => analytics.rollingSpend(state.workOrders, days, now));
      }
      for (const days of [1, 365]) {
        rec(`sweep › fleetKmInPeriod › whole fleet, ${days} days`, () => analytics.fleetKmInPeriod(state.vehicles, days));
      }
      rec("sweep › serviceFrequency › every vehicle", () => analytics.serviceFrequency(state.workOrders, health, 100));
      rec("sweep › meanDaysBetweenServices › 6 months", () => analytics.meanDaysBetweenServices(state.workOrders, 32, 6));
      rec("sweep › meanDaysBetweenServices › no vehicles", () => analytics.meanDaysBetweenServices(state.workOrders, 0));
      rec("sweep › meanDaysBetweenServices › no orders", () => analytics.meanDaysBetweenServices([], 32));
    });
  });

  describe("alerts", () => {
    it("whole fleet and per client — ids must match exactly", () => {
      rec("sweep › buildAlerts › whole fleet", () =>
        alerts.buildAlerts(health, state.workOrders, state.documents, state.approvalSettings, now)
      );
      for (const sla of [0, 2, 8, 40]) {
        rec(`sweep › buildAlerts › whole fleet, SLA ${sla}h`, () =>
          alerts.buildAlerts(health, state.workOrders, state.documents, { ...state.approvalSettings, slaHours: sla }, now)
        );
      }
      for (const client of state.fleetClients) {
        const built = rec(`sweep › buildAlerts › ${client.id}`, () =>
          alerts.buildAlerts(
            healthOfClient(client.id),
            ordersOfClient(client.id),
            state.documents.filter((d) => d.fleetClientId === client.id),
            settingsFor(client.id),
            now
          )
        );
        const ids = built.map((a) => a.id);
        rec(`sweep › viewAlerts › ${client.id}, untouched`, () => alerts.viewAlerts(built, { readIds: [], dismissedIds: [] }));
        rec(`sweep › viewAlerts › ${client.id}, some read and dismissed, plus a stale dismissal`, () =>
          alerts.viewAlerts(built, {
            readIds: ids.filter((_, i) => i % 3 === 0),
            dismissedIds: [...ids.filter((_, i) => i % 4 === 1), "pms:veh-gone:oil-filter"],
          })
        );
      }
    });
  });

  describe("tenancy", () => {
    const otherProvider: Provider = {
      id: "prov-other",
      name: "Other Motorworks",
      slug: "other",
      logoUrl: null,
      brandColor: "#aa3300",
      supportEmail: "help@other.example",
      createdAt: "2025-01-01",
    };
    const otherClient = (): FleetClient => ({
      ...state.fleetClients[0],
      id: "fc-other",
      providerId: otherProvider.id,
      name: "Other Fleet",
      slug: "other-fleet",
    });

    function sessions(): [string, Session | null][] {
      const owner = sessionFor(DEMO_ACCOUNTS[0]);
      const actimedManager = DEMO_ACCOUNTS.find((a) => a.fleetClientId === "fc-actimed" && a.role === "fleet_manager");
      const manager = sessionFor(actimedManager ?? DEMO_ACCOUNTS[3]);
      return [
        ...DEMO_ACCOUNTS.map((a): [string, Session] => [`demo ${a.email} (${a.role})`, sessionFor(a)]),
        ["no session", null],
        ["no provider", { ...owner, providerId: null }],
        ["unknown provider", { ...owner, providerId: "prov-ghost" }],
        ["unknown client", { ...manager, fleetClientId: "fc-ghost" }],
        ["client belongs to another provider", { ...manager, providerId: otherProvider.id }],
        ["client-side role with no client (role/side mismatch)", { ...manager, fleetClientId: null }],
        ["provider-side role pinned to one client", { ...owner, fleetClientId: "fc-northwind" }],
        ["provider-side role pinned to the suspended client", { ...owner, fleetClientId: "fc-bayani" }],
      ];
    }

    it("scope resolution for every demo account and every denial", () => {
      const providers = [...state.providers, otherProvider];
      const clients = [...state.fleetClients, otherClient()];
      const resolve = golden.original<typeof tenancy.resolveTenantScope>("tenancy", "resolveTenantScope");
      const accounts = DEMO_ACCOUNTS.map(({ password: _password, ...account }) => account);
      const withAlerts: FleetState = {
        ...state,
        alerts: {
          "provider:prov-mekanikomore": { readIds: ["doc:x"], dismissedIds: ["pms:a:b"] },
          "client:fc-actimed": { readIds: ["wo:y"], dismissedIds: [] },
        },
      };

      for (const [label, session] of sessions()) {
        rec(`sweep › explainTenantScope › ${label}`, () => tenancy.explainTenantScope(session, providers, clients));
        rec(`sweep › resolveTenantScope › ${label}`, () => tenancy.resolveTenantScope(session, providers, clients));
        const scope = resolve(session, providers, clients);
        rec(`sweep › visibleFleetClientIds › ${label}`, () => tenancy.visibleFleetClientIds(scope, clients));
        if (scope) rec(`sweep › tenantScopeKey › ${label}`, () => tenancy.tenantScopeKey(scope));
        rec(`sweep › effectiveApprovalSettings › ${label}`, () => tenancy.effectiveApprovalSettings(state, scope));
        rec(`sweep › providerBranding › ${label}`, () => tenancy.providerBranding(state, scope));
        rec(`sweep › alertsForScope › ${label}`, () => tenancy.alertsForScope(withAlerts, scope));
        rec(`sweep › scopeAccounts › ${label}`, () => tenancy.scopeAccounts(accounts, scope));
        rec(`sweep › scopeFleetState › ${label}`, () => tenancy.scopeFleetState(state, scope));
      }
      for (const role of [...ROLES, undefined]) {
        rec(`sweep › isProviderRole › ${role}`, () => tenancy.isProviderRole(role));
      }
    });

    it("per-client approval overrides fold over the defaults", () => {
      for (const client of state.fleetClients) {
        rec(`sweep › approvalSettingsForClient › ${client.id}`, () =>
          tenancy.approvalSettingsForClient(client, state.approvalSettings)
        );
      }
      const base = state.fleetClients[0];
      const overrides: [string, FleetClient["approvalThresholdOverrides"]][] = [
        ["no override", null],
        ["empty override", {}],
        ["partial override", { autoApproveUnder: 10_000 }],
        ["explicit zero is a real value, not unset", { autoApproveUnder: 0, vatRatePct: 0 }],
        ["full override", { autoApproveUnder: 2_000, opsApprovalUnder: 20_000, slaHours: 8, varianceThresholdPct: 10 }],
      ];
      for (const [label, approvalThresholdOverrides] of overrides) {
        rec(`sweep › approvalSettingsForClient › ${label}`, () =>
          tenancy.approvalSettingsForClient({ ...base, approvalThresholdOverrides }, state.approvalSettings)
        );
      }
    });
  });

  describe("rbac", () => {
    it("every role × capability", () => {
      for (const role of [...ROLES, undefined]) {
        for (const capability of rbac.ALL_CAPABILITIES) {
          rec(`sweep › can › ${role} ${capability}`, () => rbac.can(role, capability));
          rec(`sweep › denialReason › ${role} ${capability}`, () => rbac.denialReason(role, capability));
        }
      }
    });
  });
});

/* ------------------------------------------------------------------ write */

const MODULES: [string, Record<string, unknown>, Record<string, unknown>?][] = [
  ["pms", pms],
  ["interval-status", intervalStatus],
  ["odometer-validation", odometer],
  ["compliance", compliance],
  ["work-order-machine", machine],
  ["approvals", approvals],
  ["billing", billing],
  ["checkin", checkin],
  ["parts-forecast", partsForecast],
  ["parts", parts],
  // The bay catalogue is a static input to every floor calculation in shop.ts.
  ["shop", shop, { BAYS, TOTAL_BAY_CAPACITY_HOURS }],
  ["analytics", analytics],
  ["alerts", alerts],
  ["tenancy", tenancy],
  ["rbac", rbac],
];

function constantsOf(exports: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries({ ...exports, ...extra })) {
    if (typeof value !== "function") out[name] = value;
  }
  return out;
}

/** One case per line: compact enough to commit, still diffable case by case. */
function serialise(cases: GoldenCase[]): string {
  return `[\n${cases.map((c) => JSON.stringify(c)).join(",\n")}\n]\n`;
}

afterAll(() => {
  const byModule = golden.casesByModule();
  mkdirSync(OUT_DIR, { recursive: true });

  const summary: string[] = [];
  for (const [module, exports, extra] of MODULES) {
    const recorded = byModule.get(module) ?? [];
    const cases: GoldenCase[] = [
      {
        case: "frozen clock",
        fn: "$clock",
        input: null,
        output: { frozenAt: FROZEN_AT, timezone: TIMEZONE, seed: "fixtures/seed/demo-seed.json" },
      },
      { case: "exported constants", fn: "$constants", input: null, output: golden.encodeConstant("$constants", constantsOf(exports, extra)) },
      ...recorded,
    ];
    const text = serialise(cases);
    writeFileSync(resolve(OUT_DIR, `${module}.json`), text);

    const fromTests = recorded.filter((c) => !c.case.startsWith("sweep ›")).length;
    const fns = [...new Set(recorded.map((c) => c.fn))].sort();
    summary.push(
      `| \`${module}\` | ${recorded.length} | ${fromTests} | ${recorded.length - fromTests} | ${(text.length / 1024).toFixed(0)} KiB | ${fns.map((f) => `\`${f}\``).join(", ")} |`
    );
  }

  // Coverage: every test that ran, and whether it produced a case.
  const uncovered = [...new Set(golden.testsSeen)].filter(
    (name) => name.startsWith("lib/") && !golden.isCovered(name)
  );
  const totalTests = new Set(golden.testsSeen.filter((name) => name.startsWith("lib/"))).size;
  const reasons: [RegExp, string][] = [
    [/^lib\/rls-parity\.test\.ts/, "Asserts the text of the SQL migrations (RLS policies, grants). No domain function is called; the API's own isolation suite owns this."],
    [/^lib\/seed\.test\.ts/, "An invariant over the generated seed. The seed itself is exported verbatim as fixtures/seed/demo-seed.json; the API should re-assert these invariants against what it loads."],
  ];
  const lines = [
    "# Golden fixture coverage",
    "",
    "Generated by `scripts/emit-golden-fixtures.ts` — do not edit by hand.",
    "",
    `Clock frozen at \`${FROZEN_AT}\` (${TIMEZONE}).`,
    "",
    "## Cases per module",
    "",
    "Each file also opens with a `$clock` and a `$constants` case, not counted here.",
    "",
    "| Module | Cases | From existing tests | From sweeps | Size | Functions |",
    "|---|---:|---:|---:|---:|---|",
    ...summary,
    "",
    "## Existing tests",
    "",
    `${totalTests - uncovered.length} of ${totalTests} \`it(...)\` blocks in \`lib/*.test.ts\` produced at least one case (named after the test).`,
    "",
    uncovered.length ? "Tests with no golden case, and why:" : "Every test produced a case.",
    "",
    ...uncovered.map((name) => {
      const reason = reasons.find(([pattern]) => pattern.test(name))?.[1] ?? "UNEXPLAINED — investigate.";
      return `- ${name} — ${reason}`;
    }),
    "",
  ];
  writeFileSync(resolve(OUT_DIR, "COVERAGE.md"), lines.join("\n"));

  const unexplained = uncovered.filter((name) => !reasons.some(([pattern]) => pattern.test(name)));
  if (unexplained.length) {
    throw new Error(`Tests with no golden case and no recorded reason:\n${unexplained.join("\n")}`);
  }
});
