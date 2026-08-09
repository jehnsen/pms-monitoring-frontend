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
import { BAYS } from "@/lib/bays";
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import { useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import type { ProviderTechnician, TaskCategory } from "@/types";

const SPECIALTY_OPTIONS: { value: string; label: string }[] = [
  { value: "general", label: "General" },
  ...(Object.entries(CATEGORY_LABEL) as [TaskCategory, string][]).map(
    ([value, label]) => ({ value, label })
  ),
];

type FormState = {
  name: string;
  specialty: string;
  homeBayId: string;
  active: boolean;
};

function blank(): FormState {
  return { name: "", specialty: "general", homeBayId: BAYS[0]?.id ?? "", active: true };
}

function fromTechnician(technician: ProviderTechnician): FormState {
  return {
    name: technician.name,
    specialty: technician.specialty,
    homeBayId: technician.homeBayId ?? "",
    active: technician.active,
  };
}

/**
 * Adds or edits one row of the provider's technician roster.
 *
 * Provider-side only (`settings:manage`), same rule as `ServiceTaskFormDialog`
 * — a technician is a property of the shop. `specialty` is advisory only,
 * like `Bay.focus`: nothing here stops a job going to a technician outside
 * it, or two jobs landing on the same person at once.
 */
export function TechnicianFormDialog({
  technician,
}: {
  technician?: ProviderTechnician;
}) {
  const isEdit = Boolean(technician);
  const { addTechnician, updateTechnician } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(
    technician ? fromTechnician(technician) : blank()
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(technician ? fromTechnician(technician) : blank());
      setError(null);
    }
  }, [open, technician]);

  function patch(fields: Partial<FormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  const canSubmit = form.name.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;

    const shared = {
      name: form.name.trim(),
      specialty: form.specialty,
      homeBayId: form.homeBayId || null,
      active: form.active,
    };

    if (isEdit && technician) {
      // Fire-and-forget, like `updateServiceTask`: the guard above already
      // covers who may call this, and an optimistic update rolls itself back
      // on failure.
      updateTechnician(technician.id, shared);
      setOpen(false);
      return;
    }

    const result = await addTechnician(shared);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = isEdit ? (
    <Button variant="ghost" size="sm" aria-label={`Edit ${technician?.name}`}>
      <Pencil />
    </Button>
  ) : (
    <Button variant="primary" size="sm">
      <Plus />
      Add technician
    </Button>
  );

  if (!can("settings:manage")) {
    return <DeniedAction reason={reason("settings:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit technician" : "Add a technician"}</DialogTitle>
          <DialogDescription>
            Shop staff, shared across every fleet client this provider serves.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tech-name">Name</Label>
            <Input
              id="tech-name"
              value={form.name}
              placeholder="e.g. Arnel Pascual"
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tech-specialty">Specialty</Label>
              <Select
                value={form.specialty}
                onValueChange={(value) => patch({ specialty: value })}
              >
                <SelectTrigger id="tech-specialty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTY_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tech-bay">Home bay</Label>
              <Select
                value={form.homeBayId}
                onValueChange={(value) => patch({ homeBayId: value })}
              >
                <SelectTrigger id="tech-bay">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {BAYS.map((bay) => (
                    <SelectItem key={bay.id} value={bay.id}>
                      {bay.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tech-active">Status</Label>
            <Select
              value={form.active ? "active" : "inactive"}
              onValueChange={(value) => patch({ active: value === "active" })}
            >
              <SelectTrigger id="tech-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active — can be assigned new work</SelectItem>
                <SelectItem value="inactive">
                  Inactive — off the roster, past jobs unaffected
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
            {isEdit ? "Save changes" : "Add technician"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
