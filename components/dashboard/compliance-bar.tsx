"use client";

import Link from "next/link";
import { CheckCircle2, Clock, OctagonAlert } from "lucide-react";
import type { FleetSummary } from "@/lib/pms";
import { cn } from "@/lib/utils";

const BANDS = [
  {
    key: "ok" as const,
    label: "On schedule",
    icon: CheckCircle2,
    fill: "bg-ok",
    text: "text-ok",
    href: "/vehicles?pms=ok",
  },
  {
    key: "due_soon" as const,
    label: "Due soon",
    icon: Clock,
    fill: "bg-warning",
    text: "text-foreground",
    href: "/vehicles?pms=due_soon",
  },
  {
    key: "overdue" as const,
    label: "Overdue",
    icon: OctagonAlert,
    fill: "bg-critical",
    text: "text-critical",
    href: "/vehicles?pms=overdue",
  },
];

/**
 * Part-to-whole across three service states. A segmented meter rather than a
 * donut: the three values are close enough that arc lengths would be guesswork,
 * and every segment is spelled out underneath anyway.
 */
export function ComplianceBar({ summary }: { summary: FleetSummary }) {
  const counts = {
    ok: summary.compliant,
    due_soon: summary.dueSoon,
    overdue: summary.overdue,
  };
  const total = Math.max(summary.total, 1);

  return (
    <div className="card-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Fleet PMS compliance
          </h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            Every vehicle, graded by its most urgent open interval.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[28px] font-semibold leading-none tracking-tight">
            {summary.complianceRate}%
          </p>
          <p className="mt-1 text-2xs text-subtle-foreground">
            no overdue items
          </p>
        </div>
      </div>

      {/* 2px surface gaps do the separating between segments — no borders. */}
      <div className="mt-5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3">
        {BANDS.map((band) => {
          const count = counts[band.key];
          if (count === 0) return null;
          return (
            <div
              key={band.key}
              className={cn("h-full rounded-full transition-all duration-500", band.fill)}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${band.label}: ${count}`}
            />
          );
        })}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        {BANDS.map((band) => {
          const count = counts[band.key];
          const Icon = band.icon;
          return (
            <Link
              key={band.key}
              href={band.href}
              className="group rounded-md border border-border bg-surface-2/50 p-3 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <dt className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
                <Icon className={cn("size-3.5 shrink-0", band.text)} />
                {band.label}
              </dt>
              <dd className="mt-1.5 text-xl font-semibold leading-none tracking-tight">
                {count}
                <span className="ml-1 text-xs font-normal text-subtle-foreground">
                  / {summary.total}
                </span>
              </dd>
            </Link>
          );
        })}
      </dl>
    </div>
  );
}
