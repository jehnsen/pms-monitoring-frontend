import { CheckCircle2, Clock, Loader, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MonitorJob, MonitorView } from "@/types/detailing";

const STAGE: Record<MonitorJob["stage"], { label: string; icon: LucideIcon; className: string }> = {
  upcoming: { label: "Upcoming", icon: Clock, className: "border-border text-muted-foreground" },
  in_progress: { label: "In progress", icon: Loader, className: "border-brand/40 bg-brand-muted text-brand" },
  done: { label: "Done", icon: CheckCircle2, className: "border-ok/30 bg-ok/10 text-ok" },
};

/**
 * The shop monitor's cards: today's confirmed, on-going and completed jobs as
 * the API lists them, with the start and finish it worked out. Used by the
 * staff page and by the wall screen, which sets `large`.
 */
export function MonitorBoard({ monitor, large = false }: { monitor: MonitorView; large?: boolean }) {
  if (monitor.jobs.length === 0) {
    return <p className={cn("rounded-lg border border-border bg-surface p-8 text-center text-muted-foreground", large ? "text-xl" : "text-sm")}>No confirmed jobs for this day yet.</p>;
  }

  return (
    <ul className={cn("grid gap-4", large ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3")}>
      {monitor.jobs.map((job) => {
        const stage = STAGE[job.stage];
        const Icon = stage.icon;
        return (
          <li key={job.id} className={cn("rounded-lg border border-border bg-surface", large ? "p-6" : "p-4", job.stage === "in_progress" && "border-brand/50")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn("truncate font-semibold text-foreground", large ? "text-2xl" : "text-sm")}>{job.vehicleLabel || job.customerName}</p>
                <p className={cn("truncate text-muted-foreground", large ? "text-base" : "text-xs")}>
                  {job.customerName} · {job.packageName}
                </p>
              </div>
              <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium", large ? "text-sm" : "text-2xs", stage.className)}>
                <Icon className={cn(large ? "size-4" : "size-3", job.stage === "in_progress" && "animate-spin [animation-duration:3s]")} aria-hidden />
                {stage.label}
              </span>
            </div>

            <dl className={cn("mt-4 grid grid-cols-2 gap-3", large ? "text-base" : "text-xs")}>
              <div>
                <dt className="text-subtle-foreground">{job.continuesFrom ? "Continues" : "Start"}</dt>
                <dd className={cn("font-medium text-foreground", large && "text-xl")}>{job.startLabel}</dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">{job.finish.actual ? "Finished" : "Finish"}</dt>
                <dd className={cn("font-medium text-foreground", large && "text-xl")}>{job.finish.label ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Detailers</dt>
                <dd className="text-foreground">{job.detailers.length > 0 ? job.detailers.join(", ") : `${job.detailersCount} to be named`}</dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Bay</dt>
                <dd className="text-foreground">{job.bayName ?? "—"}</dd>
              </div>
            </dl>

            {job.checklist.total > 0 ? (
              <p className={cn("mt-3 text-subtle-foreground", large ? "text-sm" : "text-2xs")}>
                Checklist {job.checklist.done} of {job.checklist.total}
                {job.qcStatus === "passed" ? " · Signed off" : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
