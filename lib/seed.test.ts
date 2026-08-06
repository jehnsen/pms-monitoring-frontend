import { describe, expect, it } from "vitest";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { createSeedState } from "@/lib/seed";
import { evaluateFleet, workOrderCost } from "@/lib/pms";
import { fleetKmInPeriod } from "@/lib/analytics";

/** Fixed date so the generated fleet is identical on every run. */
const TODAY = new Date("2026-08-06");
const state = createSeedState(TODAY);
const health = evaluateFleet(state.vehicles, TODAY);

const effectiveSpacing = (
  intervalKm: number,
  intervalMonths: number,
  avgKmPerDay: number
) => Math.min(intervalKm, intervalMonths * 30.44 * avgKmPerDay);

describe("seed fleet plausibility", () => {
  it("derives every odometer from the daily rate and time in service", () => {
    for (const vehicle of state.vehicles) {
      const daysInService = differenceInCalendarDays(
        TODAY,
        parseISO(vehicle.acquiredOn)
      );
      const implied = vehicle.avgDailyKm * daysInService;
      // Allowing a little slack for the odometer-reading offset.
      expect(vehicle.odometer / implied).toBeGreaterThan(0.97);
      expect(vehicle.odometer / implied).toBeLessThanOrEqual(1.0);
    }
  });

  it("never records a service at a distance the vehicle had not covered", () => {
    for (const entry of health) {
      for (const item of entry.items) {
        expect(item.lastDoneOdometer).toBeLessThanOrEqual(entry.vehicle.odometer);
      }
    }
  });

  it("never records a service before the vehicle was delivered", () => {
    for (const entry of health) {
      for (const item of entry.items) {
        expect(parseISO(item.lastDoneOn).getTime()).toBeGreaterThanOrEqual(
          parseISO(entry.vehicle.acquiredOn).getTime()
        );
      }
    }
  });

  /**
   * The regression this guards: the previous fleet showed a 60,000 km
   * transmission service logged at 11,907 km. A service can only appear once
   * the interval could plausibly have come due — measured against the shorter
   * of the two limits, since a low-mileage unit services on the calendar.
   */
  it("never records a service far earlier than its interval could come due", () => {
    for (const entry of health) {
      for (const item of entry.items) {
        if (item.lastDoneOdometer === 0) continue; // Never serviced — baseline is delivery.
        const spacing = effectiveSpacing(
          item.task.intervalKm,
          item.task.intervalMonths,
          entry.vehicle.avgDailyKm
        );
        expect(item.lastDoneOdometer).toBeGreaterThanOrEqual(spacing * 0.5);
      }
    }
  });

  it("keeps work orders inside the life of the vehicle they belong to", () => {
    const byId = new Map(state.vehicles.map((v) => [v.id, v]));

    for (const order of state.workOrders) {
      const vehicle = byId.get(order.vehicleId);
      expect(vehicle).toBeDefined();
      if (!vehicle) continue;

      expect(order.odometerAtService).toBeLessThanOrEqual(vehicle.odometer + 500);
      if (order.completedOn) {
        expect(parseISO(order.completedOn).getTime()).toBeGreaterThanOrEqual(
          parseISO(vehicle.acquiredOn).getTime()
        );
      }
      if (order.status === "completed") expect(order.completedOn).toBeTruthy();
    }
  });

  it("lands maintenance cost per kilometre in the realistic PH band", () => {
    const spend = state.workOrders
      .filter((order) => order.status === "completed")
      .reduce((total, order) => total + workOrderCost(order), 0);

    // Spend over a year, against distance driven in that same year — not
    // against lifetime odometer, which mixes a flow with a stock.
    const periodKm = fleetKmInPeriod(state.vehicles, 365);
    const costPerKm = spend / periodKm;

    expect(costPerKm).toBeGreaterThanOrEqual(1.5);
    expect(costPerKm).toBeLessThanOrEqual(4.0);
  });

  it("produces a fleet that is neither uniformly compliant nor uniformly overdue", () => {
    const overdue = health.filter((h) => h.status === "overdue").length;
    const ok = health.filter((h) => h.status === "ok").length;

    expect(overdue).toBeGreaterThan(0);
    expect(ok).toBeGreaterThan(0);
    expect(overdue).toBeLessThan(state.vehicles.length);
  });

  it("gives every work order a non-empty, chronologically ordered history ending on its current status", () => {
    for (const order of state.workOrders) {
      expect(order.history.length).toBeGreaterThan(0);
      expect(order.history[order.history.length - 1].status).toBe(order.status);

      for (let i = 1; i < order.history.length; i++) {
        expect(parseISO(order.history[i].at).getTime()).toBeGreaterThanOrEqual(
          parseISO(order.history[i - 1].at).getTime()
        );
      }
    }
  });

  it("itemised parts always agree with the recorded parts cost", () => {
    for (const order of state.workOrders) {
      if (!order.parts.length) continue;
      const sum = order.parts.reduce(
        (total, part) => total + part.quantity * part.unitCost,
        0
      );
      expect(sum).toBe(order.partsCost);
    }
  });
});
