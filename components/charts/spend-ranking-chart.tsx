"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTable, TooltipShell } from "@/components/charts/chart-frame";
import { axisProps, useChartColors } from "@/lib/chart-theme";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import type { NamedTotal } from "@/lib/analytics";

/**
 * Magnitude comparison across nominal categories, so every bar wears the same
 * hue — darkening by rank would double-encode the length the bar already shows.
 * `highlight` is the emphasis case: one bar in the accent, the rest recessive.
 */
export function SpendRankingChart({
  title,
  description,
  data,
  unitLabel = "Spend",
  highlightFirst = false,
  height = 300,
  className,
  valueFormat = "currency",
  axisWidth = 82,
}: {
  title: string;
  description?: string;
  data: NamedTotal[];
  unitLabel?: string;
  highlightFirst?: boolean;
  height?: number;
  className?: string;
  /** Currency for spend; plain numbers for counts and rates. */
  valueFormat?: "currency" | "number";
  axisWidth?: number;
}) {
  const colors = useChartColors();

  const full = (value: number) =>
    valueFormat === "currency"
      ? formatCurrency(value)
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const compact = (value: number) =>
    valueFormat === "currency"
      ? formatCurrencyCompact(value)
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <ChartFrame
      title={title}
      description={description}
      className={className}
      table={
        <ChartTable
          head={["Name", unitLabel]}
          rows={data.map((entry) => [
            entry.meta ? `${entry.name} · ${entry.meta}` : entry.name,
            full(entry.value),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 68, bottom: 0, left: 4 }}
        >
          <CartesianGrid stroke={colors.grid} strokeWidth={1} horizontal={false} />
          <XAxis
            type="number"
            {...axisProps(colors)}
            tickFormatter={(value: number) => compact(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            {...axisProps(colors)}
            width={axisWidth}
          />
          <Tooltip
            cursor={{ fill: colors.grid, fillOpacity: 0.45 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const entry = payload[0].payload as NamedTotal;
              return (
                <TooltipShell
                  label={entry.meta ? `${entry.name} · ${entry.meta}` : entry.name}
                  rows={[
                    {
                      key: "value",
                      label: unitLabel,
                      value: full(entry.value),
                      color: colors.series1,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" maxBarSize={18} radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={
                  highlightFirst && index > 0 ? colors.axis : colors.series1
                }
              />
            ))}
            {/* Values ride the bar tips — the axis then only has to carry scale. */}
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              fill={colors.text}
              fontSize={11}
              formatter={(value: number) => compact(value)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
