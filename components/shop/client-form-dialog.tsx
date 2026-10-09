"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeniedAction } from "@/components/auth/denied-action";
import { useApprovalSettings, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { pesosToCents } from "@/lib/mappers";
import { hexToHslTriplet } from "@/lib/tenant";
import { PLATFORM_THEME } from "@/lib/platform";
import { formatCurrency } from "@/lib/utils";
import type { ApprovalSettings, FleetClient, FleetClientStatus } from "@/types";

/** Only the bands worth negotiating per contract are exposed here. */
const OVERRIDE_FIELDS: {
  key: keyof Pick<ApprovalSettings, "autoApproveUnder" | "opsApprovalUnder" | "slaHours" | "varianceThresholdPct">;
  apiKey: string;
  label: string;
  hint: string;
  currency: boolean;
}[] = [
  { key: "autoApproveUnder", apiKey: "auto_approve_under_cents", label: "Auto-approve under", hint: "Work below this clears without anyone signing it.", currency: true },
  { key: "opsApprovalUnder", apiKey: "ops_approval_under_cents", label: "Operations may approve up to", hint: "Above this, only their Fleet Manager can authorise.", currency: true },
  { key: "slaHours", apiKey: "sla_hours", label: "Approval SLA (hours)", hint: "Working hours before a pending quote is flagged as breached.", currency: false },
  { key: "varianceThresholdPct", apiKey: "variance_threshold_pct", label: "Variance threshold (%)", hint: "How far actual cost may exceed the approved amount at close-out.", currency: false },
];

type FormState = {
  name: string;
  contactName: string;
  contactEmail: string;
  contractTerms: string;
  paymentTermsDays: string;
  status: FleetClientStatus;
  brandColor: string;
  logoUrl: string;
  overrides: Record<string, string>;
  consent: boolean;
};

function blank(): FormState {
  return {
    name: "",
    contactName: "",
    contactEmail: "",
    contractTerms: "",
    paymentTermsDays: "30",
    status: "active",
    brandColor: "",
    logoUrl: "",
    overrides: {},
    consent: false,
  };
}

function fromClient(client: FleetClient): FormState {
  return {
    name: client.name,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    contractTerms: client.notes,
    paymentTermsDays: String(client.paymentTermsDays),
    status: client.status,
    brandColor: client.brandColor ?? "",
    logoUrl: client.logoUrl ?? "",
    overrides: Object.fromEntries(Object.entries(client.approvalThresholdOverrides ?? {}).map(([k, v]) => [k, String(v)])),
    consent: true,
  };
}

/**
 * Onboards or edits a customer account (staff, `customer:manage`), including
 * the approval bands its contract negotiated. An empty override falls through
 * to the provider's default rather than being stored as a zero — an
 * auto-approve ceiling of zero means *everything* needs a signature.
 * Onboarding records the customer's consent to keeping their service records
 * (the API refuses an account without it). Suspending and reactivating are
 * their own actions on the account.
 */
export function ClientFormDialog({ client }: { client?: FleetClient }) {
  const isEdit = Boolean(client);
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const { data: settings } = useApprovalSettings({ enabled: open });
  const { addFleetClient, updateFleetClient, suspendFleetClient, reactivateFleetClient } = useFleetActions();
  const [form, setForm] = React.useState<FormState>(client ? fromClient(client) : blank());
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm(client ? fromClient(client) : blank());
      setError(null);
    }
  }, [open, client]);

  function patch(fields: Partial<FormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  const paymentDays = Number(form.paymentTermsDays);
  const colourValid = form.brandColor.trim() === "" || hexToHslTriplet(form.brandColor) !== null;

  const canSubmit =
    form.name.trim().length > 0 && Number.isFinite(paymentDays) && paymentDays >= 0 && colourValid && (isEdit || form.consent) && !pending;

  /** Sparse: a blank band is left out, so it keeps inheriting. Money in centavos. */
  function buildOverrides(): Record<string, number> | null {
    const out: Record<string, number> = {};
    for (const field of OVERRIDE_FIELDS) {
      const raw = form.overrides[field.key]?.trim();
      if (!raw || !Number.isFinite(Number(raw))) continue;
      out[field.apiKey] = field.currency ? pesosToCents(Number(raw)) : Math.round(Number(raw));
    }
    return Object.keys(out).length ? out : null;
  }

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);

    const shared = {
      display_name: form.name.trim(),
      registered_name: form.name.trim(),
      contact_name: form.contactName.trim() || null,
      contact_email: form.contactEmail.trim() || null,
      notes: form.contractTerms.trim() || null,
      payment_terms_days: paymentDays,
      brand_color: form.brandColor.trim() || null,
      logo_url: form.logoUrl.trim() || null,
      approval_threshold_overrides: buildOverrides(),
    };

    const result =
      isEdit && client
        ? await updateFleetClient(client.id, shared)
        : await addFleetClient({
            ...shared,
            account_type: "company",
            tags: ["fleet"],
            consents: [{ purpose: "service_records", granted: true, channel: "in_person" }],
          });

    if (result.ok && isEdit && client && form.status !== client.status) {
      const moved = form.status === "suspended" ? await suspendFleetClient(client.id) : await reactivateFleetClient(client.id);
      if (!moved.ok) {
        setPending(false);
        setError(moved.error);
        return;
      }
    }

    setPending(false);
    if (!result.ok) {
      setError(result.fields ? Object.values(result.fields)[0]?.[0] ?? result.error : result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = isEdit ? (
    <Button variant="secondary">
      <Pencil />
      Edit client
    </Button>
  ) : (
    <Button variant="primary">
      <Plus />
      Onboard a client
    </Button>
  );

  if (!canAsStaff("customer:manage")) {
    return <DeniedAction reason={staffReason("customer:manage")}>{trigger}</DeniedAction>;
  }

  const inherited = settings?.organization;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "Onboard a fleet client"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `${client?.name} — contract terms, branding, and approval bands.`
              : "A new fleet beneath this provider. Their vehicles and work stay invisible to every other client."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Client name</Label>
            <Input id="client-name" value={form.name} placeholder="e.g. Actimed" onChange={(event) => patch({ name: event.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-contact">Contact name</Label>
              <Input id="client-contact" value={form.contactName} onChange={(event) => patch({ contactName: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Contact email</Label>
              <Input id="client-email" type="email" value={form.contactEmail} onChange={(event) => patch({ contactEmail: event.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-terms">Contract terms</Label>
            <Input
              id="client-terms"
              value={form.contractTerms}
              placeholder="e.g. Full-service PMS retainer, 16 units"
              onChange={(event) => patch({ contractTerms: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="client-payment">Payment terms (days)</Label>
              <Input id="client-payment" type="number" min={0} value={form.paymentTermsDays} onChange={(event) => patch({ paymentTermsDays: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-status">Status</Label>
              <Select value={form.status} disabled={!isEdit} onValueChange={(value) => patch({ status: value as FleetClientStatus })}>
                <SelectTrigger id="client-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-colour">Brand colour</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick a brand colour"
                  value={form.brandColor || PLATFORM_THEME.brandColor}
                  onChange={(event) => patch({ brandColor: event.target.value })}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
                />
                <Input id="client-colour" value={form.brandColor} placeholder="Provider's" onChange={(event) => patch({ brandColor: event.target.value })} />
              </div>
            </div>
          </div>

          {!colourValid ? <p className="text-xs text-critical">Enter a hex colour, e.g. #1d5ba6.</p> : null}

          <div className="space-y-1.5">
            <Label htmlFor="client-logo">Logo URL</Label>
            <Input id="client-logo" value={form.logoUrl} placeholder="Leave blank to use the provider's mark" onChange={(event) => patch({ logoUrl: event.target.value })} />
          </div>

          <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-3.5">
            <p className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">Approval bands</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Leave a field blank to inherit the provider&apos;s default.</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {OVERRIDE_FIELDS.map((field) => {
                const value = inherited?.[field.key];
                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`override-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`override-${field.key}`}
                      type="number"
                      min={0}
                      value={form.overrides[field.key] ?? ""}
                      placeholder={value === undefined ? "" : field.currency ? formatCurrency(Number(value)) : String(value)}
                      onChange={(event) => patch({ overrides: { ...form.overrides, [field.key]: event.target.value } })}
                    />
                    <p className="text-2xs leading-relaxed text-subtle-foreground">{field.hint}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {!isEdit ? (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 accent-brand"
                checked={form.consent}
                onChange={(event) => patch({ consent: event.target.checked })}
              />
              The client agrees to us keeping their service records (recorded as consent, in person).
            </label>
          ) : null}

          {error ? <p role="alert" className="text-xs text-critical">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Onboard client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
