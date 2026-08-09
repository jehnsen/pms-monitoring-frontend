"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, RotateCcw, Sun, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import { ServiceTaskFormDialog } from "@/components/settings/service-task-form-dialog";
import { DUE_SOON_DAYS, DUE_SOON_KM } from "@/lib/pms";
import { useFleetActions, useFleet } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { DeniedAction } from "@/components/auth/denied-action";
import { useTheme } from "@/components/theme-provider";
import { cn, formatCurrency, formatKm } from "@/lib/utils";
import { hexToHslTriplet } from "@/lib/tenant";
import type { ApprovalSettings, PartsSource, TenantSettings } from "@/types";

const PARTS_SOURCE_LABEL: Record<PartsSource, string> = {
  own_stock: "Own stock",
  supplier_provided: "Supplier provided",
};

function ApprovalThresholdsCard() {
  const { ready, approvalSettings } = useFleet();
  const { updateApprovalSettings } = useFleetActions();
  const { can, reason } = useCan();

  const [draft, setDraft] = useState<ApprovalSettings>(approvalSettings);

  // Keep the draft in sync when the underlying settings change from outside
  // this card (e.g. a demo-data reset).
  useEffect(() => {
    setDraft(approvalSettings);
  }, [approvalSettings]);

  const dirty = ready && JSON.stringify(draft) !== JSON.stringify(approvalSettings);

  const fields: {
    key: keyof Pick<
      ApprovalSettings,
      "autoApproveUnder" | "opsApprovalUnder" | "slaHours" | "varianceThresholdPct" | "monthlyBudget"
    >;
    label: string;
    suffix?: string;
  }[] = [
    { key: "autoApproveUnder", label: "Auto-approve under (₱)" },
    { key: "opsApprovalUnder", label: "Operations/Purchasing ceiling (₱)" },
    { key: "slaHours", label: "Approval SLA", suffix: "working hours" },
    { key: "varianceThresholdPct", label: "Variance re-approval threshold", suffix: "%" },
    { key: "monthlyBudget", label: "Monthly maintenance budget (₱)" },
  ];

  const body = (
    <div className="space-y-4 border-t border-border px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`approval-${field.key}`}>{field.label}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={`approval-${field.key}`}
                type="number"
                min={0}
                className="tabular"
                value={draft[field.key]}
                disabled={!can("settings:manage")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field.key]: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
              {field.suffix ? (
                <span className="shrink-0 text-2xs text-subtle-foreground">
                  {field.suffix}
                </span>
              ) : null}
            </div>
          </div>
        ))}

        <div className="space-y-1.5">
          <Label htmlFor="approval-parts-source">Default parts source</Label>
          <Select
            value={draft.defaultPartsSource}
            onValueChange={(value) =>
              setDraft((current) => ({
                ...current,
                defaultPartsSource: value as PartsSource,
              }))
            }
            disabled={!can("settings:manage")}
          >
            <SelectTrigger id="approval-parts-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PARTS_SOURCE_LABEL) as [PartsSource, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {can("settings:manage") ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-2xs text-subtle-foreground">
            Above the operations ceiling, only the Fleet Manager can approve —
            regardless of role.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty}
            onClick={() => updateApprovalSettings(draft)}
          >
            Save changes
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="card-raised">
      <header className="px-5 pb-3 pt-4">
        <h3 className="text-sm font-semibold tracking-tight">
          Approval thresholds
        </h3>
        <p className="mt-0.5 text-xs text-subtle-foreground">
          What auto-approves, who signs off the rest, and how long a line may
          wait before it escalates.
        </p>
      </header>
      {can("settings:manage") ? (
        body
      ) : (
        <DeniedAction reason={reason("settings:manage")}>
          <div className="block w-full">{body}</div>
        </DeniedAction>
      )}
    </section>
  );
}

function BrandingCard() {
  const { ready, tenant } = useFleet();
  const { updateTenantSettings, canEditBranding } = useFleetActions();
  const { can, reason } = useCan();

  // Two independent gates: the capability, and which side of the tenancy
  // boundary you sit on. A client's Fleet Manager holds `settings:manage` but
  // still may not rebrand the service centre's instance for everyone else.
  const editable = can("settings:manage") && canEditBranding;
  const denial = !can("settings:manage")
    ? reason("settings:manage")
    : "Branding belongs to the service provider. A fleet client can't change how the provider's application is presented.";

  const [draft, setDraft] = useState<TenantSettings>(tenant);

  useEffect(() => {
    setDraft(tenant);
  }, [tenant]);

  const dirty = ready && JSON.stringify(draft) !== JSON.stringify(tenant);
  const validColor = hexToHslTriplet(draft.brandColor) !== null;

  const body = (
    <div className="space-y-4 border-t border-border px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-name">Display name</Label>
          <Input
            id="tenant-name"
            value={draft.displayName}
            disabled={!editable}
            onChange={(event) =>
              setDraft((current) => ({ ...current, displayName: event.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-support-email">Support email</Label>
          <Input
            id="tenant-support-email"
            type="email"
            value={draft.supportEmail}
            disabled={!editable}
            onChange={(event) =>
              setDraft((current) => ({ ...current, supportEmail: event.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-logo-url">Logo URL</Label>
          <Input
            id="tenant-logo-url"
            value={draft.logoUrl ?? ""}
            placeholder="https://…  (leave blank for the built-in mark)"
            disabled={!editable}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                logoUrl: event.target.value.trim() ? event.target.value : null,
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-brand-color">Brand colour</Label>
          <div className="flex items-center gap-2">
            <input
              id="tenant-brand-color"
              type="color"
              value={validColor ? draft.brandColor : "#000000"}
              disabled={!editable}
              onChange={(event) =>
                setDraft((current) => ({ ...current, brandColor: event.target.value }))
              }
              className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Input
              value={draft.brandColor}
              disabled={!editable}
              placeholder="#1d5ba6"
              className="tabular"
              onChange={(event) =>
                setDraft((current) => ({ ...current, brandColor: event.target.value }))
              }
            />
          </div>
          {!validColor ? (
            <p className="text-xs text-critical">
              Enter a hex colour, e.g. #1d5ba6.
            </p>
          ) : null}
        </div>
      </div>

      {editable ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-2xs text-subtle-foreground">
            Drives the sidebar header, page title, and primary button colour.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || !validColor}
            onClick={() => updateTenantSettings(draft)}
          >
            Save changes
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="card-raised">
      <header className="px-5 pb-3 pt-4">
        <h3 className="text-sm font-semibold tracking-tight">Branding</h3>
        <p className="mt-0.5 text-xs text-subtle-foreground">
          This build is offered to fleet clients as their own application —
          make it read like one.
        </p>
      </header>
      {editable ? (
        body
      ) : (
        <DeniedAction reason={denial}>
          <div className="block w-full">{body}</div>
        </DeniedAction>
      )}
    </section>
  );
}

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
  const { can, reason } = useCan();
  const [open, setOpen] = useState(false);

  if (!can("settings:manage")) {
    return (
      <section className="card-raised">
        <header className="px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold tracking-tight">Demo data</h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            The fleet lives in this browser&apos;s local storage.
          </p>
        </header>
        <div className="border-t border-border px-5 py-5">
          <DeniedAction reason={reason("settings:manage")}>
            <Button variant="secondary">
              <RotateCcw />
              Reset fleet data
            </Button>
          </DeniedAction>
        </div>
      </section>
    );
  }

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
  const { ready, summary, serviceTasks } = useFleet();
  const { deleteServiceTask } = useFleetActions();
  const { can, reason } = useCan();

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

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <BrandingCard />
        <ApprovalThresholdsCard />
      </div>

      <section className="card-raised mt-5">
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              PMS interval catalogue
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              The schedule every vehicle is measured against. Each item is due
              on whichever limit arrives first.
            </p>
          </div>
          <ServiceTaskFormDialog />
        </header>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {[
                  "Service item",
                  "Category",
                  "Distance",
                  "Time",
                  "Bay time",
                  "Est. cost",
                  "",
                ].map((heading, index) => (
                  <th
                    key={heading || `action-${index}`}
                    scope="col"
                    className="whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {serviceTasks.map((task) => (
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
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      <ServiceTaskFormDialog task={task} />
                      {can("settings:manage") ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${task.name}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove "${task.name}" from the catalogue? Vehicles keep their existing service history for it, but it will no longer be evaluated.`
                              )
                            ) {
                              deleteServiceTask(task.id);
                            }
                          }}
                        >
                          <Trash2 className="text-critical" />
                        </Button>
                      ) : (
                        <DeniedAction reason={reason("settings:manage")}>
                          <Button variant="ghost" size="sm" aria-label={`Remove ${task.name}`}>
                            <Trash2 />
                          </Button>
                        </DeniedAction>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {ready && serviceTasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-xs text-subtle-foreground"
                  >
                    No service items yet.
                  </td>
                </tr>
              ) : null}
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
