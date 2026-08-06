"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatISO } from "date-fns";
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
import { useFleetActions, type NewVehicleDraft } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { DeniedAction } from "@/components/auth/denied-action";
import { formatKm } from "@/lib/utils";
import type { FuelType, Vehicle, VehicleClass, VehicleOperationalStatus } from "@/types";

const VEHICLE_CLASS_LABEL: Record<VehicleClass, string> = {
  sedan: "Sedan",
  suv: "SUV",
  pickup: "Pickup",
  van: "Van",
  truck: "Truck",
};

const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  gasoline: "Gasoline",
  diesel: "Diesel",
  hybrid: "Hybrid",
  electric: "Electric",
};

const STATUS_LABEL: Record<VehicleOperationalStatus, string> = {
  active: "In operation",
  in_service: "In the shop",
  down: "Off road",
};

type FormState = {
  plateNumber: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  vehicleClass: VehicleClass;
  fuelType: FuelType;
  color: string;
  status: VehicleOperationalStatus;
  assignedTo: string;
  department: string;
  location: string;
  avgDailyKm: string;
  odometer: string;
  acquiredOn: string;
  registrationExpiry: string;
  insuranceExpiry: string;
  driverLicenceExpiry: string;
};

function blankForm(): FormState {
  const today = formatISO(new Date(), { representation: "date" });
  return {
    plateNumber: "",
    make: "",
    model: "",
    year: String(new Date().getFullYear()),
    vin: "",
    vehicleClass: "sedan",
    fuelType: "gasoline",
    color: "",
    status: "active",
    assignedTo: "",
    department: "",
    location: "",
    avgDailyKm: "40",
    odometer: "0",
    acquiredOn: today,
    registrationExpiry: today,
    insuranceExpiry: today,
    driverLicenceExpiry: "",
  };
}

function formFromVehicle(vehicle: Vehicle): FormState {
  return {
    plateNumber: vehicle.plateNumber,
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    vin: vehicle.vin,
    vehicleClass: vehicle.vehicleClass,
    fuelType: vehicle.fuelType,
    color: vehicle.color,
    status: vehicle.status,
    assignedTo: vehicle.assignedTo,
    department: vehicle.department,
    location: vehicle.location,
    avgDailyKm: String(vehicle.avgDailyKm),
    odometer: String(vehicle.odometer),
    acquiredOn: vehicle.acquiredOn,
    registrationExpiry: vehicle.registrationExpiry,
    insuranceExpiry: vehicle.insuranceExpiry,
    driverLicenceExpiry: vehicle.driverLicenceExpiry ?? "",
  };
}

/**
 * Adds a new unit to the fleet, or edits an existing one's profile — plate,
 * specs, assignment, and compliance dates. The odometer is only editable here
 * for a brand-new vehicle (its starting baseline); once a vehicle exists,
 * every distance-based interval depends on readings going through
 * `OdometerDialog`'s validation, so this dialog leaves it alone.
 */
export function VehicleFormDialog({ vehicle }: { vehicle?: Vehicle }) {
  const isEdit = Boolean(vehicle);
  const router = useRouter();
  const { addVehicle, updateVehicle } = useFleetActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(
    vehicle ? formFromVehicle(vehicle) : blankForm()
  );

  React.useEffect(() => {
    if (open) setForm(vehicle ? formFromVehicle(vehicle) : blankForm());
  }, [open, vehicle]);

  function patch(fields: Partial<FormState>) {
    setForm((current) => ({ ...current, ...fields }));
  }

  const year = Number(form.year);
  const avgDailyKm = Number(form.avgDailyKm);
  const odometer = Number(form.odometer);

  const canSubmit =
    form.plateNumber.trim().length > 0 &&
    form.make.trim().length > 0 &&
    form.model.trim().length > 0 &&
    form.vin.trim().length > 0 &&
    form.assignedTo.trim().length > 0 &&
    form.department.trim().length > 0 &&
    form.location.trim().length > 0 &&
    Number.isFinite(year) &&
    year >= 1990 &&
    year <= new Date().getFullYear() + 1 &&
    Number.isFinite(avgDailyKm) &&
    avgDailyKm > 0 &&
    Number.isFinite(odometer) &&
    odometer >= 0;

  function submit() {
    if (!canSubmit) return;

    const shared = {
      plateNumber: form.plateNumber.trim().toUpperCase(),
      make: form.make.trim(),
      model: form.model.trim(),
      year,
      vin: form.vin.trim().toUpperCase(),
      vehicleClass: form.vehicleClass,
      fuelType: form.fuelType,
      color: form.color.trim(),
      status: form.status,
      assignedTo: form.assignedTo.trim(),
      department: form.department.trim(),
      location: form.location.trim(),
      avgDailyKm,
      acquiredOn: form.acquiredOn,
      registrationExpiry: form.registrationExpiry,
      insuranceExpiry: form.insuranceExpiry,
      driverLicenceExpiry: form.driverLicenceExpiry || null,
    };

    if (isEdit && vehicle) {
      updateVehicle(vehicle.id, shared);
      setOpen(false);
      return;
    }

    const draft: NewVehicleDraft = {
      ...shared,
      odometer,
      odometerReadAt: formatISO(new Date(), { representation: "date" }),
    };
    const created = addVehicle(draft);
    setOpen(false);
    if (created) router.push(`/vehicles/${created.id}`);
  }

  const trigger = isEdit ? (
    <Button variant="secondary">
      <Pencil />
      Edit vehicle
    </Button>
  ) : (
    <Button variant="primary">
      <Plus />
      New vehicle
    </Button>
  );

  if (!can("vehicle:manage")) {
    return <DeniedAction reason={reason("vehicle:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit vehicle" : "Add a vehicle"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `${vehicle?.plateNumber} · specs, assignment, and compliance dates.`
              : "Every PMS interval starts fresh from today's odometer for a new unit."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="veh-plate">Plate number</Label>
              <Input
                id="veh-plate"
                value={form.plateNumber}
                placeholder="e.g. NBA 4821"
                onChange={(event) => patch({ plateNumber: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-vin">VIN</Label>
              <Input
                id="veh-vin"
                value={form.vin}
                onChange={(event) => patch({ vin: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="veh-make">Make</Label>
              <Input
                id="veh-make"
                value={form.make}
                onChange={(event) => patch({ make: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-model">Model</Label>
              <Input
                id="veh-model"
                value={form.model}
                onChange={(event) => patch({ model: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-year">Model year</Label>
              <Input
                id="veh-year"
                type="number"
                inputMode="numeric"
                value={form.year}
                className="tabular"
                onChange={(event) => patch({ year: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="veh-class">Class</Label>
              <Select
                value={form.vehicleClass}
                onValueChange={(value) => patch({ vehicleClass: value as VehicleClass })}
              >
                <SelectTrigger id="veh-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(VEHICLE_CLASS_LABEL) as [VehicleClass, string][]).map(
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
              <Label htmlFor="veh-fuel">Fuel</Label>
              <Select
                value={form.fuelType}
                onValueChange={(value) => patch({ fuelType: value as FuelType })}
              >
                <SelectTrigger id="veh-fuel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(FUEL_TYPE_LABEL) as [FuelType, string][]).map(
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
              <Label htmlFor="veh-color">Colour</Label>
              <Input
                id="veh-color"
                value={form.color}
                onChange={(event) => patch({ color: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="veh-status">Operational status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  patch({ status: value as VehicleOperationalStatus })
                }
              >
                <SelectTrigger id="veh-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_LABEL) as [VehicleOperationalStatus, string][]).map(
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
              <Label htmlFor="veh-daily-km">Average use (km / day)</Label>
              <Input
                id="veh-daily-km"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.avgDailyKm}
                className="tabular"
                onChange={(event) => patch({ avgDailyKm: event.target.value })}
              />
            </div>
          </div>

          {isEdit ? (
            <p className="text-xs text-subtle-foreground">
              Odometer: {formatKm(vehicle!.odometer)} · use{" "}
              <span className="font-medium text-foreground">Log odometer</span> on the
              vehicle page to update it.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="veh-odometer">Starting odometer (km)</Label>
              <Input
                id="veh-odometer"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.odometer}
                className="tabular"
                onChange={(event) => patch({ odometer: event.target.value })}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="veh-assigned">Assigned to</Label>
              <Input
                id="veh-assigned"
                value={form.assignedTo}
                onChange={(event) => patch({ assignedTo: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-department">Department</Label>
              <Input
                id="veh-department"
                value={form.department}
                onChange={(event) => patch({ department: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="veh-location">Home site</Label>
            <Input
              id="veh-location"
              value={form.location}
              onChange={(event) => patch({ location: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="veh-acquired">Acquired on</Label>
              <Input
                id="veh-acquired"
                type="date"
                value={form.acquiredOn}
                onChange={(event) => patch({ acquiredOn: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-registration">Registration expires</Label>
              <Input
                id="veh-registration"
                type="date"
                value={form.registrationExpiry}
                onChange={(event) => patch({ registrationExpiry: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veh-insurance">Insurance expires</Label>
              <Input
                id="veh-insurance"
                type="date"
                value={form.insuranceExpiry}
                onChange={(event) => patch({ insuranceExpiry: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="veh-licence">Driver licence expiry (optional)</Label>
            <Input
              id="veh-licence"
              type="date"
              value={form.driverLicenceExpiry}
              onChange={(event) => patch({ driverLicenceExpiry: event.target.value })}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            {isEdit ? "Save changes" : "Add vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
