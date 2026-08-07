import { describe, expect, it } from "vitest";
import type { FleetClient, Vehicle, WorkOrder } from "@/types";
import {
  authorisedValue,
  awaitingApproval,
  bayLoadFor,
  elapsedMinutes,
  floorUtilisation,
  formatDuration,
  isActiveJob,
  partsMargin,
  readyForCollection,
  revenueBetween,
  revenueByServiceItem,
  rollupClients,
  technicianLoad,
  utilisationSeries,
} from "@/lib/shop";
import { TOTAL_BAY_CAPACITY_HOURS } from "@/lib/bays";

const TODAY = new Date("2026-08-07T10:00:00.000Z");

function order(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "wo-1",
    reference: "WO-TEST",
    vehicleId: "veh-1",
    title: "Engine oil & filter change",
    type: "preventive",
    status: "scheduled",
    priority: "medium",
    openedOn: "2026-08-05",
    scheduledFor: "2026-08-07",
    scheduledTime: "09:00",
    completedOn: null,
    odometerAtService: 10_000,
    technician: "Arnel Pascual",
    vendor: "In-house Fleet Bay 1",
    bayId: "bay-1",
    collectedAt: null,
    collectedBy: null,
    laborCost: 650,
    partsCost: 3_200,
    parts: [],
    findings: "",
    taskIds: ["oil-filter"],
    notes: "",
    history: [],
    lines: [],
    approvalLog: [],
    pendingApprovalEnteredAt: null,
    approvalWaitHours: null,
    ...overrides,
  };
}

function vehicle(id: string, fleetClientId: string): Vehicle {
  return {
    id,
    fleetClientId,
    plateNumber: id.toUpperCase(),
    make: "Toyota",
    model: "Hilux",
    year: 2022,
    vin: `VIN-${id}`,
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "White",
    driverLicenceExpiry: null,
    odometer: 10_000,
    odometerReadAt: "2026-08-01",
    avgDailyKm: 40,
    status: "active",
    assignedTo: "Driver",
    department: "Ops",
    location: "Hub",
    acquiredOn: "2024-01-01",
    registrationExpiry: "2027-01-01",
    insuranceExpiry: "2027-01-01",
    taskState: {},
  };
}

function client(id: string, name: string): FleetClient {
  return {
    id,
    providerId: "prov-a",
    name,
    slug: id,
    contactName: "",
    contactEmail: "",
    contractTerms: "",
    paymentTermsDays: 30,
    approvalThresholdOverrides: null,
    logoUrl: null,
    brandColor: null,
    status: "active",
    createdAt: "2024-01-01",
  };
}

describe("isActiveJob", () => {
  it("counts work that is still live on the floor", () => {
    expect(isActiveJob(order({ status: "in_progress" }))).toBe(true);
    expect(isActiveJob(order({ status: "pending_approval" }))).toBe(true);
    expect(isActiveJob(order({ status: "draft" }))).toBe(true);
  });

  it("excludes finished and abandoned work", () => {
    expect(isActiveJob(order({ status: "closed" }))).toBe(false);
    expect(isActiveJob(order({ status: "cancelled" }))).toBe(false);
    expect(isActiveJob(order({ status: "declined" }))).toBe(false);
  });
});

describe("elapsed time", () => {
  it("is null until the job actually starts", () => {
    expect(elapsedMinutes(order(), TODAY)).toBeNull();
  });

  it("counts from the in_progress event, not from when it was raised", () => {
    const started = order({
      status: "in_progress",
      history: [
        { id: "h1", status: "scheduled", at: "2026-08-07T06:00:00.000Z", actor: "A" },
        { id: "h2", status: "in_progress", at: "2026-08-07T08:30:00.000Z", actor: "A" },
      ],
    });
    expect(elapsedMinutes(started, TODAY)).toBe(90);
  });

  it("formats hours and minutes compactly", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(200)).toBe("3h 20m");
  });
});

describe("bay load", () => {
  it("books a job's catalogue hours against its bay", () => {
    // oil-filter is a 1-hour item in the catalogue.
    const loads = bayLoadFor([order()], TODAY);
    const bay1 = loads.find((load) => load.bayId === "bay-1");
    expect(bay1?.bookedHours).toBe(1);
  });

  it("ignores jobs scheduled on another day", () => {
    const loads = bayLoadFor([order({ scheduledFor: "2026-08-09" })], TODAY);
    expect(loads.every((load) => load.bookedHours === 0)).toBe(true);
  });

  it("does not charge out-sourced work against floor capacity", () => {
    const floor = floorUtilisation(
      [order({ bayId: null, vendor: "Toyota Shaw Service Center" })],
      TODAY
    );
    expect(floor.bookedHours).toBe(0);
    expect(floor.capacityHours).toBe(TOTAL_BAY_CAPACITY_HOURS);
  });

  it("excludes cancelled work from the day's booking", () => {
    const floor = floorUtilisation([order({ status: "cancelled" })], TODAY);
    expect(floor.bookedHours).toBe(0);
  });
});

describe("awaiting approval", () => {
  const line = {
    id: "l1",
    description: "Brakes",
    category: "brakes" as const,
    partCost: 4_000,
    labourCost: 1_000,
    urgency: "safety_critical" as const,
    partsSource: "supplier_provided" as const,
    approvalStatus: "pending" as const,
    approvedBy: null,
    approvedAt: null,
    declineReason: null,
    photoUrls: [],
  };

  it("totals only the pending value", () => {
    const result = awaitingApproval(
      [
        order({
          id: "wo-a",
          status: "pending_approval",
          lines: [line],
          pendingApprovalEnteredAt: "2026-08-07T08:00:00.000Z",
        }),
      ],
      TODAY
    );
    expect(result.count).toBe(1);
    expect(result.totalValue).toBe(5_000);
  });

  it("names the longest-waiting job rather than just counting", () => {
    const result = awaitingApproval(
      [
        order({
          id: "recent",
          status: "pending_approval",
          lines: [line],
          pendingApprovalEnteredAt: "2026-08-07T09:00:00.000Z",
        }),
        order({
          id: "stale",
          status: "pending_approval",
          lines: [line],
          pendingApprovalEnteredAt: "2026-08-05T08:00:00.000Z",
        }),
      ],
      TODAY
    );
    expect(result.longest?.order.id).toBe("stale");
    expect(result.longest?.hours).toBeGreaterThan(0);
  });

  it("reports nothing waiting when every quote is decided", () => {
    const result = awaitingApproval([order({ status: "approved" })], TODAY);
    expect(result.count).toBe(0);
    expect(result.longest).toBeNull();
  });
});

describe("collection", () => {
  it("lists closed work that has not been picked up", () => {
    const rows = readyForCollection([
      order({ id: "waiting", status: "closed", completedOn: "2026-08-06" }),
      order({
        id: "gone",
        status: "closed",
        completedOn: "2026-08-06",
        collectedAt: "2026-08-07T01:00:00.000Z",
      }),
      order({ id: "open", status: "in_progress" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["waiting"]);
  });

  it("recognises revenue on collection, not on completion", () => {
    const from = new Date("2026-08-01");
    const to = new Date("2026-08-31");

    const uncollected = revenueBetween(
      [order({ status: "closed", completedOn: "2026-08-06" })],
      from,
      to
    );
    expect(uncollected).toBe(0);

    const collected = revenueBetween(
      [
        order({
          status: "closed",
          completedOn: "2026-08-06",
          collectedAt: "2026-08-07T01:00:00.000Z",
        }),
      ],
      from,
      to
    );
    expect(collected).toBe(3_850);
  });
});

describe("client rollups", () => {
  const clients = [client("fc-a", "Alpha"), client("fc-b", "Beta")];
  const vehicles = [vehicle("veh-1", "fc-a"), vehicle("veh-2", "fc-b")];
  const orders = [
    order({ id: "a-open", vehicleId: "veh-1", status: "in_progress" }),
    order({
      id: "a-done",
      vehicleId: "veh-1",
      status: "closed",
      completedOn: "2026-08-05",
      collectedAt: "2026-08-06T02:00:00.000Z",
    }),
    order({
      id: "a-uncollected",
      vehicleId: "veh-1",
      status: "closed",
      completedOn: "2026-08-06",
    }),
    order({ id: "b-open", vehicleId: "veh-2", status: "scheduled" }),
  ];

  const rows = rollupClients(
    clients,
    vehicles,
    orders,
    new Date("2026-08-01"),
    new Date("2026-08-31")
  );

  it("attributes vehicles and open jobs to the right client", () => {
    const alpha = rows.find((row) => row.client.id === "fc-a");
    expect(alpha?.vehicleCount).toBe(1);
    expect(alpha?.openWorkOrders).toBe(1);
  });

  it("counts uncollected work as outstanding, not as spend", () => {
    const alpha = rows.find((row) => row.client.id === "fc-a");
    expect(alpha?.spendThisPeriod).toBe(3_850);
    expect(alpha?.outstanding).toBe(3_850);
  });

  it("never bleeds one client's work into another's row", () => {
    const beta = rows.find((row) => row.client.id === "fc-b");
    expect(beta?.spendThisPeriod).toBe(0);
    expect(beta?.outstanding).toBe(0);
  });
});

describe("technician load", () => {
  it("reports the job in hand and the period's closed count", () => {
    const [load] = technicianLoad(
      ["Arnel Pascual"],
      [
        order({ id: "running", status: "in_progress" }),
        order({
          id: "done",
          status: "closed",
          completedOn: "2026-08-05",
          history: [
            {
              id: "h1",
              status: "in_progress",
              at: "2026-08-05T02:00:00.000Z",
              actor: "A",
            },
            {
              id: "h2",
              status: "closed",
              at: "2026-08-05T03:30:00.000Z",
              actor: "A",
            },
          ],
        }),
      ],
      new Date("2026-08-01"),
      new Date("2026-08-31")
    );

    expect(load.current?.id).toBe("running");
    expect(load.completedThisPeriod).toBe(1);
    expect(load.avgEstimatedHours).toBe(1);
    // 02:00 to 03:30 in the bay, against a 1-hour catalogue estimate.
    expect(load.avgActualHours).toBe(1.5);
  });

  it("measures the bay time from the closed event, not the completion date", () => {
    // `completedOn` is a date; using it directly would make a job that ran
    // from 02:00 to 03:30 read as a negative duration and vanish.
    const [load] = technicianLoad(
      ["Arnel Pascual"],
      [
        order({
          status: "closed",
          completedOn: "2026-08-05",
          history: [
            { id: "h1", status: "in_progress", at: "2026-08-05T02:00:00.000Z", actor: "A" },
            { id: "h2", status: "closed", at: "2026-08-05T05:00:00.000Z", actor: "A" },
          ],
        }),
      ],
      new Date("2026-08-01"),
      new Date("2026-08-31")
    );
    expect(load.avgActualHours).toBe(3);
  });

  it("leaves averages null when nothing has a recorded start", () => {
    const [load] = technicianLoad(
      ["Arnel Pascual"],
      [order({ status: "closed", completedOn: "2026-08-05" })],
      new Date("2026-08-01"),
      new Date("2026-08-31")
    );
    expect(load.avgActualHours).toBeNull();
  });
});

describe("parts margin", () => {
  const makeLine = (partsSource: "own_stock" | "supplier_provided", partCost: number) => ({
    id: `l-${partsSource}`,
    description: "Part",
    category: "engine" as const,
    partCost,
    labourCost: 0,
    urgency: "recommended" as const,
    partsSource,
    approvalStatus: "approved" as const,
    approvedBy: "A",
    approvedAt: "2026-08-05T00:00:00.000Z",
    declineReason: null,
    photoUrls: [],
  });

  it("splits parts value by who supplied them", () => {
    const result = partsMargin([
      order({
        status: "closed",
        lines: [makeLine("supplier_provided", 10_000), makeLine("own_stock", 4_000)],
      }),
    ]);
    expect(result.supplierProvidedValue).toBe(10_000);
    expect(result.ownStockValue).toBe(4_000);
  });

  it("earns no margin on the client's own stock", () => {
    const ownOnly = partsMargin([
      order({ status: "closed", lines: [makeLine("own_stock", 10_000)] }),
    ]);
    expect(ownOnly.margin).toBe(0);
  });

  it("ignores work that is not closed", () => {
    const result = partsMargin([
      order({ status: "in_progress", lines: [makeLine("supplier_provided", 9_000)] }),
    ]);
    expect(result.supplierProvidedValue).toBe(0);
  });
});

describe("reporting cuts", () => {
  it("splits a multi-item job evenly across its service items", () => {
    const rows = revenueByServiceItem(
      [
        order({
          status: "closed",
          taskIds: ["oil-filter", "tire-rotation"],
          collectedAt: "2026-08-06T02:00:00.000Z",
        }),
      ],
      new Date("2026-08-01"),
      new Date("2026-08-31")
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBe(1_925);
  });

  it("produces one utilisation point per day, oldest first", () => {
    const series = utilisationSeries([order()], 3, TODAY);
    expect(series).toHaveLength(3);
    expect(series[series.length - 1].key).toBe("2026-08-07");
  });
});

describe("authorisedValue", () => {
  it("falls back to the job total when there are no lines", () => {
    expect(authorisedValue(order())).toBe(3_850);
  });
});
