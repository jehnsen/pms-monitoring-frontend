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
import { useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import type { ProviderVendor } from "@/types";

type FormState = { name: string; active: boolean };

function blank(): FormState {
  return { name: "", active: true };
}

function fromVendor(vendor: ProviderVendor): FormState {
  return { name: vendor.name, active: vendor.active };
}

/**
 * Adds or edits one entry on the provider's approved vendor list.
 *
 * Provider-side only (`settings:manage`), the same rule as
 * `ServiceTaskFormDialog` and `TechnicianFormDialog` — the vendor list is
 * shop-wide, not something a fleet client negotiates.
 */
export function VendorFormDialog({ vendor }: { vendor?: ProviderVendor }) {
  const isEdit = Boolean(vendor);
  const { addVendor, updateVendor } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(vendor ? fromVendor(vendor) : blank());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(vendor ? fromVendor(vendor) : blank());
      setError(null);
    }
  }, [open, vendor]);

  function patch(fields: Partial<FormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  const canSubmit = form.name.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;

    const shared = { name: form.name.trim(), active: form.active };

    if (isEdit && vendor) {
      updateVendor(vendor.id, shared);
      setOpen(false);
      return;
    }

    const result = await addVendor(shared);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = isEdit ? (
    <Button variant="ghost" size="sm" aria-label={`Edit ${vendor?.name}`}>
      <Pencil />
    </Button>
  ) : (
    <Button variant="primary" size="sm">
      <Plus />
      Add vendor
    </Button>
  );

  if (!can("settings:manage")) {
    return <DeniedAction reason={reason("settings:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit vendor" : "Add a vendor"}</DialogTitle>
          <DialogDescription>
            Repair vendors this provider works with, shared across every fleet
            client.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-name">Name</Label>
            <Input
              id="vendor-name"
              value={form.name}
              placeholder="e.g. Toyota Shaw Service Center"
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vendor-active">Status</Label>
            <Select
              value={form.active ? "active" : "inactive"}
              onValueChange={(value) => patch({ active: value === "active" })}
            >
              <SelectTrigger id="vendor-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active — can be assigned new work</SelectItem>
                <SelectItem value="inactive">
                  Inactive — off the list, past jobs unaffected
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error ? <p className="text-xs text-critical">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {isEdit ? "Save changes" : "Add vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
