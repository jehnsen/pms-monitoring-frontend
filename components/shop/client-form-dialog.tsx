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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeniedAction } from "@/components/auth/denied-action";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { hexToHslTriplet } from "@/lib/tenant";
import { formatCurrency } from "@/lib/utils";
import type { ApprovalSettings, FleetClient, FleetClientStatus } from "@/types";

/** Only the bands worth negotiating per contract are exposed here. */
const OVERRIDE_FIELDS: {
  key: keyof Pick<
    ApprovalSettings,
    "autoApproveUnder" | "opsApprovalUnder" | "slaHours" | "varianceThresholdPct"
  >;
  label: string;
  hint: string;
  currency: boolean;
}[] = [
  {
    key: "autoApproveUnder",
    label: "Auto-approve under",
    hint: "Work below this clears without anyone signing it.",
    currency: true,
  },
  {
    key: "opsApprovalUnder",
    label: "Operations may approve up to",
    hint: "Above this, only their Fleet Manager can authorise.",
    currency: true,
  },
  {
    key: "slaHours",
    label: "Approval SLA (hours)",
    hint: "Working hours before a pending quote is flagged as breached.",
    currency: false,
  },
  {
    key: "varianceThresholdPct",
    label: "Variance threshold (%)",
    hint: "How far actual cost may exceed the approved amount at close-out.",
    currency: false,
  },
];

type FormState = {
  name: string;
  slug: string;
  contactName: string;
  contactEmail: string;
  contractTerms: string;
  paymentTermsDays: string;
  status: FleetClientStatus;
  brandColor: string;
  logoUrl: string;
  overrides: Record<string, string>;
};

function blank(): FormState {
  return {
    name: "",
    slug: "",
    contactName: "",
    contactEmail: "",
    contractTerms: "",
    paymentTermsDays: "30",
    status: "active",
    brandColor: "",
    logoUrl: "",
    overrides: {},
  };
}

function fromClient(client: FleetClient): FormState {
  return {
    name: client.name,
    slug: client.slug,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    contractTerms: client.contractTerms,
    paymentTermsDays: String(client.paymentTermsDays),
    status: client.status,
    brandColor: client.brandColor ?? "",
    logoUrl: client.logoUrl ?? "",
    overrides: Object.fromEntries(
      Object.entries(client.approvalThresholdOverrides ?? {}).map(([k, v]) => [
        k,
        String(v),
      ])
    ),
  };
}

/**
 * Onboards or edits a fleet client, including the approval bands their
 * contract negotiated. An empty override falls through to the provider's own
 * default rather than being stored as a zero — the difference matters, since
 * an auto-approve ceiling of zero means *everything* needs a signature.
 */
export function ClientFormDialog({ client }: { client?: FleetClient }) {
  const isEdit = Boolean(client);
  const { approvalSettings } = useFleet();
  const { addFleetClient, updateFleetClient } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(
    client ? fromClient(client) : blank()
  );

  React.useEffect(() => {
    if (open) setForm(client ? fromClient(client) : blank());
  }, [open, client]);

  function patch(fields: Partial<FormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  const paymentDays = Number(form.paymentTermsDays);
  const colourValid =
    form.brandColor.trim() === "" || hexToHslTriplet(form.brandColor) !== null;

  const canSubmit =
    form.name.trim().length > 0 &&
    form.slug.trim().length > 0 &&
    Number.isFinite(paymentDays) &&
    paymentDays >= 0 &&
    colourValid;

  function buildOverrides(): Partial<ApprovalSettings> | null {
    const entries = Object.entries(form.overrides)
      .filter(([, value]) => value.trim() !== "" && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Number(value)] as const);
    return entries.length ? (Object.fromEntries(entries) as Partial<ApprovalSettings>) : null;
  }

  function submit() {
    if (!canSubmit) return;

    const shared = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      contractTerms: form.contractTerms.trim(),
      paymentTermsDays: paymentDays,
      status: form.status,
      brandColor: form.brandColor.trim() || null,
      logoUrl: form.logoUrl.trim() || null,
      approvalThresholdOverrides: buildOverrides(),
    };

    if (isEdit && client) updateFleetClient(client.id, shared);
    else addFleetClient(shared);

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

  if (!can("settings:manage")) {
    return <DeniedAction reason={reason("settings:manage")}>{trigger}</DeniedAction>;
  }

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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Client name</Label>
              <Input
                id="client-name"
                value={form.name}
                placeholder="e.g. Actimed"
                onChange={(event) => {
                  const name = event.target.value;
                  patch({
                    name,
                    // Slug tracks the name until it's been edited by hand.
                    slug: isEdit
                      ? form.slug
                      : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                  });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-slug">Slug</Label>
              <Input
                id="client-slug"
                value={form.slug}
                className="tabular"
                onChange={(event) => patch({ slug: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-contact">Contact name</Label>
              <Input
                id="client-contact"
                value={form.contactName}
                onChange={(event) => patch({ contactName: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Contact email</Label>
              <Input
                id="client-email"
                type="email"
                value={form.contactEmail}
                onChange={(event) => patch({ contactEmail: event.target.value })}
              />
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
              <Input
                id="client-payment"
                type="number"
                min={0}
                value={form.paymentTermsDays}
                className="tabular"
                onChange={(event) => patch({ paymentTermsDays: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => patch({ status: value as FleetClientStatus })}
              >
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
                  value={form.brandColor || "#1d5ba6"}
                  onChange={(event) => patch({ brandColor: event.target.value })}
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
                />
                <Input
                  id="client-colour"
                  value={form.brandColor}
                  placeholder="Provider's"
                  className="tabular"
                  onChange={(event) => patch({ brandColor: event.target.value })}
                />
              </div>
            </div>
          </div>

          {!colourValid ? (
            <p className="text-xs text-critical">Enter a hex colour, e.g. #1d5ba6.</p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="client-logo">Logo URL</Label>
            <Input
              id="client-logo"
              value={form.logoUrl}
              placeholder="Leave blank to use the provider's mark"
              onChange={(event) => patch({ logoUrl: event.target.value })}
            />
          </div>

          <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-3.5">
            <p className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
              Approval bands
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Leave a field blank to inherit the provider&apos;s default.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {OVERRIDE_FIELDS.map((field) => {
                const inherited = approvalSettings[field.key];
                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`override-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`override-${field.key}`}
                      type="number"
                      min={0}
                      value={form.overrides[field.key] ?? ""}
                      placeholder={
                        field.currency
                          ? formatCurrency(inherited)
                          : String(inherited)
                      }
                      className="tabular"
                      onChange={(event) =>
                        patch({
                          overrides: {
                            ...form.overrides,
                            [field.key]: event.target.value,
                          },
                        })
                      }
                    />
                    <p className="text-2xs leading-relaxed text-subtle-foreground">
                      {field.hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            {isEdit ? "Save changes" : "Onboard client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
