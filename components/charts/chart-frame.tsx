"use client";

import * as React from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SeriesKey {
  label: string;
  color: string;
  /** Lines get a bar key, fills get a dot — matches how the mark looks in the plot. */
  shape?: "square" | "line";
}

/**
 * Every chart ships with a table twin. Colour and position are never the only
 * way to read a value, and the toggle keeps the tabular form one click away
 * rather than behind a tooltip.
 */
export function ChartFrame({
  title,
  description,
  series,
  table,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  series?: SeriesKey[];
  table: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const id = React.useId();

  return (
    <section className={cn("card-raised flex flex-col", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-subtle-foreground">{description}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {action}
          <div
            role="tablist"
            aria-label={`${title} view`}
            className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5"
          >
            {(
              [
                { value: "chart", icon: BarChart3, label: "Chart" },
                { value: "table", icon: Table2, label: "Table" },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                role="tab"
                aria-selected={view === value}
                aria-controls={`${id}-${value}`}
                onClick={() => setView(value)}
                title={`${label} view`}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded transition-colors",
                  view === value
                    ? "bg-surface text-foreground shadow-xs"
                    : "text-subtle-foreground hover:text-muted-foreground"
                )}
              >
                <Icon className="size-3.5" />
                <span className="sr-only">{label} view</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* A legend is always present for two or more series. */}
      {series && series.length > 1 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pb-3">
          {series.map((key) => (
            <span
              key={key.label}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className={cn(
                  "shrink-0 rounded-[2px]",
                  key.shape === "line" ? "h-0.5 w-3.5" : "size-2.5"
                )}
                style={{ backgroundColor: key.color }}
              />
              {key.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex-1 px-2 pb-4">
        <div id={`${id}-chart`} role="tabpanel" hidden={view !== "chart"}>
          {view === "chart" ? children : null}
        </div>
        <div
          id={`${id}-table`}
          role="tabpanel"
          hidden={view !== "table"}
          className="px-3"
        >
          {view === "table" ? table : null}
        </div>
      </div>
    </section>
  );
}

/** Compact table used by the chart frames' table view. */
export function ChartTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-2 text-subtle-foreground">
          <tr>
            {head.map((cell, index) => (
              <th
                key={cell}
                scope="col"
                className={cn(
                  "px-3 py-2 font-medium",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    "px-3 py-2",
                    cellIndex === 0
                      ? "text-left font-medium"
                      : "tabular text-right text-muted-foreground"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shared tooltip shell so hover reads the same in every chart. */
export function TooltipShell({
  label,
  rows,
}: {
  label: string;
  rows: { key: string; label: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-popover">
      <p className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
        {label}
      </p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-xs">
            {row.color ? (
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular ml-auto font-medium">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
