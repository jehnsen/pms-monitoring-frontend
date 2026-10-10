import { CalendarClock, CheckCircle2, CircleDashed, CircleSlash, Loader, UserX, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/types/detailing";

/** A status chip always carries an icon and a label; the status palette is state, never a series. */
const STATUS: Record<BookingStatus, { label: string; icon: LucideIcon; tone: "neutral" | "brand" | "ok" | "warning" | "critical" | "outline" }> = {
  pending: { label: "Pending", icon: CircleDashed, tone: "warning" },
  confirmed: { label: "Confirmed", icon: CalendarClock, tone: "brand" },
  on_going: { label: "On-going", icon: Loader, tone: "brand" },
  completed: { label: "Completed", icon: CheckCircle2, tone: "ok" },
  cancelled: { label: "Cancelled", icon: CircleSlash, tone: "outline" },
  no_show: { label: "No-show", icon: UserX, tone: "critical" },
};

export const BOOKING_STATUSES = Object.keys(STATUS) as BookingStatus[];

export function bookingStatusLabel(status: BookingStatus) {
  return STATUS[status].label;
}

export function BookingStatusBadge({ status, size }: { status: BookingStatus; size?: "sm" | "md" }) {
  const { label, icon: Icon, tone } = STATUS[status];
  return (
    <Badge tone={tone} size={size}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

/** "Mon 13 Oct" from a business date, without a timezone shift. */
export function formatDay(date: string | null) {
  if (!date) return "—";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-PH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
