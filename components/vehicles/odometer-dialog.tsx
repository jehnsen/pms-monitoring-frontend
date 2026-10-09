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
import { useCan } from "@/lib/rbac";
import { DeniedAction } from "@/components/auth/denied-action";
import { formatKm } from "@/lib/utils";
import type { Vehicle } from "@/types";

/**
 * Odometer readings drive every distance-based interval, so logging one
 * re-runs the whole PMS calculation for the vehicle (on the API).
 *
 * The API validates the reading: an impossible one is refused outright; an
 * unusual one (a jump far beyond the vehicle's daily rate) comes back as a
 * warning, saved only when someone confirms it is right.
 */
export function OdometerDialog({ vehicle }: { vehicle: Vehicle }) {
  const { recordReading } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(String(vehicle.odometer));
  const [warning, setWarning] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValue(String(vehicle.odometer));
      setWarning(null);
      setConfirmed(false);
      setError(null);
    }
  }, [open, vehicle.odometer]);

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const canSave = valid && !pending && (warning === null || confirmed);

  async function save() {
    setPending(true);
    setError(null);
    const result = await recordReading(vehicle.id, { value: parsed, confirmWarning: warning !== null && confirmed });
    setPending(false);
    if (result.ok) {
      setOpen(false);
      return;
    }
    if (result.fields?.confirm_warning) {
      setWarning(result.fields.value?.[0] ?? result.error);
      setConfirmed(false);
      return;
    }
    setError(result.fields?.value?.[0] ?? result.fields?.read_on?.[0] ?? result.error);
  }

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
              setWarning(null);
              setConfirmed(false);
              setError(null);
            }}
            className="tabular"
          />
          {error ? (
            <p className="text-xs text-critical">{error}</p>
          ) : warning ? (
            <div className="space-y-2 rounded-md border border-warning/35 bg-warning/15 px-3 py-2.5">
              <p className="text-xs text-foreground">{warning}</p>
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
            <p className="text-xs text-subtle-foreground">Every distance-based interval will be recalculated against this value.</p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
            {pending ? "Saving…" : "Save reading"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
