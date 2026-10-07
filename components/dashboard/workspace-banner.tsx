import Link from "next/link";
import { ArrowRight, Car, Wrench } from "lucide-react";

/** A compact, actionable introduction to each side of the service platform. */
export function WorkspaceBanner({ provider = false }: { provider?: boolean }) {
  const Icon = provider ? Wrench : Car;

  return (
    <section aria-label={provider ? "Service centre workspace" : "Fleet workspace"} className="workspace-banner mb-6 flex flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-4">
        <span className="hidden size-12 shrink-0 items-center justify-center rounded-xl border border-chrome-active/20 bg-chrome-active/10 text-chrome-active sm:flex">
          <Icon className="size-6" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-chrome-active">
            {provider ? "Service centre workspace" : "Fleet management workspace"}
          </p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
            {provider ? "Keep every service moving." : "Keep your fleet road-ready."}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-chrome-muted">
            {provider
              ? "Manage your bays, approvals, and handovers in one place."
              : "Plan maintenance, track vehicle health, and stay ahead of repairs."}
          </p>
        </div>
      </div>
      <Link href={provider ? "/shop/queue" : "/schedule"} className="inline-flex shrink-0 items-center gap-2 rounded-md border border-chrome-border bg-chrome-foreground/5 px-4 py-2.5 text-xs font-medium transition-colors hover:border-chrome-active/40 hover:bg-chrome-active/10">
        {provider ? "View job queue" : "View service schedule"}
        <ArrowRight className="size-3.5 text-chrome-active" />
      </Link>
    </section>
  );
}
