"use client";

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useChartColors } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

/** 12-point sparkline; the trailing point wears the accent so "now" is findable. */
function Sparkline({ values, tone }: { values: number[]; tone: string }) {
  const colors = useChartColors();
  if (values.length < 2) return null;

  const width = 96;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="overflow-visible"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={colors.grid}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The 2px surface ring keeps the end-dot legible where it crosses the line. */}
      <circle
        cx={lastX}
        cy={lastY}
        r={3.5}
        fill={tone}
        stroke={colors.surface}
        strokeWidth={2}
      />
    </svg>
  );
}

export interface StatTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Signed change against a named period, e.g. { value: -8, period: "vs last month" }. */
  delta?: { value: number; period: string; goodDirection?: "up" | "down" };
  hint?: string;
  trend?: number[];
  tone?: "brand" | "ok" | "warning" | "critical";
  className?: string;
}

export function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  hint,
  trend,
  tone = "brand",
  className,
}: StatTileProps) {
  const colors = useChartColors();

  const accent = {
    brand: colors.series1,
    ok: colors.ok,
    warning: colors.warning,
    critical: colors.critical,
  }[tone];

  const iconClass = {
    brand: "text-brand bg-brand-muted",
    ok: "text-ok bg-ok/10",
    warning: "text-foreground bg-warning/20",
    critical: "text-critical bg-critical/10",
  }[tone];

  const goodDirection = delta?.goodDirection ?? "up";
  const isGood = delta
    ? goodDirection === "up"
      ? delta.value >= 0
      : delta.value <= 0
    : true;

  return (
    <div className={cn("card-raised p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            iconClass
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>

      {/* Proportional figures — tabular-nums makes a display-size number look loose. */}
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight">
        {value}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                isGood ? "text-ok" : "text-critical"
              )}
            >
              {delta.value >= 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(delta.value)}%
              <span className="font-normal text-subtle-foreground">
                {delta.period}
              </span>
            </span>
          ) : null}
          {hint ? (
            <p className="truncate text-xs text-subtle-foreground">{hint}</p>
          ) : null}
        </div>
        {trend ? <Sparkline values={trend} tone={accent} /> : null}
      </div>
    </div>
  );
}
