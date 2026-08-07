"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame, ChartTable, TooltipShell } from "@/components/charts/chart-frame";
import { axisProps, useChartColors } from "@/lib/chart-theme";
import type { UtilisationPoint } from "@/lib/shop";

/**
 * Utilisation over time — one series, one y-axis, in percent.
 *
 * The 100% reference line is the only annotation: the question this chart is
 * asked is "are we above or below capacity", and a gridline answers it faster
 * than reading the axis does.
 */
export function BayUtilisationChart({
  data,
  className,
}: {
  data: UtilisationPoint[];
  className?: string;
}) {
  const colors = useChartColors();

  return (
    <ChartFrame
      title="Bay utilisation"
      description="Booked hours against floor capacity, by day."
      className={className}
      table={
        <ChartTable
          head={["Day", "Booked hours", "Utilisation"]}
          rows={data.map((point) => [
            point.label,
            `${point.bookedHours}h`,
            `${point.utilisation}%`,
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="bay-util-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.series1} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colors.series1} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={colors.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" {...axisProps(colors)} />
          <YAxis
            {...axisProps(colors)}
            width={44}
            tickFormatter={(value: number) => `${value}%`}
          />
          <ReferenceLine
            y={100}
            stroke={colors.axis}
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <Tooltip
            cursor={{ stroke: colors.grid, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as UtilisationPoint;
              return (
                <TooltipShell
                  label={point.label}
                  rows={[
                    {
                      key: "util",
                      label: "Utilisation",
                      value: `${point.utilisation}%`,
                      color: colors.series1,
                    },
                    {
                      key: "hours",
                      label: "Booked",
                      value: `${point.bookedHours}h`,
                      color: colors.axis,
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="utilisation"
            stroke={colors.series1}
            strokeWidth={2}
            fill="url(#bay-util-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
