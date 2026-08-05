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
}: {
  title: string;
  description?: string;
  data: NamedTotal[];
  unitLabel?: string;
  highlightFirst?: boolean;
  height?: number;
  className?: string;
}) {
  const colors = useChartColors();

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
            formatCurrency(entry.value),
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
            tickFormatter={(value: number) => formatCurrencyCompact(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            {...axisProps(colors)}
            width={82}
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
                      value: formatCurrency(entry.value),
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
              formatter={(value: number) => formatCurrencyCompact(value)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
