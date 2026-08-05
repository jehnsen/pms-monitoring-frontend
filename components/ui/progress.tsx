import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A meter for one ratio against its limit. `overflow` renders the portion past
 * 100% in the same track so an overdue interval reads as "past the line" rather
 * than silently pinning at full.
 */
export function Meter({
  value,
  tone = "brand",
  className,
  label,
}: {
  /** 0–1, may exceed 1 when the limit has been passed. */
  value: number;
  tone?: "brand" | "ok" | "warning" | "critical";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(value, 1)) * 100;
  const overflow = value > 1;

  const fill = {
    brand: "bg-brand",
    ok: "bg-ok",
    warning: "bg-warning",
    critical: "bg-critical",
  }[tone];

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="meter"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          fill,
          // A hairline notch at the end marks a breached limit without adding a colour.
          overflow && "shadow-[inset_-2px_0_0_0_hsl(var(--surface))]"
        )}
        style={{ width: `${overflow ? 100 : pct}%` }}
      />
    </div>
  );
}
