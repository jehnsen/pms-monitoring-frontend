import { AlertTriangle, CheckCircle2, CircleSlash, Clock, HeartPulse, Minus, Play, Wrench, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/progress";
import type { Equipment, EquipmentReport } from "@/types/equipment";

/** Status chips carry an icon and a label; the status palette is for state only. */
const SERVICE: Record<"ok" | "due_soon" | "overdue", { icon: LucideIcon; tone: "ok" | "warning" | "critical" }> = {
  ok: { icon: CheckCircle2, tone: "ok" },
  due_soon: { icon: Clock, tone: "warning" },
  overdue: { icon: AlertTriangle, tone: "critical" },
};

const STATUS: Record<string, { icon: LucideIcon; tone: "ok" | "brand" | "warning" | "critical" | "outline" }> = {
  available: { icon: CheckCircle2, tone: "ok" },
  in_use: { icon: Play, tone: "brand" },
  maintenance: { icon: Wrench, tone: "warning" },
  repair: { icon: AlertTriangle, tone: "critical" },
  retired: { icon: CircleSlash, tone: "outline" },
};

export function ServiceBadge({ service }: { service: EquipmentReport["service"] }) {
  if (!service) {
    return (
      <Badge tone="outline">
        <Minus aria-hidden />
        Not tracked
      </Badge>
    );
  }
  const { icon: Icon, tone } = SERVICE[service.level];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {service.levelLabel}
    </Badge>
  );
}

export function ToolStatusBadge({ tool }: { tool: Pick<Equipment, "status" | "statusLabel"> }) {
  const { icon: Icon, tone } = STATUS[tool.status] ?? STATUS.available;
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {tool.statusLabel}
    </Badge>
  );
}

const BAND_LABEL = { good: "Good", fair: "Fair", poor: "Poor", critical: "Critical" } as const;

/** The API's 0–100 health score with its band in words. */
export function HealthScore({ health }: { health: EquipmentReport["health"] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <HeartPulse className="size-3.5 text-subtle-foreground" aria-hidden />
      <span className="tabular font-medium">{health.score}</span>
      <span className="text-2xs text-subtle-foreground">{BAND_LABEL[health.band]}</span>
    </span>
  );
}

const UNIT = { hours: "h", cycles: "jobs", cups: "cups", days: "days" } as const;

/** What a service limit is called on screen. */
export const LIMIT_LABEL = { hours: "Runtime hours", cycles: "Jobs", cups: "Cups", days: "Days" } as const;

/** How far into its service interval the tool is, with the limit that trips first, as the API reports them. */
export function ServiceMeter({ service }: { service: EquipmentReport["service"] }) {
  if (!service) return <span className="text-2xs text-subtle-foreground">No interval set</span>;
  const binding = service.triggers.find((trigger) => trigger.key === service.binding) ?? service.triggers[0];
  const tone = service.level === "overdue" ? "critical" : service.level === "due_soon" ? "warning" : "ok";
  const round = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return (
    <div className="min-w-28">
      <Meter value={service.progress} tone={tone} label={`${Math.round(service.progress * 100)}% of the service interval used`} />
      <p className="tabular mt-1 text-2xs text-subtle-foreground">
        {round(binding.used)} of {round(binding.interval)} {UNIT[binding.key]}
      </p>
    </div>
  );
}

export function formatHours(hours: number) {
  return `${hours.toLocaleString("en-PH", { maximumFractionDigits: 1 })} h`;
}
