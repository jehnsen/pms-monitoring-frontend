import { describe, expect, it } from "vitest";
import {
  assignOnApproval,
  canTransition,
  capabilityFor,
  checkTransition,
  displayReference,
  hasReference,
  isInHouse,
  lifecycleStage,
  nextReference,
} from "@/lib/work-order-machine";
import type { WorkOrder, WorkOrderLine, WorkOrderStatus } from "@/types";

const someLine = [{ id: "l1" } as WorkOrderLine];

function order(status: WorkOrderStatus, lines: WorkOrderLine[] = someLine) {
  return { status, lines };
}

describe("lifecycleStage", () => {
  it("maps the stored statuses onto the workflow's stages", () => {
    expect(lifecycleStage({ status: "draft", collectedAt: null })).toBe("draft");
    expect(lifecycleStage({ status: "pending_approval", collectedAt: null })).toBe(
      "pending_approval"
    );
    expect(lifecycleStage({ status: "scheduled", collectedAt: null })).toBe("in_progress");
    expect(lifecycleStage({ status: "in_progress", collectedAt: null })).toBe("in_progress");
  });

  it("treats a partial approval as approved, not as still-pending", () => {
    // "Do the brakes, skip the shocks" is a real answer, not a half-decision.
    expect(lifecycleStage({ status: "partially_approved", collectedAt: null })).toBe(
      "approved"
    );
  });

  it("splits closed by whether the customer has the vehicle back", () => {
    // Revenue is recognised on collection, so these are different moments and
    // the gap between them is the counter's queue.
    expect(lifecycleStage({ status: "closed", collectedAt: null })).toBe(
      "ready_for_billing"
    );
    expect(
      lifecycleStage({ status: "closed", collectedAt: "2026-08-10T09:00:00.000Z" })
    ).toBe("completed");
  });

  it("keeps declined and cancelled distinct", () => {
    expect(lifecycleStage({ status: "declined", collectedAt: null })).toBe("declined");
    expect(lifecycleStage({ status: "cancelled", collectedAt: null })).toBe("cancelled");
  });
});

describe("transitions", () => {
  it("allows the happy path end to end", () => {
    expect(canTransition("draft", "pending_approval")).toBe(true);
    expect(canTransition("pending_approval", "approved")).toBe(true);
    expect(canTransition("approved", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "closed")).toBe(true);
  });

  it("refuses to skip the approval stage", () => {
    expect(canTransition("draft", "scheduled")).toBe(false);
    expect(canTransition("draft", "in_progress")).toBe(false);
    expect(canTransition("pending_approval", "closed")).toBe(false);
  });

  it("refuses to reopen a closed order", () => {
    // Terminal: collection is tracked by `collectedAt`, so closing the books
    // cannot be undone by a status write.
    expect(canTransition("closed", "in_progress")).toBe(false);
    expect(canTransition("closed", "draft")).toBe(false);
    expect(canTransition("cancelled", "draft")).toBe(false);
  });

  it("lets a declined quotation be revised rather than re-raised", () => {
    expect(canTransition("declined", "draft")).toBe(true);
  });

  it("allows cancellation from any pre-closed state", () => {
    const preClosed: WorkOrderStatus[] = [
      "draft",
      "pending_approval",
      "approved",
      "partially_approved",
      "scheduled",
      "in_progress",
    ];
    for (const status of preClosed) {
      expect(canTransition(status, "cancelled")).toBe(true);
    }
  });
});

describe("checkTransition", () => {
  it("blocks sending an order with nothing on it to bill", () => {
    const result = checkTransition(order("draft", []), "pending_approval");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/at least one line/i);
  });

  it("reports the capability a legal transition demands", () => {
    const result = checkTransition(order("draft"), "pending_approval");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.capability).toBe("workorder:update");
  });

  it("demands approval rights to approve and completion rights to close", () => {
    expect(capabilityFor("approved")).toBe("workorder:approve");
    expect(capabilityFor("declined")).toBe("workorder:approve");
    expect(capabilityFor("closed")).toBe("workorder:complete");
  });

  it("explains an illegal move rather than failing silently", () => {
    const result = checkTransition(order("draft"), "closed");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot become/i);
  });

  it("rejects a no-op transition", () => {
    expect(checkTransition(order("draft"), "draft").ok).toBe(false);
  });
});

describe("nextReference", () => {
  it("issues the first number of a year", () => {
    expect(nextReference([], 2026)).toBe("WO-2026-0001");
  });

  it("continues from the highest number actually issued", () => {
    const existing = [{ reference: "WO-2026-0001" }, { reference: "WO-2026-0007" }];
    expect(nextReference(existing, 2026)).toBe("WO-2026-0008");
  });

  it("is gap-tolerant where a count would collide", () => {
    // Two orders exist but the book is up to 0009. A count-based generator
    // would return 0003 and collide with a live number.
    const existing = [{ reference: "WO-2026-0009" }, { reference: "WO-2026-0004" }];
    expect(nextReference(existing, 2026)).toBe("WO-2026-0010");
  });

  it("does not let unnumbered drafts advance the sequence", () => {
    const existing = [
      { reference: "WO-2026-0003" },
      { reference: "" },
      { reference: "" },
    ];
    expect(nextReference(existing, 2026)).toBe("WO-2026-0004");
  });

  it("restarts each year without tripping over the previous one", () => {
    const existing = [{ reference: "WO-2025-0412" }];
    expect(nextReference(existing, 2026)).toBe("WO-2026-0001");
  });

  it("ignores references that don't match the format", () => {
    const existing = [{ reference: "WO-TEST" }, { reference: "WO-2026-0002" }];
    expect(nextReference(existing, 2026)).toBe("WO-2026-0003");
  });
});

describe("draft references", () => {
  it("treats an empty reference as not yet numbered", () => {
    expect(hasReference({ reference: "" })).toBe(false);
    expect(hasReference({ reference: "WO-2026-0001" })).toBe(true);
    expect(displayReference({ reference: "" })).toMatch(/not yet numbered/i);
    expect(displayReference({ reference: "WO-2026-0001" })).toBe("WO-2026-0001");
  });
});

describe("assignOnApproval", () => {
  it("assigns the owning provider without touching the vendor", () => {
    const result = assignOnApproval({ vendor: "" }, "prov-mekanikomore");
    expect(result.assignedProviderId).toBe("prov-mekanikomore");
    // Writing the provider's own name here would put the shop in its own
    // vendor-spend analytics beside real subcontractors.
    expect(result.vendor).toBe("");
  });

  it("leaves a real subcontractor in place", () => {
    const result = assignOnApproval({ vendor: "Rapide Auto"  }, "prov-mekanikomore");
    expect(result.vendor).toBe("Rapide Auto");
    expect(result.assignedProviderId).toBe("prov-mekanikomore");
  });

  it("reads an empty vendor as in-house work", () => {
    expect(isInHouse({ vendor: "" })).toBe(true);
    expect(isInHouse({ vendor: "   " })).toBe(true);
    expect(isInHouse({ vendor: "Rapide Auto" })).toBe(false);
  });
});

describe("stage coverage", () => {
  it("maps every stored status to a stage", () => {
    const all: WorkOrderStatus[] = [
      "draft",
      "pending_approval",
      "approved",
      "partially_approved",
      "declined",
      "scheduled",
      "in_progress",
      "closed",
      "cancelled",
    ];
    for (const status of all) {
      expect(
        lifecycleStage({ status, collectedAt: null } as Pick<
          WorkOrder,
          "status" | "collectedAt"
        >)
      ).toBeTruthy();
    }
  });
});
