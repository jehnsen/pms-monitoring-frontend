"use client";

import * as React from "react";
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
} from "@/components/ui/dialog";
import { PmsStatusBadge } from "@/components/status";
import { useFleetActions, useVehicle, useVehicleHealth } from "@/lib/store";
import { formatKm, formatRelative } from "@/lib/utils";
import type { PartLine, VehicleRef, WorkOrder } from "@/types";

function blankPart(): PartLine {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    partNumber: "",
    name: "",
    quantity: 1,
    unitCost: 0,
  };
}

/**
 * Closing a job captures the service record: the reading it was done at, what
 * the technician found, and the parts actually fitted. Recording these at the
 * moment of completion is the only way the history stays trustworthy — asked
 * for later, nobody remembers.
 *
 * Two API calls: `complete` records the work, `close` runs the variance gate
 * and resets the PMS intervals. When actual cost breaches the approved amount
 * by more than the threshold, the API refuses the close (409
 * `variance_exceeded`) with the figures; someone with the authority to
 * approve the actual amount may then re-approve the variance.
 */
export function CompleteWorkOrderDialog({
  order,
  vehicle: vehicleRef,
  open,
  onOpenChange,
}: {
  order: WorkOrder;
  vehicle: VehicleRef | undefined | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: vehicle } = useVehicle(open ? order.vehicleId : undefined);
  const { data: health } = useVehicleHealth(open ? order.vehicleId : undefined);
  const { completeWorkOrder, closeWorkOrder } = useFleetActions();

  const [odometer, setOdometer] = React.useState("");
  const [findings, setFindings] = React.useState("");
  const [parts, setParts] = React.useState<PartLine[]>([]);
  const [taskIds, setTaskIds] = React.useState<string[]>([]);
  const [variance, setVariance] = React.useState<string | null>(null);
  const [varianceConfirmed, setVarianceConfirmed] = React.useState(false);
  const [closeError, setCloseError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const items = health?.items ?? [];
  const plate = vehicle?.plateNumber ?? vehicleRef?.plateNumber;

  React.useEffect(() => {
    if (!open) return;
    // Empty on purpose — a technician has to actively choose the reading
    // rather than inherit whatever the vehicle last carried.
    setOdometer("");
    setFindings(order.findings);
    setParts(order.parts.length ? order.parts : []);
    setTaskIds(order.taskIds);
    setVariance(null);
    setVarianceConfirmed(false);
    setCloseError(null);
  }, [open, order]);

  const reading = Number(odometer);
  const readingValid = odometer.trim() !== "" && Number.isFinite(reading) && reading >= 0;
  // An incomplete line would silently drop out of the record; block instead.
  const partsValid = parts.every((part) => part.name.trim().length > 0);

  function toggleTask(taskId: string, checked: boolean) {
    setTaskIds((current) => (checked ? [...current, taskId] : current.filter((id) => id !== taskId)));
  }

  function patchPart(id: string, patch: Partial<PartLine>) {
    setParts((current) => current.map((part) => (part.id === id ? { ...part, ...patch } : part)));
    setVariance(null);
    setVarianceConfirmed(false);
  }

  async function submit() {
    setPending(true);
    setCloseError(null);

    // Recording the work is repeatable while the job is in progress, so a
    // retry after a refused close records the latest figures again.
    if (order.status === "in_progress") {
      const recorded = await completeWorkOrder(order.id, {
        findings: findings.trim(),
        odometerAtService: reading,
        parts: parts.map((part) => ({ partNumber: part.partNumber || undefined, name: part.name.trim(), quantity: part.quantity, unitCost: part.unitCost })),
        taskIds,
      });
      if (!recorded.ok) {
        setPending(false);
        setCloseError(recorded.error);
        return;
      }
    }

    const closed = await closeWorkOrder(order.id, varianceConfirmed);
    setPending(false);
    if (!closed.ok) {
      if (closed.reason === "variance_exceeded") {
        setVariance(closed.error);
        return;
      }
      setCloseError(closed.error);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Close {order.displayReference}</DialogTitle>
          <DialogDescription>
            {order.title}
            {plate ? ` · ${plate}` : ""} — closing this resets the PMS clock for everything it covers.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="complete-odometer">Odometer at service (km)</Label>
            <div className="flex gap-2">
              <Input
                id="complete-odometer"
                type="number"
                inputMode="numeric"
                value={odometer}
                placeholder="Enter the reading taken at close-out"
                onChange={(event) => setOdometer(event.target.value)}
                className="tabular"
              />
              {vehicle ? (
                <Button type="button" variant="secondary" onClick={() => setOdometer(String(vehicle.odometer))}>
                  Use last recorded
                </Button>
              ) : null}
            </div>
            {vehicle ? (
              <p className="text-xs text-subtle-foreground">
                Last recorded: {formatKm(vehicle.odometer)} · {formatRelative(vehicle.odometerReadAt)}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>PMS intervals to reset</Label>
            <p className="text-xs text-subtle-foreground">
              Every interval ticked below restarts from this reading and today&apos;s date.
            </p>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-subtle-foreground">
                No tracked intervals for this vehicle.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border">
                {items.map((item) => (
                  <label key={item.task.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="size-3.5 shrink-0 accent-brand"
                      checked={taskIds.includes(item.task.id)}
                      onChange={(event) => toggleTask(item.task.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{item.task.name}</span>
                      <span className="block text-2xs text-subtle-foreground">
                        every {formatKm(item.task.intervalKm)} or {item.task.intervalMonths} months
                      </span>
                    </span>
                    <PmsStatusBadge status={item.status} />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complete-findings">Technician findings</Label>
            <Textarea
              id="complete-findings"
              value={findings}
              placeholder="What was found on inspection, what was done, and the road-test result."
              onChange={(event) => setFindings(event.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <Label>Parts replaced</Label>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setParts((current) => [...current, blankPart()]);
                  setVariance(null);
                  setVarianceConfirmed(false);
                }}
              >
                <Plus />
                Add part
              </Button>
            </div>

            {parts.length === 0 ? (
              <p className="mt-2 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-subtle-foreground">
                No parts recorded. Add a line for each item fitted.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {parts.map((part) => (
                  <div
                    key={part.id}
                    className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-border bg-surface-2/40 p-2.5 sm:grid-cols-[1.6fr_1fr_64px_96px_auto]"
                  >
                    <Input aria-label="Part name" value={part.name} placeholder="Part name" onChange={(event) => patchPart(part.id, { name: event.target.value })} />
                    <Input
                      aria-label="Part number"
                      value={part.partNumber}
                      placeholder="Part no."
                      className="tabular"
                      onChange={(event) => patchPart(part.id, { partNumber: event.target.value })}
                    />
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min={1}
                      value={part.quantity}
                      className="tabular"
                      onChange={(event) => patchPart(part.id, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                    />
                    <Input
                      aria-label="Unit cost"
                      type="number"
                      min={0}
                      value={part.unitCost}
                      className="tabular"
                      onChange={(event) => patchPart(part.id, { unitCost: Math.max(0, Number(event.target.value) || 0) })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${part.name || "part"}`}
                      onClick={() => {
                        setParts((current) => current.filter((entry) => entry.id !== part.id));
                        setVariance(null);
                        setVarianceConfirmed(false);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {!partsValid ? <p className="mt-2 text-xs text-critical">Every part line needs a name.</p> : null}
          </div>

          {variance ? (
            <div className="space-y-2 rounded-md border border-critical/25 bg-critical/[0.07] px-3 py-2.5">
              <p className="text-xs text-critical">{variance}</p>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 accent-brand"
                  checked={varianceConfirmed}
                  onChange={(event) => setVarianceConfirmed(event.target.checked)}
                />
                I approve the variance (it&apos;s logged against my name; it needs authority over the actual amount).
              </label>
            </div>
          ) : null}

          {closeError ? <p className="text-xs text-critical">{closeError}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending || !readingValid || !partsValid || (variance !== null && !varianceConfirmed)}
            onClick={() => void submit()}
          >
            {pending ? "Closing…" : "Close work order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
