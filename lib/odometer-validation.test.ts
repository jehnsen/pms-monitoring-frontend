import { describe, expect, it } from "vitest";
import type { Vehicle } from "@/types";
import { validateOdometerReading } from "@/lib/odometer-validation";

/** Minimal vehicle shape — each test overrides only what it is about. */
function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "v-1",
    fleetClientId: "fc-actimed",
    plateNumber: "TEST 0001",
    make: "Toyota",
    model: "Hilux",
    year: 2022,
    vin: "VIN",
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "White",
    driverLicenceExpiry: null,
    odometer: 50_000,
    odometerReadAt: "2026-01-01",
    avgDailyKm: 50,
    status: "active",
    assignedTo: "Driver",
    department: "Ops",
    location: "Depot",
    acquiredOn: "2024-01-01",
    registrationExpiry: "2027-01-01",
    insuranceExpiry: "2027-01-01",
    taskState: {},
    ...overrides,
  };
}

describe("validateOdometerReading", () => {
  it("rejects a reading lower than the last recorded value", () => {
    const result = validateOdometerReading({
      vehicle: vehicle({ odometer: 1_127_800 }),
      reading: 1_127_000,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).toBe("invalid");
    expect(result.error).toContain("1,127,800 km");
    expect(result.error).toContain("01 Jan 2026");
  });

  it("does not reject a reading equal to the last one", () => {
    // A zero-km delta over several days reads as a likely duplicate entry —
    // that's a warning (see the low-rate test below), never a rejection.
    const result = validateOdometerReading({
      vehicle: vehicle(),
      reading: 50_000,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).not.toBe("invalid");
    expect(result.error).toBeNull();
  });

  it("passes a normal delta clean", () => {
    // 9 days at 50 km/day = 450 km, right on the average.
    const result = validateOdometerReading({
      vehicle: vehicle(),
      reading: 50_450,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).toBe("ok");
    expect(result.warning).toBeNull();
  });

  it("warns when the implied rate is over 3x the average", () => {
    // 9 days at 50 km/day average → 3x band is 150 km/day = 1,350 km.
    const result = validateOdometerReading({
      vehicle: vehicle(),
      reading: 52_000,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).toBe("warning");
    expect(result.warning).toContain("over 3x");
  });

  it("does not warn exactly at the 3x boundary", () => {
    const result = validateOdometerReading({
      vehicle: vehicle(),
      reading: 50_000 + 9 * 150,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).toBe("ok");
  });

  it("warns when the implied rate is under 10% of the average", () => {
    // 9 days at 50 km/day → 10% band is 5 km/day = 45 km.
    const result = validateOdometerReading({
      vehicle: vehicle(),
      reading: 50_010,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).toBe("warning");
    expect(result.warning).toContain("old reading was re-entered");
  });

  it("does not warn exactly at the 10% boundary", () => {
    const result = validateOdometerReading({
      vehicle: vehicle(),
      reading: 50_000 + 9 * 5,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).toBe("ok");
  });

  it("treats a same-day reading as a one-day gap rather than dividing by zero", () => {
    const result = validateOdometerReading({
      vehicle: vehicle({ odometerReadAt: "2026-01-10" }),
      reading: 50_010,
      readAt: new Date("2026-01-10"),
    });

    expect(Number.isFinite(result.impliedDailyKm)).toBe(true);
  });

  it("skips rate checks when the vehicle has no average yet", () => {
    const result = validateOdometerReading({
      vehicle: vehicle({ avgDailyKm: 0 }),
      reading: 90_000,
      readAt: new Date("2026-01-10"),
    });

    expect(result.status).toBe("ok");
  });
});
