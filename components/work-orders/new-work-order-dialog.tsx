"use client";

import * as React from "react";
import { addDays, formatISO } from "date-fns";
import { Plus } from "lucide-react";
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
import { SERVICE_TASKS } from "@/lib/service-tasks";
import { useFleet, useFleetActions } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import type { Priority, WorkOrderType } from "@/types";

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

export function NewWorkOrderDialog({
  vehicleId,
  taskId,
  trigger,
}: {
  vehicleId?: string;
  taskId?: string;
  trigger?: React.ReactNode;
}) {
  const { vehicles } = useFleet();
  const { createWorkOrder } = useFleetActions();
  const [open, setOpen] = React.useState(false);

  const [form, setForm] = React.useState({
    vehicleId: vehicleId ?? "",
    type: "preventive" as WorkOrderType,
    taskId: taskId ?? SERVICE_TASKS[0].id,
    title: "",
    priority: "medium" as Priority,
    scheduledFor: formatISO(addDays(new Date(), 3), { representation: "date" }),
    technician: TECHNICIANS[0],
    vendor: VENDORS[0],
    notes: "",
  });

  // Reopening with different props (e.g. from another vehicle) should not keep
  // the previous draft around.
  React.useEffect(() => {
    if (!open) return;
    setForm((current) => ({
      ...current,
      vehicleId: vehicleId ?? current.vehicleId,
      taskId: taskId ?? current.taskId,
      type: taskId ? "preventive" : current.type,
    }));
  }, [open, vehicleId, taskId]);

  const vehicle = vehicles.find((v) => v.id === form.vehicleId);
  const task = SERVICE_TASKS.find((t) => t.id === form.taskId);
  const isPreventive = form.type !== "corrective";

  const estimate = isPreventive && task ? task : null;
  const partsCost = estimate?.estimatedCost ?? 0;
  const laborCost = estimate ? estimate.estimatedHours * LABOR_RATE_PER_HOUR : 0;

  const title = isPreventive ? (task?.name ?? "") : form.title.trim();
  const canSubmit = Boolean(form.vehicleId && title);

  function submit() {
    if (!canSubmit || !vehicle) return;

    createWorkOrder({
      vehicleId: vehicle.id,
      title,
      type: form.type,
      status: "scheduled",
      priority: form.priority,
      openedOn: formatISO(new Date(), { representation: "date" }),
      scheduledFor: form.scheduledFor,
      completedOn: null,
      odometerAtService: vehicle.odometer,
      technician: form.technician,
      vendor: form.vendor,
      laborCost,
      partsCost,
      taskIds: isPreventive && task ? [task.id] : [],
      notes: form.notes,
    });

    setOpen(false);
    setForm((current) => ({ ...current, title: "", notes: "" }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary">
            <Plus />
            New work order
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Raise a work order</DialogTitle>
          <DialogDescription>
            Closing this order later will reset the PMS clock for whatever it covers.
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
                  {SERVICE_TASKS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
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

          {estimate ? (
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
                  <dt className="text-subtle-foreground">Bay time</dt>
                  <dd className="tabular mt-0.5 font-medium">
                    {estimate.estimatedHours} h
                  </dd>
                </div>
              </dl>
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
