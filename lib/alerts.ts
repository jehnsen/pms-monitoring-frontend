import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  Alert,
  AlertInteraction,
  FleetDocument,
  VehicleHealth,
  WorkOrder,
} from "@/types";
import { formatDayDelta, formatKm } from "@/lib/utils";

/** A document inside this window of its renewal date raises an alert. */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 45;

/**
 * Alerts are *derived*, never stored. Recomputing them from fleet state on
 * every read means a notification can never contradict the data behind it — a
 * stored alert would survive the condition that produced it. Ids are
 * deterministic so the user's read/dismiss decisions still stick across
 * reloads.
 */
export function buildAlerts(
  health: VehicleHealth[],
  workOrders: WorkOrder[],
  documents: FleetDocument[],
  today = new Date()
): Alert[] {
  const alerts: Alert[] = [];

  // 1. Breached and closing service intervals — mileage or time, whichever governs.
  for (const entry of health) {
    for (const item of entry.items) {
      if (item.status === "ok") continue;

      const overdue = item.status === "overdue";
      const distance =
        item.kmRemaining <= 0
          ? `${formatKm(Math.abs(item.kmRemaining))} past the limit`
          : `${formatKm(item.kmRemaining)} remaining`;

      alerts.push({
        id: `pms:${entry.vehicle.id}:${item.task.id}`,
        kind: overdue ? "pms_overdue" : "pms_due_soon",
        severity: overdue ? "critical" : "warning",
        title: `${item.task.name} — ${entry.vehicle.plateNumber}`,
        body: `${overdue ? "Overdue" : "Due soon"} · ${distance} · ${formatDayDelta(
          item.daysRemaining
        )} · governed by ${item.governedBy}.`,
        vehicleId: entry.vehicle.id,
        href: `/vehicles/${entry.vehicle.id}`,
        daysRemaining: item.daysRemaining,
      });
    }
  }

  // 2. Scheduled work that has slipped past its booking date without closing.
  for (const order of workOrders) {
    if (order.status === "completed" || order.status === "cancelled") continue;
    const days = differenceInCalendarDays(parseISO(order.scheduledFor), today);
    if (days >= 0) continue;

    alerts.push({
      id: `wo:${order.id}`,
      kind: "work_order_overdue",
      severity: "warning",
      title: `${order.reference} is past its slot`,
      body: `${order.title} was booked for ${formatDayDelta(days).replace(
        " overdue",
        " ago"
      )} and is still ${order.status.replace("_", " ")}.`,
      vehicleId: order.vehicleId,
      href: `/work-orders/${order.id}`,
      daysRemaining: days,
    });
  }

  // 3. Registration and insurance approaching renewal.
  for (const doc of documents) {
    if (!doc.expiresOn) continue;
    const days = differenceInCalendarDays(parseISO(doc.expiresOn), today);
    if (days > DOCUMENT_EXPIRY_WARNING_DAYS) continue;

    alerts.push({
      id: `doc:${doc.id}`,
      kind: "document_expiry",
      severity: days < 0 ? "critical" : "warning",
      title: days < 0 ? `${doc.name} has expired` : `${doc.name} expires soon`,
      body: `${
        doc.kind === "insurance"
          ? "Insurance policy"
          : doc.kind === "registration"
            ? "Registration"
            : "Document"
      } ${formatDayDelta(days)}.`,
      vehicleId: doc.vehicleId,
      href: doc.vehicleId ? `/vehicles/${doc.vehicleId}` : "/documents",
      daysRemaining: days,
    });
  }

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;

  return alerts.sort((a, b) => {
    const bySeverity = severityRank[a.severity] - severityRank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.daysRemaining - b.daysRemaining;
  });
}

export interface AlertView {
  all: Alert[];
  /** Everything the user hasn't dismissed. */
  visible: Alert[];
  unread: Alert[];
  unreadCount: number;
  dismissedCount: number;
}

export function viewAlerts(
  alerts: Alert[],
  interaction: AlertInteraction
): AlertView {
  const dismissed = new Set(interaction.dismissedIds);
  const read = new Set(interaction.readIds);

  const visible = alerts.filter((alert) => !dismissed.has(alert.id));
  const unread = visible.filter((alert) => !read.has(alert.id));

  return {
    all: alerts,
    visible,
    unread,
    unreadCount: unread.length,
    // Only count dismissals that still correspond to a live condition, so the
    // "restore" affordance doesn't advertise alerts that have since resolved.
    dismissedCount: alerts.filter((alert) => dismissed.has(alert.id)).length,
  };
}
