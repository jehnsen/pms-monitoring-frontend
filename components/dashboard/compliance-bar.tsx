"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clock, OctagonAlert, ShieldCheck } from "lucide-react";
import type { FleetSummary } from "@/lib/pms";
import { cn } from "@/lib/utils";

const BANDS = [
  { key: "ok" as const, label: "On schedule", icon: CheckCircle2, fill: "bg-ok", text: "text-ok", href: "/vehicles?pms=ok" },
  { key: "due_soon" as const, label: "Due soon", icon: Clock, fill: "bg-warning", text: "text-muted-foreground", href: "/vehicles?pms=due_soon" },
  { key: "overdue" as const, label: "Overdue", icon: OctagonAlert, fill: "bg-critical", text: "text-critical", href: "/vehicles?pms=overdue" },
];

export function ComplianceBar({ summary }: { summary: FleetSummary }) {
  const counts = { ok: summary.compliant, due_soon: summary.dueSoon, overdue: summary.overdue };
  const total = Math.max(summary.total, 1);

  return (
    <section className="card p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Fleet health</h2>
          <p className="mt-1 text-xs text-subtle-foreground">PMS compliance across {summary.total} vehicles</p>
        </div>
        <ShieldCheck className="size-5 text-brand" strokeWidth={1.5} />
      </header>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[40px] font-semibold leading-none tracking-[-0.05em]">{summary.total ? summary.complianceRate : "—"}{summary.total ? <span className="ml-0.5 text-2xl text-subtle-foreground">%</span> : null}</p>
          <p className="mt-2 text-[11px] text-subtle-foreground">{summary.total ? "of vehicles have no overdue items" : "No vehicles to assess yet"}</p>
        </div>
        <span className={cn("mb-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium", summary.overdue ? "bg-critical/10 text-critical" : "bg-surface-2 text-muted-foreground")}>
          {summary.overdue ? <OctagonAlert className="size-3" /> : <ShieldCheck className="size-3" />}
          {summary.overdue ? "Action needed" : summary.total ? "On track" : "No data"}
        </span>
      </div>
      <div aria-hidden className="mt-4 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3">
        {BANDS.map((band) => counts[band.key] ? <div key={band.key} className={cn("h-full", band.fill)} style={{ flex: counts[band.key] }} /> : null)}
      </div>
      <ul className="mt-4 divide-y divide-border/70">
        {BANDS.map(({ key, label, icon: Icon, text, href }) => (
          <li key={key}>
            <Link href={href} className="group flex items-center gap-2.5 rounded py-2.5 text-xs transition-colors hover:text-brand">
              <Icon className={cn("size-3.5 shrink-0", text)} />
              <span className="flex-1 text-muted-foreground">{label}</span>
              <span className="tabular font-semibold">{counts[key]}</span>
              <span className="tabular w-9 text-right text-[11px] text-subtle-foreground">{Math.round(counts[key] / total * 100)}%</span>
              <ArrowUpRight className="size-3 text-subtle-foreground group-hover:text-brand" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
