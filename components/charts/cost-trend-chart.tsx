"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTable, TooltipShell } from "@/components/charts/chart-frame";
import { axisProps, useChartColors } from "@/lib/chart-theme";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import type { MonthlyCostPoint } from "@/lib/analytics";

/**
 * Part-to-whole over time: what the fleet spent each month, split into the two
 * cost lines a manager can actually act on.
 */
export function CostTrendChart({
  data,
  className,
}: {
  data: MonthlyCostPoint[];
  className?: string;
}) {
  const colors = useChartColors();

  const series = [
    { label: "Parts", color: colors.series1 },
    { label: "Labour", color: colors.series2 },
  ];

  return (
    <ChartFrame
      title="Maintenance spend"
      description="Closed work orders by month, split into parts and labour."
      series={series}
      className={className}
      table={
        <ChartTable
          head={["Month", "Parts", "Labour", "Total"]}
          rows={data.map((point) => [
            point.month,
            formatCurrency(point.parts),
            formatCurrency(point.labor),
            formatCurrency(point.total),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={264}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid
            stroke={colors.grid}
            strokeWidth={1}
            vertical={false}
          />
          <XAxis dataKey="month" {...axisProps(colors)} />
          <YAxis
            {...axisProps(colors)}
            width={54}
            tickFormatter={(value: number) => formatCurrencyCompact(value)}
          />
          <Tooltip
            cursor={{ fill: colors.grid, fillOpacity: 0.45 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as MonthlyCostPoint;
              return (
                <TooltipShell
                  label={label as string}
                  rows={[
                    {
                      key: "parts",
                      label: "Parts",
                      value: formatCurrency(point.parts),
                      color: colors.series1,
                    },
                    {
                      key: "labor",
                      label: "Labour",
                      value: formatCurrency(point.labor),
                      color: colors.series2,
                    },
                    {
                      key: "total",
                      label: "Total",
                      value: formatCurrency(point.total),
                    },
                  ]}
                />
              );
            }}
          />
          {/* A 2px stroke in the surface colour is what opens the gap between
              stacked segments — no border ink is added to the marks. */}
          <Bar
            dataKey="parts"
            stackId="cost"
            fill={colors.series1}
            stroke={colors.surface}
            strokeWidth={2}
            maxBarSize={24}
          />
          <Bar
            dataKey="labor"
            stackId="cost"
            fill={colors.series2}
            stroke={colors.surface}
            strokeWidth={2}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
