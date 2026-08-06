import { addWeeks, differenceInCalendarDays, parseISO } from "date-fns";
import type { Part, PurchaseOrder, VehicleHealth, WorkOrder } from "@/types";
import { SERVICE_ITEM_PARTS } from "@/lib/parts";

export interface DemandContributor {
  vehicleId: string;
  taskId: string;
  dueDate: string;
}

export interface PartDemandRow {
  part: Part;
  quantityRequired: number;
  shortfall: number;
  estimatedCost: number;
  /** Earliest projected due date among the items driving this row. */
  earliestNeededOn: string;
  /** Not enough lead time left to reorder before the earliest need. */
  leadTimeRisk: boolean;
  contributingItems: DemandContributor[];
}

function coverageKey(vehicleId: string, taskId: string) {
  return `${vehicleId}:${taskId}`;
}

/**
 * Projects parts demand over a horizon from the PMS engine's own due-date
 * projections (`PmsItem.dueDate`, which is `computeIntervalStatus`'s output —
 * nothing is re-derived here). A due item is excluded once it's already
 * covered by a live work order or an open purchase order, so re-running the
 * forecast — or running it after raising a job — never double-counts.
 */
export function computePartsDemand(
  health: VehicleHealth[],
  workOrders: WorkOrder[],
  purchaseOrders: PurchaseOrder[],
  parts: Part[],
  horizonWeeks: number,
  today: Date
): PartDemandRow[] {
  const horizonEnd = addWeeks(today, horizonWeeks);

  const coveredByWorkOrder = new Set<string>();
  for (const order of workOrders) {
    if (order.status === "closed" || order.status === "cancelled" || order.status === "declined") {
      continue;
    }
    for (const taskId of order.taskIds) {
      coveredByWorkOrder.add(coverageKey(order.vehicleId, taskId));
    }
  }

  const coveredByPurchaseOrder = new Set<string>();
  for (const po of purchaseOrders) {
    if (po.status === "received" || po.status === "cancelled") continue;
    for (const line of po.lines) {
      for (const taskId of line.serviceTaskIds) {
        for (const vehicleId of line.vehicleIds) {
          coveredByPurchaseOrder.add(coverageKey(vehicleId, taskId));
        }
      }
    }
  }

  const contributorsByPart = new Map<string, DemandContributor[]>();

  for (const entry of health) {
    for (const item of entry.items) {
      if (parseISO(item.dueDate) > horizonEnd) continue;

      const k = coverageKey(entry.vehicle.id, item.task.id);
      if (coveredByWorkOrder.has(k) || coveredByPurchaseOrder.has(k)) continue;

      for (const link of SERVICE_ITEM_PARTS) {
        if (link.serviceTaskId !== item.task.id) continue;
        const list = contributorsByPart.get(link.partId) ?? [];
        list.push({ vehicleId: entry.vehicle.id, taskId: item.task.id, dueDate: item.dueDate });
        contributorsByPart.set(link.partId, list);
      }
    }
  }

  const partsById = new Map(parts.map((part) => [part.id, part]));
  const rows: PartDemandRow[] = [];

  for (const [partId, contributingItems] of contributorsByPart) {
    const part = partsById.get(partId);
    if (!part) continue;

    const quantityPerTask = new Map(
      SERVICE_ITEM_PARTS.filter((link) => link.partId === partId).map((link) => [
        link.serviceTaskId,
        link.quantityPerService,
      ])
    );
    const quantityRequired = contributingItems.reduce(
      (total, item) => total + (quantityPerTask.get(item.taskId) ?? 0),
      0
    );

    const shortfall = Math.max(0, quantityRequired - part.currentStock);
    const estimatedCost = shortfall * part.unitCost;
    const earliestNeededOn = contributingItems.reduce(
      (earliest, item) => (item.dueDate < earliest ? item.dueDate : earliest),
      contributingItems[0].dueDate
    );
    const leadTimeRisk =
      shortfall > 0 &&
      differenceInCalendarDays(parseISO(earliestNeededOn), today) <= part.leadTimeDays;

    rows.push({
      part,
      quantityRequired,
      shortfall,
      estimatedCost,
      earliestNeededOn,
      leadTimeRisk,
      contributingItems,
    });
  }

  return rows.sort(
    (a, b) => b.shortfall - a.shortfall || b.quantityRequired - a.quantityRequired
  );
}

function displayQuantity(row: PartDemandRow) {
  const bareName = row.part.name.replace(/\s*\([^)]*\)\s*$/, "");
  const plural =
    row.part.unit === "piece" && row.quantityRequired !== 1 ? `${bareName}s` : bareName;
  return row.part.unit === "litre"
    ? `${row.quantityRequired} L ${bareName}`
    : `${row.quantityRequired} ${plural.toLowerCase()}`;
}

/** The one-line, plain-English version of the table — what a purchasing officer reads first. */
export function summariseDemand(rows: PartDemandRow[], horizonWeeks: number): string {
  const active = rows.filter((row) => row.quantityRequired > 0);
  if (active.length === 0) {
    return `Next ${horizonWeeks} weeks — nothing due that isn't already covered.`;
  }

  const headline = [...active]
    .sort((a, b) => b.quantityRequired - a.quantityRequired)
    .slice(0, 3)
    .map(displayQuantity)
    .join(", ");

  const mostConstrained = [...active].sort((a, b) => b.shortfall - a.shortfall)[0];
  const coverageClause =
    mostConstrained.shortfall > 0
      ? ` Current stock covers ${Math.min(
          mostConstrained.part.currentStock,
          mostConstrained.quantityRequired
        )} of ${mostConstrained.quantityRequired} ${mostConstrained.part.name
          .replace(/\s*\([^)]*\)\s*$/, "")
          .toLowerCase()}${mostConstrained.part.unit === "piece" ? "s" : ""}.`
      : "";

  return `Next ${horizonWeeks} weeks — ${headline}.${coverageClause}`;
}
