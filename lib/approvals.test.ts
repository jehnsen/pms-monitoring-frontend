import { describe, expect, it } from "vitest";
import type { ApprovalSettings, WorkOrderLine } from "@/types";
import {
  DEFAULT_APPROVAL_SETTINGS,
  businessHoursBetween,
  canApprove,
  deriveOrderStatus,
  requiredApprover,
  varianceExceeds,
} from "@/lib/approvals";

const settings: ApprovalSettings = DEFAULT_APPROVAL_SETTINGS;

function line(overrides: Partial<WorkOrderLine> = {}): WorkOrderLine {
  return {
    id: "line-1",
    description: "Brake pad replacement",
    category: "brakes",
    partCost: 2_000,
    labourCost: 500,
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

describe("requiredApprover", () => {
  it("is auto strictly under the auto-approve ceiling", () => {
    expect(requiredApprover(4_999, settings)).toBe("auto");
  });

  it("requires operations at exactly the auto-approve ceiling", () => {
    expect(requiredApprover(5_000, settings)).toBe("operations");
  });

  it("requires operations up to and including the ops ceiling", () => {
    expect(requiredApprover(50_000, settings)).toBe("operations");
  });

  it("requires the fleet manager just above the ops ceiling", () => {
    expect(requiredApprover(50_001, settings)).toBe("fleet_manager");
  });
});

describe("canApprove", () => {
  it("lets the fleet manager approve any amount", () => {
    expect(canApprove("fleet_manager", 1_000_000, settings)).toBe(true);
  });

  it("lets operations and purchasing approve within the ops ceiling", () => {
    expect(canApprove("operations", 50_000, settings)).toBe(true);
    expect(canApprove("purchasing_officer", 50_000, settings)).toBe(true);
  });

  it("blocks operations and purchasing above the ops ceiling", () => {
    expect(canApprove("operations", 50_001, settings)).toBe(false);
    expect(canApprove("purchasing_officer", 50_001, settings)).toBe(false);
  });

  it("never lets a technician or viewer approve", () => {
    expect(canApprove("technician", 100, settings)).toBe(false);
    expect(canApprove("viewer", 100, settings)).toBe(false);
  });
});

describe("deriveOrderStatus", () => {
  it("reads approved when there are no lines to approve", () => {
    expect(deriveOrderStatus([])).toBe("approved");
  });

  it("stays pending_approval while any line is undecided", () => {
    const lines = [line({ approvalStatus: "approved" }), line({ id: "l2" })];
    expect(deriveOrderStatus(lines)).toBe("pending_approval");
  });

  it("reads approved once every line is approved", () => {
    const lines = [
      line({ approvalStatus: "approved" }),
      line({ id: "l2", approvalStatus: "approved" }),
    ];
    expect(deriveOrderStatus(lines)).toBe("approved");
  });

  it("reads declined when nothing was approved", () => {
    const lines = [
      line({ approvalStatus: "declined" }),
      line({ id: "l2", approvalStatus: "deferred" }),
    ];
    expect(deriveOrderStatus(lines)).toBe("declined");
  });

  it("reads partially_approved for a genuine mix", () => {
    const lines = [
      line({ approvalStatus: "approved" }),
      line({ id: "l2", approvalStatus: "declined" }),
    ];
    expect(deriveOrderStatus(lines)).toBe("partially_approved");
  });
});

describe("varianceExceeds", () => {
  it("does not flag exactly at the threshold", () => {
    expect(varianceExceeds(10_000, 11_500, 15)).toBe(false);
  });

  it("flags just past the threshold", () => {
    expect(varianceExceeds(10_000, 11_501, 15)).toBe(true);
  });

  it("flags any spend against zero approved value", () => {
    expect(varianceExceeds(0, 1, 15)).toBe(true);
    expect(varianceExceeds(0, 0, 15)).toBe(false);
  });
});

describe("businessHoursBetween", () => {
  it("counts a same-day span inside business hours in full", () => {
    // Wednesday 09:00 to 17:00.
    const from = new Date(2026, 7, 5, 9, 0);
    const to = new Date(2026, 7, 5, 17, 0);
    expect(businessHoursBetween(from, to)).toBe(8);
  });

  it("clamps a span that starts before and ends after business hours", () => {
    const from = new Date(2026, 7, 5, 6, 0);
    const to = new Date(2026, 7, 5, 20, 0);
    expect(businessHoursBetween(from, to)).toBe(10);
  });

  it("does not count the weekend crossed between Friday and Monday", () => {
    const from = new Date(2026, 7, 7, 17, 0); // Friday 17:00
    const to = new Date(2026, 7, 10, 9, 0); // Monday 09:00
    expect(businessHoursBetween(from, to)).toBe(2);
  });

  it("returns zero for a non-positive span", () => {
    const now = new Date(2026, 7, 5, 12, 0);
    expect(businessHoursBetween(now, now)).toBe(0);
  });
});
