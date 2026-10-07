"use client";

import { useTheme } from "@/components/theme-provider";

/**
 * Chart colours are resolved to literal hex rather than CSS custom properties:
 * SVG presentation attributes don't evaluate `var()`, so recharts needs real
 * values. These are the same steps the design tokens carry — each mode's set was
 * validated against that mode's surface, not flipped from the other.
 */
export interface ChartColors {
  series1: string;
  series2: string;
  series3: string;
  ok: string;
  warning: string;
  critical: string;
  grid: string;
  axis: string;
  surface: string;
  text: string;
  muted: string;
}

export const CHART_COLORS: Record<"light" | "dark", ChartColors> = {
  light: {
    series1: "#2a78d6",
    series2: "#eb6834",
    series3: "#1baf7a",
    ok: "#149050",
    warning: "#fab219",
    critical: "#ce2222",
    grid: "#dce2ea",
    axis: "#afbaca",
    surface: "#ffffff",
    text: "#536175",
    muted: "#637084",
  },
  dark: {
    series1: "#3987e5",
    series2: "#d95926",
    series3: "#199e70",
    ok: "#41d88f",
    warning: "#fab219",
    critical: "#f57b7b",
    grid: "#2b3546",
    axis: "#455367",
    surface: "#151b28",
    text: "#b4c0d0",
    muted: "#96a3b6",
  },
};

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  return CHART_COLORS[theme];
}

/** Shared axis/grid chrome so every chart in the app reads as one system. */
export function axisProps(colors: ChartColors) {
  return {
    stroke: colors.axis,
    tick: { fill: colors.muted, fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const;
}
