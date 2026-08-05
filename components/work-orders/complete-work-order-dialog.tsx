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
import { useFleetActions } from "@/lib/store";
import { formatCurrency, formatKm } from "@/lib/utils";
import type { PartLine, Vehicle, WorkOrder } from "@/types";

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
 */
export function CompleteWorkOrderDialog({
  order,
  vehicle,
  open,
  onOpenChange,
}: {
  order: WorkOrder;
  vehicle: Vehicle | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { completeWorkOrder } = useFleetActions();

  const [odometer, setOdometer] = React.useState("");
  const [findings, setFindings] = React.useState("");
  const [parts, setParts] = React.useState<PartLine[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setOdometer(String(vehicle?.odometer ?? order.odometerAtService));
    setFindings(order.findings);
    setParts(order.parts.length ? order.parts : []);
  }, [open, order, vehicle]);

  const reading = Number(odometer);
  const minimum = vehicle?.odometer ?? 0;
  const readingValid = Number.isFinite(reading) && reading >= minimum;

  const partsTotal = parts.reduce(
    (total, part) => total + part.quantity * part.unitCost,
    0
  );
  // An incomplete line would silently drop out of the record; block instead.
  const partsValid = parts.every((part) => part.name.trim().length > 0);

  function patchPart(id: string, patch: Partial<PartLine>) {
    setParts((current) =>
      current.map((part) => (part.id === id ? { ...part, ...patch } : part))
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Close {order.reference}</DialogTitle>
          <DialogDescription>
            {order.title}
            {vehicle ? ` · ${vehicle.plateNumber}` : ""} — closing this resets the
            PMS clock for everything it covers.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="complete-odometer">Odometer at service (km)</Label>
            <Input
              id="complete-odometer"
              type="number"
              inputMode="numeric"
              value={odometer}
              min={minimum}
              onChange={(event) => setOdometer(event.target.value)}
              className="tabular"
            />
            {!readingValid ? (
              <p className="text-xs text-critical">
                Cannot be below the vehicle&apos;s current reading (
                {formatKm(minimum)}).
              </p>
            ) : (
              <p className="text-xs text-subtle-foreground">
                Every distance-based interval it covers restarts from here.
              </p>
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
                onClick={() => setParts((current) => [...current, blankPart()])}
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
                    <Input
                      aria-label="Part name"
                      value={part.name}
                      placeholder="Part name"
                      onChange={(event) =>
                        patchPart(part.id, { name: event.target.value })
                      }
                    />
                    <Input
                      aria-label="Part number"
                      value={part.partNumber}
                      placeholder="Part no."
                      className="tabular"
                      onChange={(event) =>
                        patchPart(part.id, { partNumber: event.target.value })
                      }
                    />
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min={1}
                      value={part.quantity}
                      className="tabular"
                      onChange={(event) =>
                        patchPart(part.id, {
                          quantity: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                    <Input
                      aria-label="Unit cost"
                      type="number"
                      min={0}
                      value={part.unitCost}
                      className="tabular"
                      onChange={(event) =>
                        patchPart(part.id, {
                          unitCost: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${part.name || "part"}`}
                      onClick={() =>
                        setParts((current) =>
                          current.filter((entry) => entry.id !== part.id)
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {!partsValid ? (
              <p className="mt-2 text-xs text-critical">
                Every part line needs a name.
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-xs">
            <div>
              <dt className="text-subtle-foreground">Parts</dt>
              <dd className="tabular mt-0.5 font-medium">
                {parts.length ? formatCurrency(partsTotal) : formatCurrency(order.partsCost)}
              </dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Labour</dt>
              <dd className="tabular mt-0.5 font-medium">
                {formatCurrency(order.laborCost)}
              </dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Total</dt>
              <dd className="tabular mt-0.5 font-semibold">
                {formatCurrency(
                  order.laborCost +
                    (parts.length ? partsTotal : order.partsCost)
                )}
              </dd>
            </div>
          </dl>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!readingValid || !partsValid}
            onClick={() => {
              completeWorkOrder(order.id, {
                odometer: Math.round(reading),
                findings: findings.trim(),
                parts,
              });
              onOpenChange(false);
            }}
          >
            Close work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
