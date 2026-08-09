"use client";

import * as React from "react";
import { addDays, formatISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
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
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import { useFleet, useFleetActions, type NewWorkOrderLine } from "@/lib/store";
import { requiredApprover } from "@/lib/approvals";
import { useCan } from "@/lib/rbac";
import { DeniedAction } from "@/components/auth/denied-action";
import { formatCurrency } from "@/lib/utils";
import type { LineUrgency, PartsSource, Priority, TaskCategory, WorkOrderType } from "@/types";

const TECHNICIANS = [
  "Arnel Pascual",
  "Jomar Dizon",
  "Kristine Abad",
  "Lito Sarmiento",
  "Michelle Garcia",
  "Renato Ilagan",
];

const VENDORS = [
  "In-house Fleet Bay 1",
  "In-house Fleet Bay 2",
  "Toyota Shaw Service Center",
  "Rapide Auto Care — Ortigas",
  "Ford Global City Service",
  "Bridgestone Tire Center",
];

const LABOR_RATE_PER_HOUR = 650;

const URGENCY_LABEL: Record<LineUrgency, string> = {
  safety_critical: "Safety critical",
  recommended: "Recommended",
  optional: "Optional",
};

const PARTS_SOURCE_LABEL: Record<PartsSource, string> = {
  own_stock: "Own stock",
  supplier_provided: "Supplier provided",
};

const CATEGORY_OPTIONS: { value: TaskCategory | "other"; label: string }[] = [
  ...(Object.entries(CATEGORY_LABEL) as [TaskCategory, string][]).map(
    ([value, label]) => ({ value, label })
  ),
  { value: "other", label: "Other" },
];

let draftLineSeq = 0;
function blankDraftLine(): NewWorkOrderLine & { key: string } {
  draftLineSeq += 1;
  return {
    key: `draft-${draftLineSeq}`,
    description: "",
    category: "other",
    partCost: 0,
    labourCost: 0,
    urgency: "recommended",
    partsSource: "supplier_provided",
    photoUrls: [],
  };
}

export function NewWorkOrderDialog({
  vehicleId,
  taskId,
  trigger,
}: {
  vehicleId?: string;
  taskId?: string;
  trigger?: React.ReactNode;
}) {
  const { vehicles, approvalSettings, serviceTasks } = useFleet();
  const { createWorkOrder } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);

  const [form, setForm] = React.useState({
    vehicleId: vehicleId ?? "",
    type: "preventive" as WorkOrderType,
    // The catalogue loads asynchronously now, so there's no task to default to
    // on first render; the effect below fills it in once serviceTasks arrives.
    taskId: taskId ?? "",
    title: "",
    priority: "medium" as Priority,
    scheduledFor: formatISO(addDays(new Date(), 3), { representation: "date" }),
    technician: TECHNICIANS[0],
    vendor: VENDORS[0],
    notes: "",
  });

  const [correctiveLines, setCorrectiveLines] = React.useState<
    (NewWorkOrderLine & { key: string })[]
  >([blankDraftLine()]);

  // Reopening with different props (e.g. from another vehicle) should not keep
  // the previous draft around.
  React.useEffect(() => {
    if (!open) return;
    setForm((current) => ({
      ...current,
      vehicleId: vehicleId ?? current.vehicleId,
      taskId: taskId ?? (current.taskId || serviceTasks[0]?.id || ""),
      type: taskId ? "preventive" : current.type,
    }));
    setCorrectiveLines([blankDraftLine()]);
  }, [open, vehicleId, taskId, serviceTasks]);

  const vehicle = vehicles.find((v) => v.id === form.vehicleId);
  const task = serviceTasks.find((t) => t.id === form.taskId);
  const isPreventive = form.type !== "corrective";

  const estimate = isPreventive && task ? task : null;

  // The lines actually being submitted — one auto-derived line for
  // preventive/inspection work, or whatever the technician has itemised for
  // a corrective repair.
  const lineDrafts: NewWorkOrderLine[] = React.useMemo(() => {
    if (isPreventive) {
      if (!estimate) return [];
      return [
        {
          description: estimate.name,
          category: estimate.category,
          partCost: estimate.estimatedCost,
          labourCost: estimate.estimatedHours * LABOR_RATE_PER_HOUR,
          urgency: estimate.critical ? "safety_critical" : "recommended",
          partsSource: approvalSettings.defaultPartsSource,
          photoUrls: [],
        },
      ];
    }
    return correctiveLines
      .filter((line) => line.description.trim().length > 0)
      .map(({ key, ...line }) => line);
  }, [isPreventive, estimate, correctiveLines, approvalSettings.defaultPartsSource]);

  const partsCost = lineDrafts.reduce((total, line) => total + line.partCost, 0);
  const laborCost = lineDrafts.reduce((total, line) => total + line.labourCost, 0);
  const pendingTotal = partsCost + laborCost;
  const approverBand = requiredApprover(pendingTotal, approvalSettings);

  const title = isPreventive ? (task?.name ?? "") : form.title.trim();
  const correctiveLinesValid =
    isPreventive || correctiveLines.some((line) => line.description.trim().length > 0);
  const canSubmit = Boolean(form.vehicleId && title && correctiveLinesValid);

  function patchLine(key: string, patch: Partial<NewWorkOrderLine>) {
    setCorrectiveLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  }

  function submit() {
    if (!canSubmit || !vehicle) return;

    createWorkOrder(
      {
        vehicleId: vehicle.id,
        title,
        type: form.type,
        priority: form.priority,
        openedOn: formatISO(new Date(), { representation: "date" }),
        scheduledFor: form.scheduledFor,
        completedOn: null,
        odometerAtService: vehicle.odometer,
        technician: form.technician,
        vendor: form.vendor,
        laborCost,
        partsCost,
        // A new order carries an estimate; the itemised parts and findings are
        // captured at completion.
        parts: [],
        findings: "",
        taskIds: isPreventive && task ? [task.id] : [],
        notes: form.notes,
      },
      lineDrafts,
      approvalSettings
    );

    setOpen(false);
    setForm((current) => ({ ...current, title: "", notes: "" }));
    setCorrectiveLines([blankDraftLine()]);
  }

  const defaultTrigger = (
    <Button variant="primary">
      <Plus />
      New work order
    </Button>
  );

  // Gated here rather than at each call site, so no screen can accidentally
  // hand a viewer a working button.
  if (!can("workorder:create")) {
    return (
      <DeniedAction reason={reason("workorder:create")}>
        {trigger ?? defaultTrigger}
      </DeniedAction>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Raise a work order</DialogTitle>
          <DialogDescription>
            Every job is a purchase first — this goes to approval before it can
            be scheduled, unless it&apos;s cheap enough to auto-approve.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wo-vehicle">Vehicle</Label>
            <Select
              value={form.vehicleId}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, vehicleId: value }))
              }
            >
              <SelectTrigger id="wo-vehicle">
                <SelectValue placeholder="Select a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plateNumber} — {v.make} {v.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wo-type">Job type</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    type: value as WorkOrderType,
                  }))
                }
              >
                <SelectTrigger id="wo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventive">Preventive (PMS)</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="corrective">Corrective repair</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wo-priority">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    priority: value as Priority,
                  }))
                }
              >
                <SelectTrigger id="wo-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isPreventive ? (
            <div className="space-y-1.5">
              <Label htmlFor="wo-task">Service item</Label>
              <Select
                value={form.taskId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, taskId: value }))
                }
              >
                <SelectTrigger id="wo-task">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="wo-title">Fault description</Label>
                <Input
                  id="wo-title"
                  value={form.title}
                  placeholder="e.g. Aircon compressor not engaging"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label>Purchase lines</Label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setCorrectiveLines((current) => [...current, blankDraftLine()])
                    }
                  >
                    <Plus />
                    Add line
                  </Button>
                </div>

                <div className="space-y-2">
                  {correctiveLines.map((line) => (
                    <div
                      key={line.key}
                      className="space-y-2 rounded-md border border-border bg-surface-2/40 p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label="Line description"
                          value={line.description}
                          placeholder="What needs doing"
                          onChange={(event) =>
                            patchLine(line.key, { description: event.target.value })
                          }
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${line.description || "line"}`}
                          disabled={correctiveLines.length === 1}
                          onClick={() =>
                            setCorrectiveLines((current) =>
                              current.filter((entry) => entry.key !== line.key)
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Select
                          value={line.category}
                          onValueChange={(value) =>
                            patchLine(line.key, { category: value as TaskCategory | "other" })
                          }
                        >
                          <SelectTrigger aria-label="Category" className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={line.urgency}
                          onValueChange={(value) =>
                            patchLine(line.key, { urgency: value as LineUrgency })
                          }
                        >
                          <SelectTrigger aria-label="Urgency" className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.entries(URGENCY_LABEL) as [LineUrgency, string][]).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>

                        <Select
                          value={line.partsSource}
                          onValueChange={(value) =>
                            patchLine(line.key, { partsSource: value as PartsSource })
                          }
                        >
                          <SelectTrigger aria-label="Parts source" className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              Object.entries(PARTS_SOURCE_LABEL) as [PartsSource, string][]
                            ).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            aria-label="Parts cost"
                            type="number"
                            min={0}
                            value={line.partCost}
                            className="tabular text-xs"
                            onChange={(event) =>
                              patchLine(line.key, {
                                partCost: Math.max(0, Number(event.target.value) || 0),
                              })
                            }
                          />
                          <Input
                            aria-label="Labour cost"
                            type="number"
                            min={0}
                            value={line.labourCost}
                            className="tabular text-xs"
                            onChange={(event) =>
                              patchLine(line.key, {
                                labourCost: Math.max(0, Number(event.target.value) || 0),
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wo-date">Scheduled for</Label>
              <Input
                id="wo-date"
                type="date"
                value={form.scheduledFor}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scheduledFor: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wo-tech">Technician</Label>
              <Select
                value={form.technician}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, technician: value }))
                }
              >
                <SelectTrigger id="wo-tech">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TECHNICIANS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wo-vendor">Service provider</Label>
            <Select
              value={form.vendor}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, vendor: value }))
              }
            >
              <SelectTrigger id="wo-vendor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDORS.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wo-notes">Notes</Label>
            <Textarea
              id="wo-notes"
              value={form.notes}
              placeholder="Anything the technician should know before the vehicle arrives."
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>

          {lineDrafts.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
                Estimate
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <dt className="text-subtle-foreground">Parts</dt>
                  <dd className="tabular mt-0.5 font-medium">
                    {formatCurrency(partsCost)}
                  </dd>
                </div>
                <div>
                  <dt className="text-subtle-foreground">Labour</dt>
                  <dd className="tabular mt-0.5 font-medium">
                    {formatCurrency(laborCost)}
                  </dd>
                </div>
                <div>
                  <dt className="text-subtle-foreground">Total</dt>
                  <dd className="tabular mt-0.5 font-medium">
                    {formatCurrency(pendingTotal)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 border-t border-border pt-2.5 text-2xs text-subtle-foreground">
                {approverBand === "auto"
                  ? "Under the auto-approve ceiling — this will approve itself the moment it's raised."
                  : approverBand === "operations"
                    ? "Needs Operations Supervisor or Fleet Manager approval before it can be scheduled."
                    : "Needs Fleet Manager approval before it can be scheduled."}
              </p>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            Create work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
