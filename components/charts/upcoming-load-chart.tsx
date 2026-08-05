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
import type { UpcomingBucket } from "@/lib/analytics";

/**
 * Forward workload. The three bands are service *states*, not data series, so
 * they wear the reserved status palette — and the legend spells each one out so
 * the colour is never carrying the meaning alone.
 */
export function UpcomingLoadChart({
  data,
  className,
}: {
  data: UpcomingBucket[];
  className?: string;
}) {
  const colors = useChartColors();

  const series = [
    { label: "Overdue", color: colors.critical },
    { label: "Due soon", color: colors.warning },
    { label: "Scheduled", color: colors.series1 },
  ];

  return (
    <ChartFrame
      title="Six-week service load"
      description="PMS items falling due, by week. Anything past its limit sits in the first bar."
      series={series}
      className={className}
      table={
        <ChartTable
          head={["Week", "Overdue", "Due soon", "Scheduled"]}
          rows={data.map((bucket) => [
            `${bucket.label} (${bucket.range})`,
            bucket.overdue,
            bucket.dueSoon,
            bucket.upcoming,
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={252}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={colors.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" {...axisProps(colors)} />
          <YAxis {...axisProps(colors)} width={28} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: colors.grid, fillOpacity: 0.45 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const bucket = payload[0].payload as UpcomingBucket;
              return (
                <TooltipShell
                  label={`${bucket.label} · ${bucket.range}`}
                  rows={[
                    {
                      key: "overdue",
                      label: "Overdue",
                      value: String(bucket.overdue),
                      color: colors.critical,
                    },
                    {
                      key: "due",
                      label: "Due soon",
                      value: String(bucket.dueSoon),
                      color: colors.warning,
                    },
                    {
                      key: "upcoming",
                      label: "Scheduled",
                      value: String(bucket.upcoming),
                      color: colors.series1,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="overdue"
            stackId="load"
            fill={colors.critical}
            stroke={colors.surface}
            strokeWidth={2}
            maxBarSize={24}
          />
          <Bar
            dataKey="dueSoon"
            stackId="load"
            fill={colors.warning}
            stroke={colors.surface}
            strokeWidth={2}
            maxBarSize={24}
          />
          <Bar
            dataKey="upcoming"
            stackId="load"
            fill={colors.series1}
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
