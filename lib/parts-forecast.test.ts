import { describe, expect, it } from "vitest";
import { formatISO } from "date-fns";
import type { Part, PmsItem, PurchaseOrder, Vehicle, VehicleHealth, WorkOrder } from "@/types";
import { TASK_BY_ID } from "@/lib/service-tasks";
import { PART_BY_ID } from "@/lib/parts";
import { computePartsDemand, summariseDemand } from "@/lib/parts-forecast";

const TODAY = new Date("2026-08-06");
const OIL_TASK = TASK_BY_ID.get("oil-filter")!; // consumes p-oil-filter(1), p-engine-oil(5), p-drain-gasket(1)

function iso(daysFromToday: number) {
  return formatISO(new Date(TODAY.getTime() + daysFromToday * 86_400_000), {
    representation: "date",
  });
}

function pmsItem(overrides: Partial<PmsItem> = {}): PmsItem {
  return {
    task: OIL_TASK,
    status: "due_soon",
    kmRemaining: 500,
    daysRemaining: 10,
    progress: 0.9,
    dueOdometer: 55_000,
    dueDate: iso(10),
    governedBy: "distance",
    lastDoneOn: "2026-01-01",
    lastDoneOdometer: 50_000,
    ...overrides,
  };
}

function vehicleHealth(vehicleId: string, items: PmsItem[]): VehicleHealth {
  const vehicle = { id: vehicleId } as Vehicle;
  return {
    vehicle,
    items,
    status: "due_soon",
    overdueCount: 0,
    dueSoonCount: items.length,
    nextItem: items[0] ?? null,
    healthScore: 90,
  };
}

function part(id: string, overrides: Partial<Part> = {}): Part {
  const def = PART_BY_ID.get(id)!;
  return {
    id: def.id,
    fleetClientId: "fc-actimed",
    sku: def.sku,
    name: def.name,
    category: def.category,
    unit: def.unit,
    unitCost: def.unitCost,
    currentStock: 5,
    reorderPoint: def.reorderPoint,
    preferredVendor: def.preferredVendor,
    leadTimeDays: def.leadTimeDays,
    ...overrides,
  };
}

/** Every part the oil-filter task consumes, so aggregation tests see all of them. */
function oilTaskParts(currentStock: number): Part[] {
  return [
    part("p-oil-filter", { currentStock }),
    part("p-engine-oil", { currentStock }),
    part("p-drain-gasket", { currentStock }),
  ];
}

function workOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: "wo-1",
    reference: "WO-TEST",
    vehicleId: "veh-1",
    title: "Test",
    type: "preventive",
    status: "scheduled",
    priority: "medium",
    openedOn: iso(0),
    scheduledFor: iso(2),
    scheduledTime: null,
    completedOn: null,
    odometerAtService: 0,
    technician: "Tester",
    vendor: "In-house Fleet Bay 1",
    assignedProviderId: "prov-mekanikomore",
    bayId: "bay-1",
    collectedAt: null,
    collectedBy: null,
    laborCost: 0,
    partsCost: 0,
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

function purchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    fleetClientId: "fc-actimed",
    reference: "PO-TEST",
    vendor: "Vendor",
    status: "sent",
    createdOn: iso(0),
    createdBy: "Tester",
    notes: "",
    lines: [
      {
        id: "line-1",
        partId: "p-oil-filter",
        description: "Engine oil filter",
        quantity: 1,
        unitCost: 380,
        serviceTaskIds: ["oil-filter"],
        vehicleIds: ["veh-1"],
      },
    ],
    ...overrides,
  };
}

describe("computePartsDemand", () => {
  it("aggregates required quantity and shortfall for a due item", () => {
    const health = [vehicleHealth("veh-1", [pmsItem()])];
    const rows = computePartsDemand(health, [], [], oilTaskParts(0), 6, TODAY);

    const filterRow = rows.find((r) => r.part.id === "p-oil-filter")!;
    expect(filterRow.quantityRequired).toBe(1);
    expect(filterRow.shortfall).toBe(1);
    expect(filterRow.estimatedCost).toBe(380);

    const oilRow = rows.find((r) => r.part.id === "p-engine-oil")!;
    expect(oilRow.quantityRequired).toBe(5);
  });

  it("excludes items already covered by a live work order", () => {
    const health = [vehicleHealth("veh-1", [pmsItem()])];
    const orders = [workOrder({ vehicleId: "veh-1", taskIds: ["oil-filter"], status: "scheduled" })];
    const rows = computePartsDemand(health, orders, [], oilTaskParts(0), 6, TODAY);
    expect(rows).toHaveLength(0);
  });

  it("does not exclude items whose covering work order is already closed", () => {
    const health = [vehicleHealth("veh-1", [pmsItem()])];
    const orders = [workOrder({ vehicleId: "veh-1", taskIds: ["oil-filter"], status: "closed" })];
    const rows = computePartsDemand(health, orders, [], oilTaskParts(0), 6, TODAY);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("excludes items already covered by an open purchase order", () => {
    const health = [vehicleHealth("veh-1", [pmsItem()])];
    const pos = [purchaseOrder({ status: "sent" })];
    const rows = computePartsDemand(health, [], pos, oilTaskParts(0), 6, TODAY);
    expect(rows).toHaveLength(0);
  });

  it("does not exclude items whose covering PO was cancelled", () => {
    const health = [vehicleHealth("veh-1", [pmsItem()])];
    const pos = [purchaseOrder({ status: "cancelled" })];
    const rows = computePartsDemand(health, [], pos, oilTaskParts(0), 6, TODAY);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("excludes items due beyond the horizon", () => {
    const health = [vehicleHealth("veh-1", [pmsItem({ dueDate: iso(200) })])];
    const rows = computePartsDemand(health, [], [], oilTaskParts(0), 6, TODAY);
    expect(rows).toHaveLength(0);
  });

  it("flags lead-time risk only when the shortfall lands inside the lead time", () => {
    const health = [vehicleHealth("veh-1", [pmsItem({ dueDate: iso(2) })])]; // leadTimeDays = 5
    const rows = computePartsDemand(health, [], [], oilTaskParts(0), 6, TODAY);
    const filterRow = rows.find((r) => r.part.id === "p-oil-filter")!;
    expect(filterRow.leadTimeRisk).toBe(true);
  });

  it("does not flag lead-time risk when stock already covers it", () => {
    const health = [vehicleHealth("veh-1", [pmsItem({ dueDate: iso(2) })])];
    const rows = computePartsDemand(health, [], [], oilTaskParts(10), 6, TODAY);
    const filterRow = rows.find((r) => r.part.id === "p-oil-filter")!;
    expect(filterRow.shortfall).toBe(0);
    expect(filterRow.leadTimeRisk).toBe(false);
  });
});

describe("summariseDemand", () => {
  it("reports nothing due when there is no demand", () => {
    expect(summariseDemand([], 6)).toBe("Next 6 weeks — nothing due that isn't already covered.");
  });

  it("names the top parts and the coverage of the most-constrained one", () => {
    const health = [vehicleHealth("veh-1", [pmsItem()])];
    const rows = computePartsDemand(health, [], [], oilTaskParts(0), 6, TODAY);
    const summary = summariseDemand(rows, 6);

    expect(summary.startsWith("Next 6 weeks —")).toBe(true);
    expect(summary).toContain("Current stock covers");
  });
});
