import { describe, expect, it } from "vitest";
import { createSeedState } from "@/lib/seed";
import { evaluateFleet } from "@/lib/pms";
import { rollingSpend, serviceDemand, urgentItems } from "@/lib/analytics";
import type { WorkOrder } from "@/types";

const TODAY = new Date("2026-08-06");

function order(completedOn: string, cost: number): WorkOrder {
  return {
    id: completedOn + cost,
    reference: "WO-TEST",
    vehicleId: "veh-001",
    title: "Test",
    type: "preventive",
    status: "closed",
    priority: "medium",
    openedOn: completedOn,
    scheduledFor: completedOn,
    scheduledTime: null,
    completedOn,
    odometerAtService: 1_000,
    technician: "Tester",
    vendor: "In-house Fleet Bay 1",
    assignedProviderId: "prov-mekanikomore",
    bayId: "bay-1",
    collectedAt: null,
    collectedBy: null,
    laborCost: cost,
    partsCost: 0,
    parts: [],
    findings: "",
    taskIds: [],
    notes: "",
    history: [],
    lines: [],
    approvalLog: [],
    pendingApprovalEnteredAt: null,
    approvalWaitHours: null,
  };
}

describe("rollingSpend", () => {
  /**
   * The regression this guards: comparing a partly-elapsed calendar month
   * against a full previous month reported a ~96% collapse every time the month
   * turned over. Two equal trailing windows compare like with like.
   */
  it("compares two equal trailing windows, not calendar months", () => {
    const orders = [
      order("2026-08-05", 1_000), // inside the last 30 days
      order("2026-07-20", 1_000), // inside the last 30 days
      order("2026-06-20", 2_000), // inside the preceding 30 days
    ];

    const result = rollingSpend(orders, 30, TODAY);

    expect(result.current).toBe(2_000);
    expect(result.previous).toBe(2_000);
    expect(result.deltaPct).toBe(0);
    expect(result.windowDays).toBe(30);
  });

  it("ignores spend older than both windows", () => {
    const result = rollingSpend([order("2026-01-01", 9_999)], 30, TODAY);

    expect(result.current).toBe(0);
    expect(result.previous).toBe(0);
    expect(result.deltaPct).toBe(0);
  });

  it("reports a percentage change against the preceding window", () => {
    const result = rollingSpend(
      [order("2026-08-01", 1_500), order("2026-06-25", 1_000)],
      30,
      TODAY
    );

    expect(result.current).toBe(1_500);
    expect(result.previous).toBe(1_000);
    expect(result.deltaPct).toBe(50);
  });

  it("excludes work that has not been completed", () => {
    const open: WorkOrder = { ...order("2026-08-01", 5_000), status: "scheduled" };
    expect(rollingSpend([open], 30, TODAY).current).toBe(0);
  });
});

describe("serviceDemand", () => {
  const state = createSeedState(TODAY);
  const health = evaluateFleet(state.vehicles, TODAY);
  const demand = serviceDemand(health);

  /**
   * The regression this guards: the dashboard and the schedule each derived
   * their own outstanding-work figures and disagreed. Both now read this
   * selector, so the two screens cannot diverge.
   */
  it("partitions every non-compliant item into exactly one band", () => {
    const urgent = urgentItems(health);

    expect(demand.overdue.count + demand.dueSoon.count).toBe(urgent.length);
    expect(demand.overdue.items.every((e) => e.item.status === "overdue")).toBe(true);
    expect(demand.dueSoon.items.every((e) => e.item.status === "due_soon")).toBe(true);
  });

  it("counts distinct vehicles, not items", () => {
    for (const band of [demand.overdue, demand.dueSoon]) {
      expect(band.vehicleCount).toBeLessThanOrEqual(band.count);
      expect(band.vehicleCount).toBe(
        new Set(band.items.map((entry) => entry.vehicle.id)).size
      );
    }
  });

  it("costs each band from its own items only", () => {
    const overdueCost = demand.overdue.items.reduce(
      (total, entry) => total + entry.item.task.estimatedCost,
      0
    );
    expect(demand.overdue.estimatedCost).toBe(overdueCost);

    // The two bands are costed separately — the old dashboard tile labelled the
    // combined figure as the due-soon "backlog".
    expect(demand.overdue.estimatedCost).not.toBe(
      demand.overdue.estimatedCost + demand.dueSoon.estimatedCost
    );
  });
});
