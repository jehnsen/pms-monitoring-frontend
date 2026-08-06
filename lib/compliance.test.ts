import { describe, expect, it } from "vitest";
import { formatISO } from "date-fns";
import type { FleetDocument, Vehicle } from "@/types";
import {
  BADGE_WARNING_DAYS,
  expiringDocumentSummary,
  plateEndingRenewalMonth,
  vehicleComplianceStatus,
} from "@/lib/compliance";

const TODAY = new Date("2026-08-06");

function iso(daysFromToday: number) {
  return formatISO(new Date(TODAY.getTime() + daysFromToday * 86_400_000), {
    representation: "date",
  });
}

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "veh-1",
    plateNumber: "NBA 4821",
    make: "Toyota",
    model: "Hilux",
    year: 2022,
    vin: "VIN",
    vehicleClass: "pickup",
    fuelType: "diesel",
    color: "White",
    driverLicenceExpiry: null,
    odometer: 50_000,
    odometerReadAt: iso(0),
    avgDailyKm: 50,
    status: "active",
    assignedTo: "Driver",
    department: "Ops",
    location: "Depot",
    acquiredOn: "2024-01-01",
    registrationExpiry: iso(400),
    insuranceExpiry: iso(400),
    taskState: {},
    ...overrides,
  };
}

function doc(overrides: Partial<FleetDocument> = {}): FleetDocument {
  return {
    id: "doc-1",
    name: "LTO registration",
    kind: "lto_registration",
    vehicleId: "veh-1",
    workOrderId: null,
    uploadedBy: "Tester",
    uploadedOn: iso(-30),
    sizeBytes: 1000,
    mimeType: "application/pdf",
    dataUrl: null,
    expiresOn: iso(400),
    referenceNumber: null,
    issuedOn: null,
    issuingBody: null,
    notes: "",
    ...overrides,
  };
}

describe("vehicleComplianceStatus", () => {
  it("reads ok when nothing is close to expiring", () => {
    const status = vehicleComplianceStatus(vehicle(), [doc({ expiresOn: iso(400) })], TODAY);
    expect(status).toBe("ok");
  });

  it("reads expiring inside the badge window", () => {
    const status = vehicleComplianceStatus(
      vehicle(),
      [doc({ expiresOn: iso(BADGE_WARNING_DAYS - 1) })],
      TODAY
    );
    expect(status).toBe("expiring");
  });

  it("reads expired once the date has passed", () => {
    const status = vehicleComplianceStatus(vehicle(), [doc({ expiresOn: iso(-1) })], TODAY);
    expect(status).toBe("expired");
  });

  it("ignores documents that belong to a different vehicle", () => {
    const status = vehicleComplianceStatus(
      vehicle(),
      [doc({ vehicleId: "veh-2", expiresOn: iso(-1) })],
      TODAY
    );
    expect(status).toBe("ok");
  });

  it("ignores non-compliance document kinds", () => {
    const status = vehicleComplianceStatus(
      vehicle(),
      [doc({ kind: "invoice", expiresOn: iso(-1) })],
      TODAY
    );
    expect(status).toBe("ok");
  });

  it("counts an expired driver licence even with clean documents", () => {
    const status = vehicleComplianceStatus(
      vehicle({ driverLicenceExpiry: iso(-5) }),
      [doc({ expiresOn: iso(400) })],
      TODAY
    );
    expect(status).toBe("expired");
  });

  it("does not average an expired doc against a healthy one — worst wins", () => {
    const status = vehicleComplianceStatus(
      vehicle(),
      [doc({ id: "d1", kind: "lto_registration", expiresOn: iso(400) }), doc({ id: "d2", kind: "ctpl", expiresOn: iso(-1) })],
      TODAY
    );
    expect(status).toBe("expired");
  });
});

describe("expiringDocumentSummary", () => {
  it("counts documents inside the window, grouped by kind", () => {
    const summary = expiringDocumentSummary(
      [vehicle()],
      [
        doc({ id: "d1", kind: "lto_registration", expiresOn: iso(10) }),
        doc({ id: "d2", kind: "ctpl", expiresOn: iso(-1) }),
        doc({ id: "d3", kind: "comprehensive_insurance", expiresOn: iso(200) }), // outside window
      ],
      60,
      TODAY
    );

    expect(summary.total).toBe(2);
    expect(summary.byKind.map((k) => k.label)).toEqual(
      expect.arrayContaining(["LTO registration", "CTPL insurance"])
    );
  });

  it("includes an expiring driver licence as its own bucket", () => {
    const summary = expiringDocumentSummary(
      [vehicle({ driverLicenceExpiry: iso(5) })],
      [],
      60,
      TODAY
    );
    expect(summary.total).toBe(1);
    expect(summary.byKind).toEqual([{ label: "Driver licence", count: 1 }]);
  });

  it("ignores non-compliance kinds like invoices", () => {
    const summary = expiringDocumentSummary(
      [vehicle()],
      [doc({ kind: "invoice", expiresOn: iso(5) })],
      60,
      TODAY
    );
    expect(summary.total).toBe(0);
  });
});

describe("plateEndingRenewalMonth", () => {
  it("maps digits 1-9 to January through September", () => {
    expect(plateEndingRenewalMonth("NBA 4821")).toBe("January");
    expect(plateEndingRenewalMonth("CBA 1177")).toBe("July");
  });

  it("maps a trailing 0 to October", () => {
    expect(plateEndingRenewalMonth("ABC 1230")).toBe("October");
  });

  it("returns null when the plate has no digits", () => {
    expect(plateEndingRenewalMonth("ABC DEF")).toBeNull();
  });
});
