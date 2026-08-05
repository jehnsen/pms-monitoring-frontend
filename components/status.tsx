import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  OctagonAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type {
  PmsStatus,
  Priority,
  VehicleOperationalStatus,
  WorkOrderStatus,
} from "@/types";

/**
 * Every status chip ships an icon and a written label. Status colour is a
 * reinforcement here, never the only channel carrying the meaning.
 */

const PMS_META: Record<
  PmsStatus,
  { label: string; tone: BadgeProps["tone"]; icon: typeof CheckCircle2 }
> = {
  ok: { label: "On schedule", tone: "ok", icon: CheckCircle2 },
  due_soon: { label: "Due soon", tone: "warning", icon: Clock },
  overdue: { label: "Overdue", tone: "critical", icon: OctagonAlert },
};

export function PmsStatusBadge({
  status,
  size = "sm",
  className,
}: {
  status: PmsStatus;
  size?: BadgeProps["size"];
  className?: string;
}) {
  const meta = PMS_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} size={size} className={className}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

const WORK_ORDER_META: Record<
  WorkOrderStatus,
  { label: string; tone: BadgeProps["tone"]; icon: typeof CheckCircle2 }
> = {
  open: { label: "Open", tone: "brand", icon: CircleDot },
  scheduled: { label: "Scheduled", tone: "neutral", icon: Clock },
  in_progress: { label: "In progress", tone: "warning", icon: Wrench },
  completed: { label: "Completed", tone: "ok", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "outline", icon: XCircle },
};

export function WorkOrderStatusBadge({
  status,
  size = "sm",
}: {
  status: WorkOrderStatus;
  size?: BadgeProps["size"];
}) {
  const meta = WORK_ORDER_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} size={size}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

const PRIORITY_META: Record<Priority, { label: string; tone: BadgeProps["tone"] }> =
  {
    low: { label: "Low", tone: "outline" },
    medium: { label: "Medium", tone: "neutral" },
    high: { label: "High", tone: "serious" },
    critical: { label: "Critical", tone: "critical" },
  };

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <Badge tone={meta.tone}>
      {priority === "critical" || priority === "high" ? <AlertTriangle /> : null}
      {meta.label}
    </Badge>
  );
}

const VEHICLE_META: Record<
  VehicleOperationalStatus,
  { label: string; tone: BadgeProps["tone"]; icon: typeof CheckCircle2 }
> = {
  active: { label: "In operation", tone: "ok", icon: CheckCircle2 },
  in_service: { label: "In the shop", tone: "warning", icon: Wrench },
  down: { label: "Off road", tone: "critical", icon: CircleDashed },
};

export function VehicleStatusBadge({
  status,
  size = "sm",
}: {
  status: VehicleOperationalStatus;
  size?: BadgeProps["size"];
}) {
  const meta = VEHICLE_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} size={size}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

export const PMS_STATUS_LABEL: Record<PmsStatus, string> = {
  ok: PMS_META.ok.label,
  due_soon: PMS_META.due_soon.label,
  overdue: PMS_META.overdue.label,
};

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: "Open",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
