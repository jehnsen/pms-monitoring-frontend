"use client";

import * as React from "react";
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
import { formatKm } from "@/lib/utils";
import type { Vehicle } from "@/types";

/**
 * Odometer readings drive every distance-based interval, so logging one
 * re-runs the whole PMS calculation for the vehicle immediately.
 */
export function OdometerDialog({ vehicle }: { vehicle: Vehicle }) {
  const { updateVehicle } = useFleetActions();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(String(vehicle.odometer));

  React.useEffect(() => {
    if (open) setValue(String(vehicle.odometer));
  }, [open, vehicle.odometer]);

  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed >= vehicle.odometer;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Gauge />
          Log odometer
        </Button>
      </DialogTrigger>
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
            onChange={(event) => setValue(event.target.value)}
            className="tabular"
          />
          {!valid ? (
            <p className="text-xs text-critical">
              A reading cannot be lower than the last one on record (
              {formatKm(vehicle.odometer)}).
            </p>
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
            disabled={!valid}
            onClick={() => {
              updateVehicle(vehicle.id, { odometer: Math.round(parsed) });
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
