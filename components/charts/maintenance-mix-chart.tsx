"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTable, TooltipShell } from "@/components/charts/chart-frame";
import { axisProps, useChartColors } from "@/lib/chart-theme";
import type { MonthlyCostPoint } from "@/lib/analytics";

/**
 * Planned versus unplanned work over time. A fleet running its PMS properly
 * should show the preventive line comfortably above the corrective one.
 */
export function MaintenanceMixChart({
  data,
  className,
}: {
  data: MonthlyCostPoint[];
  className?: string;
}) {
  const colors = useChartColors();

  const series = [
    { label: "Preventive", color: colors.series1, shape: "line" as const },
    { label: "Corrective", color: colors.series2, shape: "line" as const },
  ];

  return (
    <ChartFrame
      title="Planned vs unplanned work"
      description="Closed work orders per month by type."
      series={series}
      className={className}
      table={
        <ChartTable
          head={["Month", "Preventive", "Corrective"]}
          rows={data.map((point) => [
            point.month,
            point.preventive,
            point.corrective,
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={264}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={colors.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="month" {...axisProps(colors)} />
          <YAxis {...axisProps(colors)} width={28} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: colors.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as MonthlyCostPoint;
              return (
                <TooltipShell
                  label={label as string}
                  rows={[
                    {
                      key: "preventive",
                      label: "Preventive",
                      value: String(point.preventive),
                      color: colors.series1,
                    },
                    {
                      key: "corrective",
                      label: "Corrective",
                      value: String(point.corrective),
                      color: colors.series2,
                    },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="preventive"
            stroke={colors.series1}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: colors.surface,
              fill: colors.series1,
            }}
          />
          <Line
            type="monotone"
            dataKey="corrective"
            stroke={colors.series2}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: colors.surface,
              fill: colors.series2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
