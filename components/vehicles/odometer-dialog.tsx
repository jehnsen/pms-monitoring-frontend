"use client";

import * as React from "react";
import { formatISO } from "date-fns";
import { Gauge } from "lucide-react";
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
import { useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { DeniedAction } from "@/components/auth/denied-action";
import { validateOdometerReading } from "@/lib/odometer-validation";
import { formatKm } from "@/lib/utils";
import type { Vehicle } from "@/types";

/**
 * Odometer readings drive every distance-based interval, so logging one
 * re-runs the whole PMS calculation for the vehicle immediately.
 */
export function OdometerDialog({ vehicle }: { vehicle: Vehicle }) {
  const { updateVehicle } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(String(vehicle.odometer));
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValue(String(vehicle.odometer));
      setConfirmed(false);
    }
  }, [open, vehicle.odometer]);

  const parsed = Number(value);
  const validation =
    value.trim() && Number.isFinite(parsed)
      ? validateOdometerReading({ vehicle, reading: parsed })
      : null;
  const canSave =
    validation?.status === "ok" ||
    (validation?.status === "warning" && confirmed);

  const trigger = (
    <Button variant="secondary">
      <Gauge />
      Log odometer
    </Button>
  );

  if (!can("vehicle:update")) {
    return <DeniedAction reason={reason("vehicle:update")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log an odometer reading</DialogTitle>
          <DialogDescription>
            {vehicle.plateNumber} · currently {formatKm(vehicle.odometer)}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2">
          <Label htmlFor="odometer">New reading (km)</Label>
          <Input
            id="odometer"
            type="number"
            inputMode="numeric"
            value={value}
            min={vehicle.odometer}
            onChange={(event) => {
              setValue(event.target.value);
              setConfirmed(false);
            }}
            className="tabular"
          />
          {validation?.status === "invalid" ? (
            <p className="text-xs text-critical">{validation.error}</p>
          ) : validation?.status === "warning" ? (
            <div className="space-y-2 rounded-md border border-warning/35 bg-warning/15 px-3 py-2.5">
              <p className="text-xs text-foreground">{validation.warning}</p>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 accent-brand"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                This reading is correct.
              </label>
            </div>
          ) : (
            <p className="text-xs text-subtle-foreground">
              Every distance-based interval will be recalculated against this value.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => {
              updateVehicle(vehicle.id, {
                odometer: Math.round(parsed),
                odometerReadAt: formatISO(new Date(), { representation: "date" }),
              });
              setOpen(false);
            }}
          >
            Save reading
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
