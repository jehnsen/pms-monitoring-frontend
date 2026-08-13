import { describe, expect, it } from "vitest";
import {
  hydrateCheckInForm,
  lookupVehicle,
  normalisePlate,
  normaliseVin,
  suggestedWorkAtCheckIn,
} from "@/lib/checkin";
import type { FleetClient, PmsItem, Vehicle, VehicleHealth } from "@/types";

const TODAY = new Date("2026-08-13T09:00:00.000Z");

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "veh-1",
    fleetClientId: "fc-actimed",
    plateNumber: "ABC 1234",
    make: "Toyota",
    model: "Hiace",
    year: 2022,
    vin: "JTFHK02P900012345",
    vehicleClass: "van",
    fuelType: "diesel",
    color: "White",
    driverLicenceExpiry: null,
    odometer: 84_500,
    odometerReadAt: "2026-08-12",
    avgDailyKm: 90,
    status: "active",
    assignedTo: "Marlon Reyes",
    department: "Logistics",
    location: "Manila",
    acquiredOn: "2022-03-01",
    registrationExpiry: "2027-03-01",
    insuranceExpiry: "2027-03-01",
    taskState: {},
    ...overrides,
  };
}

const client: FleetClient = {
  id: "fc-actimed",
  providerId: "prov-mekanikomore",
  name: "Actimed",
  slug: "actimed",
  contactName: "Rina Salcedo",
  contactEmail: "rina@actimed.ph",
  contractTerms: "Net 30",
  paymentTermsDays: 30,
  approvalThresholdOverrides: null,
  logoUrl: null,
  brandColor: null,
  status: "active",
  createdAt: "2024-01-01",
};

describe("normalisation", () => {
  it("makes spacing and case irrelevant on a plate", () => {
    expect(normalisePlate("abc-1234")).toBe("ABC1234");
    expect(normalisePlate("ABC 1234")).toBe("ABC1234");
    expect(normalisePlate(" abc1234 ")).toBe("ABC1234");
  });

  it("strips whitespace from a VIN", () => {
    expect(normaliseVin("jtfhk02p900012345")).toBe("JTFHK02P900012345");
  });
});

describe("lookupVehicle", () => {
  it("waits until there is enough typed to mean anything", () => {
    // Matching on one or two characters would flicker the form as the advisor
    // types and could hydrate the wrong customer.
    expect(lookupVehicle("A", [vehicle()], [client], TODAY).outcome).toBe("idle");
    expect(lookupVehicle("", [vehicle()], [client], TODAY).outcome).toBe("idle");
  });

  it("hydrates from a plate however it was typed", () => {
    for (const typed of ["ABC 1234", "abc-1234", "ABC1234"]) {
      const result = lookupVehicle(typed, [vehicle()], [client], TODAY);
      expect(result.outcome).toBe("existing");
      if (result.outcome !== "existing") continue;
      expect(result.matchedOn).toBe("plate");
      expect(result.vehicle.id).toBe("veh-1");
    }
  });

  it("falls back to VIN when the plate doesn't match", () => {
    const result = lookupVehicle("JTFHK02P900012345", [vehicle()], [client], TODAY);
    expect(result.outcome).toBe("existing");
    if (result.outcome !== "existing") return;
    expect(result.matchedOn).toBe("vin");
  });

  it("resolves the owning client as the customer", () => {
    const result = lookupVehicle("ABC1234", [vehicle()], [client], TODAY);
    if (result.outcome !== "existing") throw new Error("expected a match");
    expect(result.client?.name).toBe("Actimed");
  });

  it("does not match on a partial plate", () => {
    // Hydrating the wrong customer is worse than hydrating nothing.
    const result = lookupVehicle("ABC1", [vehicle()], [client], TODAY);
    expect(result.outcome).toBe("new");
  });

  it("reports a miss as a new vehicle, seeding what was typed", () => {
    const result = lookupVehicle("XYZ 9999", [vehicle()], [client], TODAY);
    expect(result.outcome).toBe("new");
    if (result.outcome !== "new") return;
    expect(result.plateNumber).toBe("XYZ9999");
    expect(result.vin).toBeNull();
  });

  it("seeds the VIN field, not the plate, for an unmatched 17-character input", () => {
    const result = lookupVehicle("1HGBH41JXMN109186", [vehicle()], [client], TODAY);
    if (result.outcome !== "new") throw new Error("expected a miss");
    expect(result.vin).toBe("1HGBH41JXMN109186");
    expect(result.plateNumber).toBe("");
  });

  it("flags a stale reading rather than presenting it as current", () => {
    const stale = vehicle({ odometerReadAt: "2026-06-01" });
    const result = lookupVehicle("ABC1234", [stale], [client], TODAY);
    if (result.outcome !== "existing") throw new Error("expected a match");
    expect(result.odometerStale).toBe(true);
    expect(result.odometerAgeDays).toBeGreaterThan(14);
  });

  it("treats a fresh reading as usable", () => {
    const result = lookupVehicle("ABC1234", [vehicle()], [client], TODAY);
    if (result.outcome !== "existing") throw new Error("expected a match");
    expect(result.odometerStale).toBe(false);
    expect(result.lastOdometer).toBe(84_500);
  });

  it("only sees the vehicles it is handed", () => {
    // Scoping happens upstream in lib/store.ts — a lookup that searched the raw
    // fleet would confirm the existence of another client's vehicle.
    expect(lookupVehicle("ABC1234", [], [client], TODAY).outcome).toBe("new");
  });
});

describe("hydrateCheckInForm", () => {
  it("fills every field the fleet already knows", () => {
    const form = hydrateCheckInForm(
      lookupVehicle("ABC1234", [vehicle()], [client], TODAY)
    );

    expect(form.isExistingVehicle).toBe(true);
    expect(form.vehicleId).toBe("veh-1");
    expect(form.make).toBe("Toyota");
    expect(form.model).toBe("Hiace");
    expect(form.year).toBe(2022);
    expect(form.vin).toBe("JTFHK02P900012345");
    expect(form.customerName).toBe("Actimed");
    expect(form.customerContact).toBe("Rina Salcedo");
    expect(form.assignedTo).toBe("Marlon Reyes");
    expect(form.odometer).toBe(84_500);
    expect(form.odometerNeedsConfirmation).toBe(false);
  });

  it("asks for confirmation when the pre-filled reading is stale", () => {
    const form = hydrateCheckInForm(
      lookupVehicle("ABC1234", [vehicle({ odometerReadAt: "2026-05-01" })], [client], TODAY)
    );
    expect(form.odometer).toBe(84_500);
    expect(form.odometerNeedsConfirmation).toBe(true);
  });

  it("carries only the typed identifier into a new-vehicle form", () => {
    // Guessing a make from a plate would be fabrication.
    const form = hydrateCheckInForm(
      lookupVehicle("XYZ9999", [vehicle()], [client], TODAY)
    );
    expect(form.isExistingVehicle).toBe(false);
    expect(form.plateNumber).toBe("XYZ9999");
    expect(form.make).toBe("");
    expect(form.customerName).toBe("");
    expect(form.odometer).toBeNull();
  });

  it("returns an empty form while the input is still too short", () => {
    const form = hydrateCheckInForm(lookupVehicle("A", [vehicle()], [client], TODAY));
    expect(form.plateNumber).toBe("");
    expect(form.isExistingVehicle).toBe(false);
  });
});

describe("suggestedWorkAtCheckIn", () => {
  const item = (status: PmsItem["status"], id: string) =>
    ({ status, task: { id, name: id } }) as PmsItem;

  it("offers what is already due while the vehicle is on the premises", () => {
    const health = {
      items: [item("overdue", "t1"), item("due_soon", "t2"), item("ok", "t3")],
    } as VehicleHealth;

    const result = suggestedWorkAtCheckIn(health);
    expect(result.map((i) => i.task.id)).toEqual(["t1", "t2"]);
  });

  it("has nothing to offer for a compliant vehicle", () => {
    const health = { items: [item("ok", "t1")] } as VehicleHealth;
    expect(suggestedWorkAtCheckIn(health)).toHaveLength(0);
    expect(suggestedWorkAtCheckIn(null)).toHaveLength(0);
  });

  it("caps the list so the counter conversation stays finite", () => {
    const health = {
      items: Array.from({ length: 9 }, (_, i) => item("overdue", `t${i}`)),
    } as VehicleHealth;
    expect(suggestedWorkAtCheckIn(health, 5)).toHaveLength(5);
  });
});
