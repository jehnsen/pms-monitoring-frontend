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
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import { useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import type { ServiceTask, TaskCategory } from "@/types";

type FormState = {
  name: string;
  category: TaskCategory;
  intervalKm: string;
  intervalMonths: string;
  estimatedCost: string;
  estimatedHours: string;
  critical: boolean;
};

function blank(): FormState {
  return {
    name: "",
    category: "engine",
    intervalKm: "10000",
    intervalMonths: "12",
    estimatedCost: "0",
    estimatedHours: "1",
    critical: false,
  };
}

function fromTask(task: ServiceTask): FormState {
  return {
    name: task.name,
    category: task.category,
    intervalKm: String(task.intervalKm),
    intervalMonths: String(task.intervalMonths),
    estimatedCost: String(task.estimatedCost),
    estimatedHours: String(task.estimatedHours),
    critical: task.critical,
  };
}

/**
 * Adds or edits one row of the provider's PMS interval catalogue.
 *
 * Provider-side only (`settings:manage`) — mirrors `ClientFormDialog`, since
 * this is the same shape of problem: a shop-wide setting every fleet client is
 * measured against but does not itself control. Editing an interval does not
 * retroactively touch any vehicle's `taskState`; it only changes what the next
 * evaluation compares against.
 */
export function ServiceTaskFormDialog({ task }: { task?: ServiceTask }) {
  const isEdit = Boolean(task);
  const { addServiceTask, updateServiceTask } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(task ? fromTask(task) : blank());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(task ? fromTask(task) : blank());
      setError(null);
    }
  }, [open, task]);

  function patch(fields: Partial<FormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  const km = Number(form.intervalKm);
  const months = Number(form.intervalMonths);
  const cost = Number(form.estimatedCost);
  const hours = Number(form.estimatedHours);

  const canSubmit =
    form.name.trim().length > 0 &&
    Number.isFinite(km) &&
    km >= 0 &&
    Number.isFinite(months) &&
    months >= 0 &&
    (km > 0 || months > 0) && // a task due on neither limit would never come due
    Number.isFinite(cost) &&
    cost >= 0 &&
    Number.isFinite(hours) &&
    hours >= 0;

  async function submit() {
    if (!canSubmit) return;

    const shared = {
      name: form.name.trim(),
      category: form.category,
      intervalKm: km,
      intervalMonths: months,
      estimatedCost: cost,
      estimatedHours: hours,
      critical: form.critical,
    };

    if (isEdit && task) {
      // Fire-and-forget, like `updateFleetClient`/`updateVehicle`: the guard
      // above (`can("settings:manage")`) already covers who may call this, and
      // an optimistic update rolls itself back on failure.
      updateServiceTask(task.id, shared);
      setOpen(false);
      return;
    }

    const result = await addServiceTask(shared);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = isEdit ? (
    <Button variant="ghost" size="sm" aria-label={`Edit ${task?.name}`}>
      <Pencil />
    </Button>
  ) : (
    <Button variant="primary" size="sm">
      <Plus />
      Add service item
    </Button>
  );

  if (!can("settings:manage")) {
    return <DeniedAction reason={reason("settings:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit service item" : "Add a service item"}</DialogTitle>
          <DialogDescription>
            Due on whichever limit — distance or elapsed time — arrives first.
            Every fleet client beneath this provider is measured against the
            same catalogue.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-name">Name</Label>
            <Input
              id="task-name"
              value={form.name}
              placeholder="e.g. Engine oil & filter change"
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) => patch({ category: value as TaskCategory })}
              >
                <SelectTrigger id="task-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(CATEGORY_LABEL) as [TaskCategory, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-critical">Safety critical</Label>
              <Select
                value={form.critical ? "yes" : "no"}
                onValueChange={(value) => patch({ critical: value === "yes" })}
              >
                <SelectTrigger id="task-critical">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No — routine</SelectItem>
                  <SelectItem value="yes">Yes — skipping it is unsafe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-km">Distance interval (km)</Label>
              <Input
                id="task-km"
                type="number"
                min={0}
                value={form.intervalKm}
                className="tabular"
                onChange={(event) => patch({ intervalKm: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-months">Time interval (months)</Label>
              <Input
                id="task-months"
                type="number"
                min={0}
                value={form.intervalMonths}
                className="tabular"
                onChange={(event) => patch({ intervalMonths: event.target.value })}
              />
            </div>
          </div>

          {km <= 0 && months <= 0 ? (
            <p className="text-xs text-critical">
              Set at least one interval — a task due on neither limit would
              never come due.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-cost">Estimated cost (₱)</Label>
              <Input
                id="task-cost"
                type="number"
                min={0}
                value={form.estimatedCost}
                className="tabular"
                onChange={(event) => patch({ estimatedCost: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-hours">Bay time (hours)</Label>
              <Input
                id="task-hours"
                type="number"
                min={0}
                step={0.25}
                value={form.estimatedHours}
                className="tabular"
                onChange={(event) => patch({ estimatedHours: event.target.value })}
              />
            </div>
          </div>

          {error ? <p className="text-xs text-critical">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {isEdit ? "Save changes" : "Add service item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
