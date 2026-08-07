import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileEdit,
  Hourglass,
  ListChecks,
  OctagonAlert,
  PackageCheck,
  Send,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type {
  LineApprovalStatus,
  PmsStatus,
  Priority,
  
  PurchaseOrderStatus,
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
  draft: { label: "Draft", tone: "neutral", icon: FileEdit },
  pending_approval: { label: "Pending approval", tone: "warning", icon: Hourglass },
  approved: { label: "Approved", tone: "ok", icon: ThumbsUp },
  partially_approved: { label: "Partially approved", tone: "warning", icon: ListChecks },
  declined: { label: "Declined", tone: "critical", icon: ThumbsDown },
  scheduled: { label: "Scheduled", tone: "neutral", icon: Clock },
  in_progress: { label: "In progress", tone: "warning", icon: Wrench },
  closed: { label: "Closed", tone: "ok", icon: CheckCircle2 },
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

const LINE_APPROVAL_META: Record<
  LineApprovalStatus,
  { label: string; tone: BadgeProps["tone"]; icon: typeof CheckCircle2 }
> = {
  pending: { label: "Pending", tone: "warning", icon: Hourglass },
  approved: { label: "Approved", tone: "ok", icon: ThumbsUp },
  declined: { label: "Declined", tone: "critical", icon: ThumbsDown },
  deferred: { label: "Deferred", tone: "neutral", icon: CircleDashed },
};

export function LineApprovalStatusBadge({
  status,
  size = "sm",
}: {
  status: LineApprovalStatus;
  size?: BadgeProps["size"];
}) {
  const meta = LINE_APPROVAL_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} size={size}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

const PURCHASE_ORDER_META: Record<
  PurchaseOrderStatus,
  { label: string; tone: BadgeProps["tone"]; icon: typeof CheckCircle2 }
> = {
  draft: { label: "Draft", tone: "neutral", icon: FileEdit },
  sent: { label: "Sent", tone: "warning", icon: Send },
  received: { label: "Received", tone: "ok", icon: PackageCheck },
  cancelled: { label: "Cancelled", tone: "outline", icon: XCircle },
};

export function PurchaseOrderStatusBadge({
  status,
  size = "sm",
}: {
  status: PurchaseOrderStatus;
  size?: BadgeProps["size"];
}) {
  const meta = PURCHASE_ORDER_META[status];
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
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  partially_approved: "Partially approved",
  declined: "Declined",
  scheduled: "Scheduled",
  in_progress: "In progress",
  closed: "Closed",
  cancelled: "Cancelled",
};
