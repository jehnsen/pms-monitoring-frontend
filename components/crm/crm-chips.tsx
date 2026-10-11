import { AlertTriangle, Ban, CheckCircle2, CircleSlash, Clock, Hourglass, Send, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SKIP_REASON } from "@/lib/api/crm";
import type { CrmMessage, CrmTask } from "@/types/crm";

type Tone = "ok" | "brand" | "warning" | "critical" | "outline" | "neutral";

/** Status chips carry an icon and a label; the status palette is for state only. */
const MESSAGE: Record<CrmMessage["status"], { icon: LucideIcon; tone: Tone; label: string }> = {
  sent: { icon: Send, tone: "ok", label: "Sent" },
  queued: { icon: Hourglass, tone: "brand", label: "Queued" },
  failed: { icon: AlertTriangle, tone: "critical", label: "Failed" },
  skipped: { icon: Ban, tone: "outline", label: "Not sent" },
};

export function MessageStatus({ message }: { message: Pick<CrmMessage, "status" | "skipReason"> }) {
  const { icon: Icon, tone, label } = MESSAGE[message.status];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {message.status === "skipped" && message.skipReason ? (SKIP_REASON[message.skipReason] ?? label) : label}
    </Badge>
  );
}

export function TaskStatus({ task }: { task: Pick<CrmTask, "status" | "overdue"> }) {
  if (task.status === "done")
    return (
      <Badge tone="ok">
        <CheckCircle2 aria-hidden />
        Done
      </Badge>
    );
  if (task.status === "cancelled")
    return (
      <Badge tone="outline">
        <CircleSlash aria-hidden />
        Cancelled
      </Badge>
    );
  return task.overdue ? (
    <Badge tone="critical">
      <AlertTriangle aria-hidden />
      Overdue
    </Badge>
  ) : (
    <Badge tone="neutral">
      <Clock aria-hidden />
      Open
    </Badge>
  );
}

export const TASK_KIND: Record<string, string> = { follow_up: "Follow-up", call: "Call", booking_request: "Booking request", other: "Other" };
