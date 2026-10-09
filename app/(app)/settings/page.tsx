"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
import {
  useAccountApprovalSettings,
  useApprovalSettings,
  useBranding,
  useFleetActions,
  useFleetSummary,
  useOrganization,
} from "@/lib/store";
import { useSession } from "@/lib/auth";
import { useCan } from "@/lib/rbac";
import { DeniedAction } from "@/components/auth/denied-action";
import { useTheme } from "@/components/theme-provider";
import { cn, formatKm } from "@/lib/utils";
import { hexToHslTriplet } from "@/lib/tenant";
import type { ApprovalSettings, PartsSource, TenantSettings } from "@/types";

const PARTS_SOURCE_LABEL: Record<PartsSource, string> = {
  own_stock: "Own stock",
  supplier_provided: "Supplier provided",
};

/**
 * Approval bands. Staff with organization rights edit the organization's
 * defaults (`PUT /approval-settings`); a client's Fleet Manager edits their
 * own account's bands (`PATCH /customer-accounts/{id}/approval-settings`) —
 * only the keys they change are sent, so the rest keep inheriting.
 */
function ApprovalThresholdsCard() {
  const { session } = useSession();
  const portal = session?.side === "portal";
  const staffSettings = useApprovalSettings({ enabled: session?.side === "staff" });
  const accountSettings = useAccountApprovalSettings(portal ? session?.fleetClientId : null);
  const { updateApprovalSettings, updateAccountApprovalSettings } = useFleetActions();
  const { can, reason, side } = useCan();

  const approvalSettings: ApprovalSettings | undefined = portal
    ? accountSettings.data?.effective
    : staffSettings.data?.organization;
  const ready = Boolean(approvalSettings);
  // Portal: settings:manage on their own account. Staff: the organization's defaults.
  const editable = portal ? can("settings:manage") : side === "staff" && can("organization:manage");
  const denial = portal ? reason("settings:manage") : reason("organization:manage");

  const [draft, setDraft] = useState<ApprovalSettings | null>(approvalSettings ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep the draft in sync with what the API says the settings are.
  useEffect(() => {
    if (approvalSettings) setDraft(approvalSettings);
  }, [approvalSettings]);

  const dirty = ready && draft !== null && JSON.stringify(draft) !== JSON.stringify(approvalSettings);

  async function save() {
    if (!draft || !approvalSettings) return;
    setError(null);
    setSaved(false);
    const changed = Object.fromEntries(
      (Object.keys(draft) as (keyof ApprovalSettings)[])
        .filter((key) => draft[key] !== approvalSettings[key])
        .map((key) => [key, draft[key]])
    ) as Partial<ApprovalSettings>;
    const result =
      portal && session?.fleetClientId
        ? await updateAccountApprovalSettings(session.fleetClientId, changed)
        : await updateApprovalSettings(changed);
    if (!result.ok) {
      setError(result.fields ? Object.values(result.fields)[0]?.[0] ?? result.error : result.error);
      return;
    }
    setSaved(true);
  }

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
                value={draft?.[field.key] ?? ""}
                disabled={!editable || !draft}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, [field.key]: Math.max(0, Number(event.target.value) || 0) } : current
                  )
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
            value={draft?.defaultPartsSource ?? "supplier_provided"}
            onValueChange={(value) =>
              setDraft((current) => (current ? { ...current, defaultPartsSource: value as PartsSource } : current))
            }
            disabled={!editable || !draft}
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

      {error ? <p className="text-xs text-critical">{error}</p> : null}
      {saved && !dirty ? <p className="text-xs text-ok">Saved.</p> : null}

      {editable ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-2xs text-subtle-foreground">
            {portal
              ? "Your account's own bands. A value you don't change keeps following the service centre's default."
              : "The organization's defaults; a client's own bands override them per account."}
          </p>
          <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void save()}>
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

function BrandingCard() {
  const { updateTenantSettings } = useFleetActions();
  const { can, reason, side } = useCan();
  const sessionBranding = useBranding();
  const staff = side === "staff";
  const organization = useOrganization({ enabled: staff });

  // Two independent gates: organization rights, and the staff side. A client's
  // Fleet Manager sees their branding (from /me) but may not rebrand the
  // service centre's application for everyone else.
  const editable = staff && can("organization:manage");
  const denial = !staff
    ? "Branding belongs to the service provider. A fleet client can't change how the provider's application is presented."
    : reason("organization:manage");

  const tenant: TenantSettings = (staff ? organization.data : null) ?? sessionBranding;
  const ready = staff ? organization.isSuccess : true;
  const [draft, setDraft] = useState<TenantSettings>(tenant);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(tenant);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the saved values change, not on every new object
  }, [tenant.displayName, tenant.brandColor, tenant.logoUrl, tenant.supportEmail]);

  const dirty = ready && JSON.stringify(draft) !== JSON.stringify(tenant);

  async function save() {
    setError(null);
    const result = await updateTenantSettings(draft);
    if (!result.ok) setError(result.fields ? Object.values(result.fields)[0]?.[0] ?? result.error : result.error);
  }
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
            onClick={() => void save()}
          >
            Save changes
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-critical">{error}</p> : null}
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

/** The data lives on the server now: "reset" is a reload of every screen's reads. */
function ResetCard() {
  const { resetFleet } = useFleetActions();
  const [done, setDone] = useState(false);

  return (
    <section className="card-raised">
      <header className="px-5 pb-3 pt-4">
        <h3 className="text-sm font-semibold tracking-tight">Data</h3>
        <p className="mt-0.5 text-xs text-subtle-foreground">
          Everything on these screens is read from the TorqueLane server. Reloading fetches it fresh; it changes
          nothing.
        </p>
      </header>
      <div className="flex items-center gap-3 border-t border-border px-5 py-5">
        <Button
          variant="secondary"
          onClick={async () => {
            setDone(false);
            await resetFleet();
            setDone(true);
          }}
        >
          <RotateCcw />
          Reload from the server
        </Button>
        {done ? <span className="text-xs text-subtle-foreground">Up to date.</span> : null}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { data: summary } = useFleetSummary();
  const ready = Boolean(summary);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Warning thresholds, branding, approval bands, and the data behind the dashboard."
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
                {summary ? formatKm(summary.thresholds.dueSoonKm) : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/50 p-4">
              <dt className="text-2xs uppercase tracking-wider text-subtle-foreground">
                Time ahead
              </dt>
              <dd className="mt-1.5 text-xl font-semibold tracking-tight">
                {summary ? `${summary.thresholds.dueSoonDays} days` : "—"}
              </dd>
            </div>
          </dl>
          {ready && summary ? (
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
              Connected to the TorqueLane API. The PMS engine, work-order lifecycle, approvals, billing and
              analytics all run on the server; this application renders what it returns, and every change is
              saved there.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
