import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { computeIntervalStatus, type IntervalInput } from "@/lib/interval-status";

/** Oil-change-shaped defaults; each test overrides only what it is about. */
function input(overrides: Partial<IntervalInput> = {}): IntervalInput {
  return {
    lastCompletedAt: new Date("2026-01-01"),
    lastCompletedOdometer: 50_000,
    distanceIntervalKm: 5_000,
    timeIntervalMonths: 6,
    currentOdometer: 50_000,
    currentOdometerReadAt: new Date("2026-01-01"),
    avgKmPerDay: 50,
    today: new Date("2026-01-01"),
    ...overrides,
  };
}

const iso = (date: Date) => format(date, "yyyy-MM-dd");

describe("computeIntervalStatus", () => {
  it("is governed by distance when the vehicle covers the interval before the time limit", () => {
    // 5,000 km at 50 km/day = 100 days, well inside the 6-month limit.
    const result = computeIntervalStatus(input());

    expect(result.governedBy).toBe("distance");
    expect(result.distanceDueAt).toBe(55_000);
    expect(iso(result.distanceDueOn)).toBe("2026-04-11");
    expect(iso(result.timeDueAt)).toBe("2026-07-01");
    expect(iso(result.projectedDue)).toBe("2026-04-11");
  });

  it("is governed by time when the vehicle is driven too little to reach the distance limit", () => {
    // 5,000 km at 5 km/day = 1,000 days, far beyond the 6-month limit.
    const result = computeIntervalStatus(input({ avgKmPerDay: 5 }));

    expect(result.governedBy).toBe("time");
    expect(iso(result.projectedDue)).toBe("2026-07-01");
    expect(iso(result.timeDueAt)).toBe("2026-07-01");
  });

  it("reports on_schedule when neither limit is near", () => {
    const result = computeIntervalStatus(
      input({ today: new Date("2026-01-10"), currentOdometer: 50_450 })
    );

    expect(result.status).toBe("on_schedule");
    expect(result.kmPast).toBeNull();
    expect(result.daysOverdue).toBeNull();
    expect(result.kmRemaining).toBeGreaterThan(0);
    expect(result.daysRemaining).toBeGreaterThan(0);
  });

  it("reports due_soon inside the warning band", () => {
    // 400 km short of the limit — inside the 750 km band.
    const result = computeIntervalStatus(
      input({
        today: new Date("2026-03-25"),
        currentOdometer: 54_600,
        currentOdometerReadAt: new Date("2026-03-25"),
      })
    );

    expect(result.status).toBe("due_soon");
    expect(result.kmPast).toBeNull();
    expect(result.daysOverdue).toBeNull();
  });

  it("reports overdue with both limits breached, counting from the earlier one", () => {
    // Distance date 2026-04-11, time date 2026-07-01; both are in the past.
    const result = computeIntervalStatus(
      input({
        today: new Date("2026-08-01"),
        currentOdometer: 60_000,
        currentOdometerReadAt: new Date("2026-08-01"),
      })
    );

    expect(result.status).toBe("overdue");
    expect(result.governedBy).toBe("distance");
    expect(iso(result.projectedDue)).toBe("2026-04-11");
    expect(result.kmPast).toBe(5_000);
    // Counted from the distance date, not the later time date.
    expect(result.daysOverdue).toBe(112);
  });

  it("rolls the odometer forward from the date the reading was taken", () => {
    const result = computeIntervalStatus(
      input({
        today: new Date("2026-02-10"),
        currentOdometer: 51_000,
        currentOdometerReadAt: new Date("2026-01-21"),
      })
    );

    // 20 days at 50 km/day on top of the 51,000 reading.
    expect(result.estimatedOdometerNow).toBe(52_000);
  });

  it("falls back to the time limit when the vehicle is not moving", () => {
    const result = computeIntervalStatus(input({ avgKmPerDay: 0 }));

    expect(result.governedBy).toBe("time");
    expect(Number.isFinite(result.distanceDueAt)).toBe(true);
    expect(iso(result.projectedDue)).toBe("2026-07-01");
  });

  // The regression case: distance was crossed long before the time limit, and
  // the old today-anchored comparison selected the later of the two.
  it("CAB 8845 transmission fluid: governed by distance, ~950 days overdue", () => {
    const result = computeIntervalStatus({
      lastCompletedAt: new Date("2022-05-28"),
      lastCompletedOdometer: 11_907,
      distanceIntervalKm: 60_000,
      timeIntervalMonths: 36,
      currentOdometer: 97_530,
      currentOdometerReadAt: new Date("2026-08-06"),
      avgKmPerDay: 104,
      today: new Date("2026-08-06"),
    });

    expect(result.distanceDueAt).toBe(71_907);
    expect(iso(result.timeDueAt)).toBe("2025-05-28");
    expect(result.governedBy).toBe("distance");

    // 60,000 km at 104 km/day = 577 days from the last completion.
    expect(iso(result.distanceDueOn)).toBe("2023-12-26");
    expect(iso(result.projectedDue)).toBe("2023-12-26");

    expect(result.status).toBe("overdue");
    expect(result.kmPast).toBe(25_623);
    expect(result.daysOverdue).toBe(954);

    // The old behaviour: 434 days, taken from the later (time) limit.
    expect(result.daysOverdue).toBeGreaterThan(900);
  });
});
