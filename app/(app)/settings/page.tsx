"use client";

import { useState } from "react";
import { Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SERVICE_TASKS, CATEGORY_LABEL } from "@/lib/service-tasks";
import { DUE_SOON_DAYS, DUE_SOON_KM } from "@/lib/pms";
import { useFleetActions, useFleet } from "@/lib/store";
import { useTheme } from "@/components/theme-provider";
import { cn, formatCurrency, formatKm } from "@/lib/utils";

function ThemeCard() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
  ];

  return (
    <section className="card-raised">
      <header className="px-5 pb-3 pt-4">
        <h3 className="text-sm font-semibold tracking-tight">Appearance</h3>
        <p className="mt-0.5 text-xs text-subtle-foreground">
          Both themes carry their own validated chart palette, stepped for that
          surface rather than flipped from the other.
        </p>
      </header>
      <div className="flex flex-wrap gap-3 border-t border-border px-5 py-5">
        {options.map((option) => {
          const Icon = option.icon;
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              aria-pressed={active}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                active
                  ? "border-brand bg-brand-muted"
                  : "border-border bg-surface hover:border-border-strong"
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-md",
                  active ? "bg-brand text-brand-foreground" : "bg-surface-2"
                )}
              >
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-2xs text-subtle-foreground">
                  {active ? "Currently active" : "Switch to this theme"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ResetCard() {
  const { resetFleet } = useFleetActions();
  const [open, setOpen] = useState(false);

  return (
    <section className="card-raised">
      <header className="px-5 pb-3 pt-4">
        <h3 className="text-sm font-semibold tracking-tight">Demo data</h3>
        <p className="mt-0.5 text-xs text-subtle-foreground">
          The fleet lives in this browser&apos;s local storage. Resetting rebuilds
          it from the seed and discards everything you have logged.
        </p>
      </header>
      <div className="border-t border-border px-5 py-5">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">
              <RotateCcw />
              Reset fleet data
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reset the demo fleet?</DialogTitle>
              <DialogDescription>
                Work orders you raised, odometer readings you logged, and every
                completion will be discarded.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-muted-foreground">
                The fleet will be rebuilt from the original sixteen vehicles with
                twelve months of generated service history.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Keep my data
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetFleet();
                  setOpen(false);
                }}
              >
                Reset everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { ready, summary } = useFleet();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Service intervals, warning thresholds, and the data behind the dashboard."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <ThemeCard />

        <section className="card-raised">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">
              Warning thresholds
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              When an interval moves from on-schedule into the due-soon band.
            </p>
          </header>
          <dl className="grid grid-cols-2 gap-4 border-t border-border px-5 py-5">
            <div className="rounded-lg border border-border bg-surface-2/50 p-4">
              <dt className="text-2xs uppercase tracking-wider text-subtle-foreground">
                Distance ahead
              </dt>
              <dd className="mt-1.5 text-xl font-semibold tracking-tight">
                {formatKm(DUE_SOON_KM)}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/50 p-4">
              <dt className="text-2xs uppercase tracking-wider text-subtle-foreground">
                Time ahead
              </dt>
              <dd className="mt-1.5 text-xl font-semibold tracking-tight">
                {DUE_SOON_DAYS} days
              </dd>
            </div>
          </dl>
          {ready ? (
            <p className="border-t border-border px-5 py-3 text-xs text-subtle-foreground">
              At these thresholds {summary.dueSoon} of {summary.total} vehicles are
              currently in the warning band.
            </p>
          ) : null}
        </section>
      </div>

      <section className="card-raised mt-5">
        <header className="px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold tracking-tight">
            PMS interval catalogue
          </h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            The schedule every vehicle is measured against. Each item is due on
            whichever limit arrives first.
          </p>
        </header>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {[
                  "Service item",
                  "Category",
                  "Distance",
                  "Time",
                  "Bay time",
                  "Est. cost",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SERVICE_TASKS.map((task) => (
                <tr key={task.id} className="transition-colors hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium">{task.name}</span>
                      {task.critical ? (
                        <Badge tone="outline">Safety critical</Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {CATEGORY_LABEL[task.category]}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-xs">
                    {formatKm(task.intervalKm)}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-xs">
                    {task.intervalMonths} months
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {task.estimatedHours} h
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-xs font-medium">
                    {formatCurrency(task.estimatedCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ResetCard />

        <section className="card-raised">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">
              About this build
            </h3>
          </header>
          <div className="space-y-3 border-t border-border px-5 py-5 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <Monitor className="mt-0.5 size-4 shrink-0 text-subtle-foreground" />
              A front-end demonstration: the PMS engine, work-order lifecycle, and
              analytics all run in the browser against seeded data. Swapping the
              store in <code className="rounded bg-surface-2 px-1">lib/store.ts</code>{" "}
              for an API is the only change needed to point it at a backend.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
