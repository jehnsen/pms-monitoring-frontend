import { ArrowRight } from "lucide-react";
import type { GuideProcess } from "@/lib/guide";

/**
 * A process as numbered steps. `compact` is the strip the workflow page
 * shows (titles only, in a row); the full form adds what happens at each step
 * and who does it.
 */
export function ProcessSteps({ process, compact = false }: { process: GuideProcess; compact?: boolean }) {
  if (compact) {
    return (
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs">
        {process.steps.map((step, index) => (
          <li key={step.title} className="flex items-center gap-1.5">
            <span className="rounded-full border border-border bg-surface px-2.5 py-1">
              <span className="tabular mr-1.5 text-subtle-foreground">{index + 1}</span>
              {step.title}
            </span>
            {index < process.steps.length - 1 ? <ArrowRight className="size-3.5 text-subtle-foreground" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="space-y-4">
      {process.steps.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand-muted text-xs font-semibold text-brand">{index + 1}</span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-medium">{step.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
            <p className="mt-1 text-2xs text-subtle-foreground">Done by: {step.who}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
