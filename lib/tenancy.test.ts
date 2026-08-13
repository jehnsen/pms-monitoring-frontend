import { describe, expect, it } from "vitest";
import type {
  FleetClient,
  FleetDocument,
  FleetState,
  Part,
  Provider,
  PurchaseOrder,
  Session,
  Vehicle,
  WorkOrder,
} from "@/types";
import { DEFAULT_APPROVAL_SETTINGS } from "@/lib/approvals";
import { DEFAULT_TENANT_SETTINGS } from "@/lib/tenant";
import { evaluateFleet, summariseFleet } from "@/lib/pms";
import { monthlyCosts, spendByVehicle } from "@/lib/analytics";
import {
  alertsForScope,
  effectiveApprovalSettings,
  providerBranding,
  resolveTenantScope,
  scopeAccounts,
  scopeFleetState,
  tenantScopeKey,
  visibleFleetClientIds,
} from "@/lib/tenancy";

/* ------------------------------------------------------------------ fixtures */

/**
 * Two providers. Provider A has two clients beneath it — that pairing is what
 * proves same-provider sibling isolation, the leak a naive `providerId` filter
 * would miss.
 */
const PROVIDER_A: Provider = {
  id: "prov-a",
  name: "MekanikoMoR",
  slug: "mekanikomore",
  logoUrl: null,
  brandColor: "#1d5ba6",
  supportEmail: "support@mekanikomore.ph",
  createdAt: "2024-01-01",
};

const PROVIDER_B: Provider = {
  id: "prov-b",
  name: "RivalWrench",
  slug: "rivalwrench",
  logoUrl: null,
  brandColor: "#a61d5b",
  supportEmail: "support@rivalwrench.ph",
  createdAt: "2024-01-01",
};

function client(overrides: Partial<FleetClient> & { id: string; providerId: string }): FleetClient {
  return {
    name: "Client",
    slug: overrides.id,
    contactName: "Contact",
    contactEmail: "contact@example.ph",
    contractTerms: "Standard",
    paymentTermsDays: 30,
    approvalThresholdOverrides: null,
    logoUrl: null,
    brandColor: null,
    status: "active",
    createdAt: "2024-01-01",
    ...overrides,
  };
}

const ACTIMED = client({ id: "fc-actimed", providerId: "prov-a", name: "Actimed" });
const NORTHWIND = client({ id: "fc-northwind", providerId: "prov-a", name: "Northwind" });
const ZENITH = client({ id: "fc-zenith", providerId: "prov-b", name: "Zenith" });

const PROVIDERS = [PROVIDER_A, PROVIDER_B];
const CLIENTS = [ACTIMED, NORTHWIND, ZENITH];

function vehicle(id: string, fleetClientId: string, odometer = 50_000): Vehicle {
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
    odometer,
    odometerReadAt: "2026-08-01",
    avgDailyKm: 40,
    status: "active",
    assignedTo: "Driver",
    department: "Ops",
    location: "Hub",
    acquiredOn: "2023-01-01",
    registrationExpiry: "2027-01-01",
    insuranceExpiry: "2027-01-01",
    taskState: {},
  };
}

function workOrder(id: string, vehicleId: string, laborCost = 1_000): WorkOrder {
  return {
    id,
    reference: id.toUpperCase(),
    vehicleId,
    title: "Job",
    type: "preventive",
    status: "closed",
    priority: "medium",
    openedOn: "2026-07-01",
    scheduledFor: "2026-07-02",
    scheduledTime: "09:30",
    completedOn: "2026-07-03",
    odometerAtService: 50_000,
    technician: "Tech",
    vendor: "In-house Fleet Bay 1",
    assignedProviderId: "prov-mekanikomore",
    bayId: "bay-1",
    collectedAt: null,
    collectedBy: null,
    laborCost,
    partsCost: 0,
    parts: [],
    findings: "",
    taskIds: [],
    notes: "",
    history: [],
    lines: [],
    approvalLog: [
      {
        id: `${id}-log`,
        lineId: null,
        action: "approved",
        actorId: "actor",
        actorName: "Actor",
        at: "2026-07-01T09:00:00.000Z",
        note: null,
        amountAtTime: laborCost,
        fleetClientId: "",
      },
    ],
    pendingApprovalEnteredAt: null,
    approvalWaitHours: null,
  };
}

function doc(id: string, fleetClientId: string, vehicleId: string | null): FleetDocument {
  return {
    id,
    fleetClientId,
    name: id,
    kind: "invoice",
    vehicleId,
    workOrderId: null,
    uploadedBy: "Someone",
    uploadedOn: "2026-07-01",
    sizeBytes: 100,
    mimeType: "application/pdf",
    dataUrl: null,
    expiresOn: null,
    referenceNumber: null,
    issuedOn: null,
    issuingBody: null,
    notes: "",
  };
}

function part(id: string, fleetClientId: string): Part {
  return {
    id,
    fleetClientId,
    sku: id,
    name: id,
    category: "engine",
    unit: "pc",
    unitCost: 100,
    currentStock: 5,
    reorderPoint: 2,
    preferredVendor: "Vendor",
    leadTimeDays: 3,
  };
}

function purchaseOrder(id: string, fleetClientId: string): PurchaseOrder {
  return {
    id,
    fleetClientId,
    reference: id.toUpperCase(),
    vendor: "Vendor",
    status: "draft",
    createdOn: "2026-07-01",
    createdBy: "Someone",
    lines: [],
    notes: "",
  };
}

/**
 * One state carrying all three clients at once — the only honest way to test
 * isolation. Every assertion below reads this same blob through a scope.
 */
const STATE: FleetState = {
  providers: PROVIDERS,
  fleetClients: CLIENTS,
  vehicles: [
    vehicle("veh-001", ACTIMED.id, 10_000),
    vehicle("veh-002", ACTIMED.id, 20_000),
    vehicle("veh-008", NORTHWIND.id, 30_000),
    vehicle("veh-100", ZENITH.id, 40_000),
  ],
  workOrders: [
    workOrder("wo-0001", "veh-001", 1_000),
    workOrder("wo-0047", "veh-008", 5_000),
    workOrder("wo-0100", "veh-100", 9_000),
  ],
  documents: [
    doc("doc-a", ACTIMED.id, "veh-001"),
    doc("doc-n", NORTHWIND.id, "veh-008"),
    doc("doc-z", ZENITH.id, "veh-100"),
    // Hangs off no vehicle and no work order — the case that cannot be derived
    // and therefore must carry its tenant explicitly.
    doc("doc-orphan-n", NORTHWIND.id, null),
  ],
  parts: [part("part-a", ACTIMED.id), part("part-n", NORTHWIND.id), part("part-z", ZENITH.id)],
  purchaseOrders: [
    purchaseOrder("po-a", ACTIMED.id),
    purchaseOrder("po-n", NORTHWIND.id),
    purchaseOrder("po-z", ZENITH.id),
  ],
  alerts: {
    [`client:${ACTIMED.id}`]: { readIds: ["a-read"], dismissedIds: ["a-dismissed"] },
    [`client:${NORTHWIND.id}`]: {
      readIds: ["n-read"],
      dismissedIds: ["n-dismissed"],
    },
  },
  approvalSettings: DEFAULT_APPROVAL_SETTINGS,
  tenant: DEFAULT_TENANT_SETTINGS,
};

function session(overrides: Partial<Session>): Session {
  return {
    uid: "00000000-0000-0000-0000-000000000001",
    email: "user@example.ph",
    name: "User",
    firstName: "User",
    lastName: "",
    username: "user",
    role: "fleet_manager",
    title: "Title",
    signedInAt: "2026-08-01T00:00:00.000Z",
    providerId: null,
    fleetClientId: null,
    ...overrides,
  };
}

const PROVIDER_A_ADMIN = session({
  role: "provider_admin",
  providerId: PROVIDER_A.id,
  fleetClientId: null,
});
const PROVIDER_B_ADMIN = session({
  role: "provider_admin",
  providerId: PROVIDER_B.id,
  fleetClientId: null,
});
const ACTIMED_MANAGER = session({
  role: "fleet_manager",
  providerId: PROVIDER_A.id,
  fleetClientId: ACTIMED.id,
});
const NORTHWIND_MANAGER = session({
  role: "fleet_manager",
  providerId: PROVIDER_A.id,
  fleetClientId: NORTHWIND.id,
});

function scopeFor(s: Session | null) {
  return resolveTenantScope(s, PROVIDERS, CLIENTS);
}

function viewAs(s: Session | null) {
  return scopeFleetState(STATE, scopeFor(s));
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

/* --------------------------------------------------- 1. provider vs provider */

describe("provider cannot read another provider's data", () => {
  it("excludes provider B's vehicles from provider A", () => {
    expect(ids(viewAs(PROVIDER_A_ADMIN).vehicles)).toEqual([
      "veh-001",
      "veh-002",
      "veh-008",
    ]);
  });

  it("excludes provider B's work orders from provider A", () => {
    expect(ids(viewAs(PROVIDER_A_ADMIN).workOrders)).toEqual(["wo-0001", "wo-0047"]);
  });

  it("excludes provider B's documents from provider A", () => {
    expect(ids(viewAs(PROVIDER_A_ADMIN).documents)).toEqual([
      "doc-a",
      "doc-n",
      "doc-orphan-n",
    ]);
  });

  it("excludes provider A's data from provider B", () => {
    const view = viewAs(PROVIDER_B_ADMIN);
    expect(ids(view.vehicles)).toEqual(["veh-100"]);
    expect(ids(view.workOrders)).toEqual(["wo-0100"]);
    expect(ids(view.documents)).toEqual(["doc-z"]);
  });
});

/* ------------------------------------------- 2 & 3. client vs client */

describe("fleet client cannot read another client's data", () => {
  it("scopes a client to its own vehicles only", () => {
    expect(ids(viewAs(ACTIMED_MANAGER).vehicles)).toEqual(["veh-001", "veh-002"]);
  });

  it("excludes a sibling client under the SAME provider", () => {
    const view = viewAs(ACTIMED_MANAGER);
    // Northwind shares provider A with Actimed — a providerId-only filter
    // would wrongly let this through.
    expect(view.vehicles.some((v) => v.fleetClientId === NORTHWIND.id)).toBe(false);
    expect(view.workOrders.some((o) => o.vehicleId === "veh-008")).toBe(false);
    expect(view.documents.some((d) => d.fleetClientId === NORTHWIND.id)).toBe(false);
  });

  it("excludes a client under a different provider", () => {
    const view = viewAs(ACTIMED_MANAGER);
    expect(view.vehicles.some((v) => v.fleetClientId === ZENITH.id)).toBe(false);
  });

  it("scopes parts stock and purchase orders per client", () => {
    const view = viewAs(NORTHWIND_MANAGER);
    expect(ids(view.parts)).toEqual(["part-n"]);
    expect(ids(view.purchaseOrders)).toEqual(["po-n"]);
  });

  it("keeps an unlinked document with its owning client", () => {
    expect(ids(viewAs(NORTHWIND_MANAGER).documents)).toEqual(["doc-n", "doc-orphan-n"]);
    expect(viewAs(ACTIMED_MANAGER).documents.some((d) => d.id === "doc-orphan-n")).toBe(
      false
    );
  });
});

/* ------------------------------------------- 4. provider sees all beneath it */

describe("provider reads every client beneath it", () => {
  it("lists both of provider A's clients", () => {
    expect(visibleFleetClientIds(scopeFor(PROVIDER_A_ADMIN), CLIENTS).sort()).toEqual([
      ACTIMED.id,
      NORTHWIND.id,
    ]);
  });

  it("exposes both clients' vehicles to the provider", () => {
    const view = viewAs(PROVIDER_A_ADMIN);
    expect(view.vehicles.some((v) => v.fleetClientId === ACTIMED.id)).toBe(true);
    expect(view.vehicles.some((v) => v.fleetClientId === NORTHWIND.id)).toBe(true);
  });

  it("does not leak a sibling provider's client into the list", () => {
    expect(visibleFleetClientIds(scopeFor(PROVIDER_A_ADMIN), CLIENTS)).not.toContain(
      ZENITH.id
    );
  });
});

/* ------------------------------------------------- 5. detail lookups scoped */

describe("detail lookups are scoped, not just lists", () => {
  it("returns nothing for veh-008 as the wrong client", () => {
    const view = viewAs(ACTIMED_MANAGER);
    expect(view.vehicles.find((v) => v.id === "veh-008")).toBeUndefined();
  });

  it("returns nothing for wo-0047 as the wrong client", () => {
    const view = viewAs(ACTIMED_MANAGER);
    expect(view.workOrders.find((o) => o.id === "wo-0047")).toBeUndefined();
  });

  it("returns nothing for another provider's veh-100", () => {
    expect(
      viewAs(PROVIDER_A_ADMIN).vehicles.find((v) => v.id === "veh-100")
    ).toBeUndefined();
  });

  it("still resolves a record the tenant does own", () => {
    expect(viewAs(ACTIMED_MANAGER).vehicles.find((v) => v.id === "veh-001")).toBeDefined();
  });

  it("drops a work order whose vehicle is out of scope", () => {
    // wo-0047 derives its tenant through veh-008; with that vehicle filtered
    // out the order must not survive as an orphan.
    expect(
      viewAs(ACTIMED_MANAGER).workOrders.find((o) => o.vehicleId === "veh-008")
    ).toBeUndefined();
  });
});

/* ----------------------------------------------------- 6. fail closed */

describe("missing or ambiguous tenant context returns nothing", () => {
  it("resolves no scope for an unauthenticated user", () => {
    expect(scopeFor(null)).toBeNull();
  });

  it("returns empty collections, not the whole fleet, when unauthenticated", () => {
    const view = viewAs(null);
    expect(view.vehicles).toEqual([]);
    expect(view.workOrders).toEqual([]);
    expect(view.documents).toEqual([]);
    expect(view.parts).toEqual([]);
    expect(view.purchaseOrders).toEqual([]);
    expect(view.fleetClients).toEqual([]);
    expect(view.alerts).toEqual({});
  });

  it("fails closed for a session with no provider", () => {
    expect(scopeFor(session({ providerId: null, fleetClientId: null }))).toBeNull();
  });

  it("fails closed for an unknown provider id", () => {
    expect(scopeFor(session({ providerId: "prov-ghost" }))).toBeNull();
  });

  it("fails closed for an unknown fleet client id", () => {
    expect(
      scopeFor(session({ providerId: PROVIDER_A.id, fleetClientId: "fc-ghost" }))
    ).toBeNull();
  });

  it("fails closed when the client does not belong to the session's provider", () => {
    // Ambiguous pairing — Zenith sits under provider B, not A.
    expect(
      scopeFor(session({ providerId: PROVIDER_A.id, fleetClientId: ZENITH.id }))
    ).toBeNull();
  });

  it("fails closed for a suspended client", () => {
    const suspended = client({
      id: "fc-susp",
      providerId: PROVIDER_A.id,
      status: "suspended",
    });
    expect(
      resolveTenantScope(
        session({ providerId: PROVIDER_A.id, fleetClientId: suspended.id }),
        PROVIDERS,
        [...CLIENTS, suspended]
      )
    ).toBeNull();
  });

  it("never falls back to unscoped when scope is null", () => {
    expect(scopeFleetState(STATE, null).vehicles).toHaveLength(0);
  });
});

/* ------------------------------------------------------- 7. aggregates */

describe("aggregates are computed from scoped data", () => {
  it("counts only the tenant's own vehicles in the fleet summary", () => {
    const scoped = summariseFleet(evaluateFleet(viewAs(ACTIMED_MANAGER).vehicles));
    expect(scoped.total).toBe(2);
    // The unscoped blob holds four vehicles; a leak would show up here.
    expect(scoped.total).not.toBe(STATE.vehicles.length);
  });

  it("excludes other tenants' odometers from fleet totals", () => {
    expect(
      summariseFleet(evaluateFleet(viewAs(ACTIMED_MANAGER).vehicles)).totalOdometer
    ).toBe(30_000);
  });

  it("excludes other tenants' spend from cost aggregates", () => {
    const view = viewAs(ACTIMED_MANAGER);
    const total = monthlyCosts(view.workOrders, 12).reduce((t, row) => t + row.total, 0);
    // wo-0047 (5,000) and wo-0100 (9,000) belong to other tenants.
    expect(total).toBe(1_000);
  });

  it("ranks spend only across the tenant's own vehicles", () => {
    const view = viewAs(ACTIMED_MANAGER);
    const ranked = spendByVehicle(view.workOrders, evaluateFleet(view.vehicles));
    const ownPlates = view.vehicles.map((v) => v.plateNumber);
    expect(ranked.every((row) => ownPlates.includes(row.name))).toBe(true);
    // veh-008 belongs to Northwind and must not appear in Actimed's ranking.
    expect(ranked.some((row) => row.name === "VEH-008")).toBe(false);
  });

  it("gives a provider the union of its clients, and no more", () => {
    expect(summariseFleet(evaluateFleet(viewAs(PROVIDER_A_ADMIN).vehicles)).total).toBe(3);
    expect(summariseFleet(evaluateFleet(viewAs(PROVIDER_B_ADMIN).vehicles)).total).toBe(1);
  });

  it("reports nothing at all with no tenant context", () => {
    expect(summariseFleet(evaluateFleet(viewAs(null).vehicles)).total).toBe(0);
  });
});

/* ------------------------------- per-client settings and provider branding */

describe("approval thresholds are per client, not global", () => {
  const NEGOTIATED = client({
    id: "fc-negotiated",
    providerId: PROVIDER_A.id,
    name: "Negotiated",
    approvalThresholdOverrides: { autoApproveUnder: 25_000 },
  });
  const withClient: FleetState = {
    ...STATE,
    fleetClients: [...CLIENTS, NEGOTIATED],
  };
  const scopeFor2 = (fleetClientId: string) =>
    resolveTenantScope(
      session({ providerId: PROVIDER_A.id, fleetClientId }),
      PROVIDERS,
      withClient.fleetClients
    );

  it("applies a client's negotiated override", () => {
    expect(
      effectiveApprovalSettings(withClient, scopeFor2(NEGOTIATED.id)).autoApproveUnder
    ).toBe(25_000);
  });

  it("leaves a sibling client on the provider default", () => {
    expect(
      effectiveApprovalSettings(withClient, scopeFor2(ACTIMED.id)).autoApproveUnder
    ).toBe(DEFAULT_APPROVAL_SETTINGS.autoApproveUnder);
  });

  it("falls through to the default for keys the override does not name", () => {
    const settings = effectiveApprovalSettings(withClient, scopeFor2(NEGOTIATED.id));
    expect(settings.slaHours).toBe(DEFAULT_APPROVAL_SETTINGS.slaHours);
  });

  it("shows a provider its own defaults, not any one client's override", () => {
    expect(
      effectiveApprovalSettings(withClient, scopeFor(PROVIDER_A_ADMIN)).autoApproveUnder
    ).toBe(DEFAULT_APPROVAL_SETTINGS.autoApproveUnder);
  });

  it("surfaces the effective settings through the scoped view", () => {
    expect(
      scopeFleetState(withClient, scopeFor2(NEGOTIATED.id)).approvalSettings
        .autoApproveUnder
    ).toBe(25_000);
  });
});

describe("branding resolves client-first, provider-second", () => {
  it("shows the provider its own mark", () => {
    expect(providerBranding(STATE, scopeFor(PROVIDER_A_ADMIN)).displayName).toBe(
      PROVIDER_A.name
    );
    expect(providerBranding(STATE, scopeFor(PROVIDER_B_ADMIN)).brandColor).toBe(
      PROVIDER_B.brandColor
    );
  });

  it("shows a client its own name rather than the provider's", () => {
    expect(providerBranding(STATE, scopeFor(ACTIMED_MANAGER)).displayName).toBe(
      ACTIMED.name
    );
  });

  it("falls back field by field where the client has supplied nothing", () => {
    // The fixture clients carry no colour or logo of their own.
    const view = providerBranding(STATE, scopeFor(ACTIMED_MANAGER));
    expect(view.brandColor).toBe(PROVIDER_A.brandColor);
    expect(view.logoUrl).toBe(PROVIDER_A.logoUrl);
  });

  it("prefers the client's own colour when it has one", () => {
    const branded = client({
      id: "fc-branded",
      providerId: PROVIDER_A.id,
      name: "Branded Co",
      brandColor: "#123456",
    });
    const state: FleetState = {
      ...STATE,
      fleetClients: [...CLIENTS, branded],
    };
    const scope = resolveTenantScope(
      session({ providerId: PROVIDER_A.id, fleetClientId: branded.id }),
      PROVIDERS,
      state.fleetClients
    );
    expect(providerBranding(state, scope).brandColor).toBe("#123456");
  });

  it("keeps support routed to the provider, not the client", () => {
    expect(providerBranding(STATE, scopeFor(ACTIMED_MANAGER)).supportEmail).toBe(
      PROVIDER_A.supportEmail
    );
  });

  it("never shows one provider's branding under another's scope", () => {
    expect(providerBranding(STATE, scopeFor(ACTIMED_MANAGER)).supportEmail).not.toBe(
      PROVIDER_B.supportEmail
    );
  });
});

/* --------------------------------------------- alert bookkeeping is bucketed */

describe("alert read/dismiss state is per tenant", () => {
  it("gives each client its own bucket", () => {
    expect(alertsForScope(STATE, scopeFor(ACTIMED_MANAGER)).dismissedIds).toEqual([
      "a-dismissed",
    ]);
    expect(alertsForScope(STATE, scopeFor(NORTHWIND_MANAGER)).dismissedIds).toEqual([
      "n-dismissed",
    ]);
  });

  it("does not carry one client's dismissals into a sibling", () => {
    expect(
      alertsForScope(STATE, scopeFor(NORTHWIND_MANAGER)).dismissedIds
    ).not.toContain("a-dismissed");
  });

  it("keeps a provider-wide view distinct from any client's bucket", () => {
    // A provider dismissing a fleet-wide alert has not decided anything on a
    // client's behalf, so the provider starts empty rather than inheriting.
    expect(alertsForScope(STATE, scopeFor(PROVIDER_A_ADMIN))).toEqual({
      readIds: [],
      dismissedIds: [],
    });
  });

  it("returns nothing without a scope", () => {
    expect(alertsForScope(STATE, null)).toEqual({ readIds: [], dismissedIds: [] });
  });

  it("carries only the caller's own bucket on the scoped view", () => {
    const view = viewAs(ACTIMED_MANAGER);
    expect(Object.keys(view.alerts)).toEqual([`client:${ACTIMED.id}`]);
  });

  it("keys provider and client scopes separately", () => {
    expect(tenantScopeKey(scopeFor(PROVIDER_A_ADMIN)!)).not.toBe(
      tenantScopeKey(scopeFor(ACTIMED_MANAGER)!)
    );
  });
});

/* ------------------------------------------------- personnel directory scope */

describe("the personnel directory is scoped", () => {
  const ACCOUNTS = [
    { email: "admin@a.ph", providerId: PROVIDER_A.id, fleetClientId: null },
    { email: "mike@actimed.ph", providerId: PROVIDER_A.id, fleetClientId: ACTIMED.id },
    { email: "nora@northwind.ph", providerId: PROVIDER_A.id, fleetClientId: NORTHWIND.id },
    { email: "zed@zenith.ph", providerId: PROVIDER_B.id, fleetClientId: ZENITH.id },
  ];

  it("shows a provider everyone beneath it", () => {
    expect(scopeAccounts(ACCOUNTS, scopeFor(PROVIDER_A_ADMIN)).map((a) => a.email)).toEqual(
      ["admin@a.ph", "mike@actimed.ph", "nora@northwind.ph"]
    );
  });

  it("shows a client only its own people", () => {
    expect(scopeAccounts(ACCOUNTS, scopeFor(ACTIMED_MANAGER)).map((a) => a.email)).toEqual([
      "mike@actimed.ph",
    ]);
  });

  it("hides provider staff from a client", () => {
    expect(
      scopeAccounts(ACCOUNTS, scopeFor(ACTIMED_MANAGER)).some(
        (a) => a.fleetClientId === null
      )
    ).toBe(false);
  });

  it("hides a sibling client's people", () => {
    expect(
      scopeAccounts(ACCOUNTS, scopeFor(ACTIMED_MANAGER)).some((a) =>
        a.email.includes("northwind")
      )
    ).toBe(false);
  });

  it("lists nobody without a scope", () => {
    expect(scopeAccounts(ACCOUNTS, null)).toEqual([]);
  });
});

/* ------------------------------------------- append-only approval log scope */

describe("the append-only approval log carries its tenant", () => {
  it("keeps log entries only for in-scope work orders", () => {
    const view = viewAs(ACTIMED_MANAGER);
    const logged = view.workOrders.flatMap((o) => o.approvalLog);
    expect(logged.every((entry) => entry.fleetClientId === ACTIMED.id)).toBe(true);
  });

  it("exposes no log entries without tenant context", () => {
    expect(viewAs(null).workOrders.flatMap((o) => o.approvalLog)).toEqual([]);
  });
});
