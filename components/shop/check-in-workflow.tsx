"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { addDays, formatISO } from "date-fns";
import {
  Car,
  CheckCircle2,
  DoorOpen,
  Gauge,
  PackageCheck,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PmsStatusBadge } from "@/components/status";
import { DeniedAction } from "@/components/auth/denied-action";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { validateOdometerReading } from "@/lib/odometer-validation";
import { hydrateCheckInForm, lookupVehicle } from "@/lib/checkin";
import { BAYS } from "@/lib/bays";
import { serviceableItems } from "@/lib/shop";
import { requiredApprover } from "@/lib/approvals";
import { formatCurrency, formatDate, formatDayDelta, formatKm } from "@/lib/utils";
import type { NewWorkOrderLine } from "@/lib/store";
import type { Vehicle } from "@/types";

const SLOTS = ["08:00", "09:30", "11:00", "13:00", "14:30", "16:00"];

export function CheckInWorkflow() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "check-out" ? "check-out" : "check-in";

  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        <TabsTrigger value="check-in">
          <DoorOpen className="size-3.5" />
          Check in
        </TabsTrigger>
        <TabsTrigger value="check-out">
          <PackageCheck className="size-3.5" />
          Check out
        </TabsTrigger>
      </TabsList>

      <TabsContent value="check-in">
        <CheckInPanel />
      </TabsContent>
      <TabsContent value="check-out">
        <CheckOutPanel />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ check-in */

function CheckInPanel() {
  const router = useRouter();
  const { ready, health, healthById, fleetClients, approvalSettings, technicians } =
    useFleet();
  const { createWorkOrder, updateVehicle } = useFleetActions();
  const { can, reason } = useCan();

  const activeTechnicians = React.useMemo(
    () => technicians.filter((tech) => tech.active),
    [technicians]
  );

  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [taskIds, setTaskIds] = React.useState<string[]>([]);
  const [bayId, setBayId] = React.useState(BAYS[0].id);
  // The roster loads asynchronously, so there is no name to default to on
  // first render; backfilled below once `technicians` arrives.
  const [technician, setTechnician] = React.useState("");
  const [slot, setSlot] = React.useState(SLOTS[0]);
  const [notes, setNotes] = React.useState("");
  const [done, setDone] = React.useState<{ count: number; plate: string } | null>(
    null
  );

  React.useEffect(() => {
    if (!technician && activeTechnicians.length > 0) {
      setTechnician(activeTechnicians[0].name);
    }
  }, [technician, activeTechnicians]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return health
      .filter((entry) => {
        const v = entry.vehicle;
        return `${v.plateNumber} ${v.make} ${v.model} ${v.assignedTo}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 6);
  }, [health, query]);

  /**
   * An exact plate or VIN skips the picker entirely — the advisor typed the
   * whole identifier, so making them then click the single result is asking
   * for data the system already has. Substring matches still fall through to
   * the list above, which is what a partial or a driver-name search wants.
   */
  const exact = React.useMemo(() => {
    const result = lookupVehicle(
      query,
      health.map((entry) => entry.vehicle),
      fleetClients
    );
    return result.outcome === "existing" ? result : null;
  }, [query, health, fleetClients]);

  React.useEffect(() => {
    if (exact && exact.vehicle.id !== selectedId) select(exact.vehicle);
    // `select` is stable for this purpose — it only sets state from its argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exact, selectedId]);

  const selected = selectedId ? healthById.get(selectedId) : undefined;
  const vehicle = selected?.vehicle;
  const clientName = vehicle
    ? (fleetClients.find((c) => c.id === vehicle.fleetClientId)?.name ?? "—")
    : "";

  const due = serviceableItems(selected);

  function reset() {
    setSelectedId(null);
    setQuery("");
    setReading("");
    setConfirmed(false);
    setTaskIds([]);
    setNotes("");
  }

  function select(next: Vehicle) {
    setSelectedId(next.id);
    setQuery("");
    // Pre-fill the last known reading rather than an empty box — but only when
    // it is recent. A stale reading pre-filled and accepted unchanged is how a
    // wrong odometer enters the PMS engine and shifts every due date behind
    // it, so an old one is deliberately left blank to force a real look at the
    // dash. `hydrateCheckInForm` decides which case this is.
    const form = hydrateCheckInForm(
      lookupVehicle(next.plateNumber, [next], fleetClients)
    );
    setReading(
      form.odometer !== null && !form.odometerNeedsConfirmation
        ? String(form.odometer)
        : ""
    );
    setConfirmed(false);
    // Pre-tick everything already overdue: the advisor is meant to offer it,
    // and starting from "none selected" quietly encourages skipping the
    // conversation entirely.
    const entry = healthById.get(next.id);
    setTaskIds(
      (entry?.items ?? [])
        .filter((item) => item.status === "overdue")
        .map((item) => item.task.id)
    );
  }

  const parsed = Number(reading);
  const validation =
    vehicle && reading.trim() && Number.isFinite(parsed)
      ? validateOdometerReading({ vehicle, reading: parsed })
      : null;
  const readingOk =
    validation?.status === "ok" || (validation?.status === "warning" && confirmed);

  const chosen = due.filter((item) => taskIds.includes(item.task.id));
  const estimateTotal = chosen.reduce(
    (total, item) =>
      total +
      item.task.estimatedCost +
      item.task.estimatedHours * approvalSettings.defaultLabourRate,
    0
  );
  const band = requiredApprover(estimateTotal, approvalSettings);

  // Unlike the static array this replaced, a fresh provider's roster can be
  // genuinely empty — the create call takes a plain string, so an empty
  // technician would otherwise post silently rather than surface as a gap.
  const canSubmit =
    Boolean(vehicle) && readingOk && chosen.length > 0 && technician.length > 0;

  function submit() {
    if (!vehicle || !canSubmit) return;

    // The reading lands first and stands on its own: even if every quoted
    // line is later declined, the odometer capture is the part of check-in
    // that keeps every projection in the system honest.
    updateVehicle(vehicle.id, {
      odometer: Math.round(parsed),
      odometerReadAt: formatISO(new Date(), { representation: "date" }),
    });

    const scheduledFor = formatISO(new Date(), { representation: "date" });

    for (const item of chosen) {
      const lines: NewWorkOrderLine[] = [
        {
          description: item.task.name,
          category: item.task.category,
          // The catalogue's estimate is one unit of the job at its own cost;
          // the store derives the extended amounts from these.
          quantity: 1,
          unitPartRate: item.task.estimatedCost,
          labourHours: item.task.estimatedHours,
          labourRate: approvalSettings.defaultLabourRate,
          urgency: item.task.critical ? "safety_critical" : "recommended",
          partsSource: approvalSettings.defaultPartsSource,
          photoUrls: [],
        },
      ];

      createWorkOrder(
        {
          vehicleId: vehicle.id,
          title: item.task.name,
          type: "preventive",
          priority: item.status === "overdue" ? "high" : "medium",
          openedOn: scheduledFor,
          scheduledFor,
          scheduledTime: slot,
          completedOn: null,
          odometerAtService: Math.round(parsed),
          technician,
          // A vehicle on our own ramp is in-house work, not a subcontract:
          // an empty vendor is what marks that, and the owning provider is
          // stamped by the store the moment approval lands. Naming a bay here
          // put the shop in its own vendor-spend analytics.
          vendor: "",
          assignedProviderId: null,
          bayId,
          laborCost: item.task.estimatedHours * approvalSettings.defaultLabourRate,
          partsCost: item.task.estimatedCost,
          parts: [],
          findings: "",
          taskIds: [item.task.id],
          notes,
        },
        lines,
        approvalSettings
      );
    }

    setDone({ count: chosen.length, plate: vehicle.plateNumber });
    reset();
  }

  if (!ready) return <Skeleton className="h-96" />;

  if (!can("workorder:create")) {
    return (
      <div className="card">
        <EmptyState
          icon={DoorOpen}
          title="Check-in raises work orders"
          description={reason("workorder:create")}
        />
      </div>
    );
  }

  if (done) {
    return (
      <section className="card-raised p-8 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-ok/10">
          <CheckCircle2 className="size-5 text-ok" />
        </span>
        <h3 className="mt-4 text-sm font-semibold tracking-tight">
          {done.plate} checked in
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {done.count} {done.count === 1 ? "work order" : "work orders"} raised and
          the odometer recorded. Anything above the client&apos;s auto-approve
          ceiling is now waiting on them.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => setDone(null)}>
            Check in another
          </Button>
          <Button variant="primary" onClick={() => router.push("/shop/queue")}>
            Open the job queue
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {/* 1 — find the vehicle */}
        <section className="card-raised">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">
              1 · Find the vehicle
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Search by plate, make, model, or driver.
            </p>
          </header>

          <div className="space-y-3 border-t border-border px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. NBA 4821"
                className="pl-9"
                aria-label="Search for a vehicle"
              />
            </div>

            {matches.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {matches.map((entry) => (
                  <li key={entry.vehicle.id}>
                    <button
                      onClick={() => select(entry.vehicle)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2/60"
                    >
                      <span className="tabular w-[92px] shrink-0 text-xs font-medium">
                        {entry.vehicle.plateNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {entry.vehicle.year} {entry.vehicle.make} {entry.vehicle.model}
                        <span className="ml-2 text-subtle-foreground">
                          {fleetClients.find(
                            (c) => c.id === entry.vehicle.fleetClientId
                          )?.name ?? ""}
                        </span>
                      </span>
                      <PmsStatusBadge status={entry.status} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {vehicle ? (
              <div className="rounded-lg border border-brand/30 bg-brand-muted/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="tabular text-sm font-semibold">
                      {vehicle.plateNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {vehicle.year} {vehicle.make} {vehicle.model} · {clientName}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Change
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {vehicle ? (
          <>
            {/* 2 — odometer, required */}
            <section className="card-raised">
              <header className="px-5 pb-3 pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <Gauge className="size-4 text-subtle-foreground" />2 · Odometer
                  reading
                  <Badge tone="critical">Required</Badge>
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-subtle-foreground">
                  Drive-in is the one moment the reading is certain. Every distance
                  projection in the system is only as good as this number.
                </p>
              </header>

              <div className="space-y-2 border-t border-border px-5 py-4">
                <Label htmlFor="checkin-odo">Reading now (km)</Label>
                <Input
                  id="checkin-odo"
                  type="number"
                  inputMode="numeric"
                  value={reading}
                  min={vehicle.odometer}
                  placeholder={String(vehicle.odometer)}
                  className="tabular"
                  onChange={(event) => {
                    setReading(event.target.value);
                    setConfirmed(false);
                  }}
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
                    Last recorded {formatKm(vehicle.odometer)} on{" "}
                    {formatDate(vehicle.odometerReadAt)}.
                  </p>
                )}
              </div>
            </section>

            {/* 3 — what's due */}
            <section className="card-raised">
              <header className="px-5 pb-3 pt-4">
                <h3 className="text-sm font-semibold tracking-tight">
                  3 · Work to offer
                </h3>
                <p className="mt-0.5 text-xs text-subtle-foreground">
                  Everything this vehicle is overdue or nearly due for. Overdue
                  items are ticked already.
                </p>
              </header>

              {due.length === 0 ? (
                <div className="border-t border-border">
                  <EmptyState
                    icon={CheckCircle2}
                    title="Nothing due"
                    description="Every tracked interval on this vehicle is inside its limits."
                    className="py-10"
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {due.map((item) => (
                    <li key={item.task.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-5 py-3">
                        <input
                          type="checkbox"
                          className="size-3.5 shrink-0 accent-brand"
                          checked={taskIds.includes(item.task.id)}
                          onChange={(event) =>
                            setTaskIds((current) =>
                              event.target.checked
                                ? [...current, item.task.id]
                                : current.filter((id) => id !== item.task.id)
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {item.task.name}
                          </span>
                          <span className="tabular block text-2xs text-subtle-foreground">
                            {formatDayDelta(item.daysRemaining)} · governed by{" "}
                            {item.governedBy}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-xs text-muted-foreground">
                          {formatCurrency(
                            item.task.estimatedCost +
                              item.task.estimatedHours *
                                approvalSettings.defaultLabourRate
                          )}
                        </span>
                        <PmsStatusBadge status={item.status} />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 4 — assignment */}
            <section className="card-raised">
              <header className="px-5 pb-3 pt-4">
                <h3 className="text-sm font-semibold tracking-tight">
                  4 · Bay and technician
                </h3>
              </header>
              <div className="grid gap-4 border-t border-border px-5 py-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="checkin-bay">Bay</Label>
                  <Select value={bayId} onValueChange={setBayId}>
                    <SelectTrigger id="checkin-bay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BAYS.map((bay) => (
                        <SelectItem key={bay.id} value={bay.id}>
                          {bay.name} — {bay.focus}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkin-tech">Technician</Label>
                  <Select value={technician} onValueChange={setTechnician}>
                    <SelectTrigger id="checkin-tech">
                      <SelectValue placeholder="No technicians on the roster" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTechnicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.name}>
                          {tech.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkin-slot">Arrival slot</Label>
                  <Select value={slot} onValueChange={setSlot}>
                    <SelectTrigger id="checkin-slot">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOTS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="checkin-notes">Notes for the bay</Label>
                  <Textarea
                    id="checkin-notes"
                    value={notes}
                    placeholder="What the driver reported, and anything the technician should know."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>

      {/* Running summary */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <section className="card-raised p-5">
          <h3 className="text-sm font-semibold tracking-tight">Check-in summary</h3>

          {!vehicle ? (
            <p className="mt-3 text-xs leading-relaxed text-subtle-foreground">
              Find a vehicle to begin. Nothing is written until you raise the work
              orders.
            </p>
          ) : (
            <>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Vehicle</dt>
                  <dd className="tabular text-right font-medium">
                    {vehicle.plateNumber}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Client</dt>
                  <dd className="text-right font-medium">{clientName}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Odometer</dt>
                  <dd
                    className={`tabular text-right font-medium ${
                      readingOk ? "" : "text-subtle-foreground"
                    }`}
                  >
                    {readingOk ? formatKm(Math.round(parsed)) : "Not captured"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Jobs</dt>
                  <dd className="tabular text-right font-medium">{chosen.length}</dd>
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
                  <dt className="text-subtle-foreground">Estimate</dt>
                  <dd className="tabular text-right font-semibold">
                    {formatCurrency(estimateTotal)}
                  </dd>
                </div>
              </dl>

              {chosen.length > 0 ? (
                <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
                  {band === "auto"
                    ? "Under this client's auto-approve ceiling — work can start straight away."
                    : band === "operations"
                      ? "Needs the client's Operations Supervisor or Fleet Manager before work can start."
                      : "Needs the client's Fleet Manager before work can start."}
                </p>
              ) : null}

              <Button
                variant="primary"
                className="mt-4 w-full"
                disabled={!canSubmit}
                onClick={submit}
              >
                Raise {chosen.length || ""}{" "}
                {chosen.length === 1 ? "work order" : "work orders"}
              </Button>

              {!readingOk ? (
                <p className="mt-2 text-2xs text-subtle-foreground">
                  Record the odometer to continue.
                </p>
              ) : chosen.length === 0 ? (
                <p className="mt-2 text-2xs text-subtle-foreground">
                  Select at least one service to raise.
                </p>
              ) : null}
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------- check-out */

function CheckOutPanel() {
  const { ready, workOrders, vehiclesById, fleetClients } = useFleet();
  const { collectWorkOrders } = useFleetActions();
  const { can, reason } = useCan();
  const [released, setReleased] = React.useState<number | null>(null);

  const byVehicle = React.useMemo(() => {
    const map = new Map<string, typeof workOrders>();
    for (const order of workOrders) {
      if (order.status !== "closed" || order.collectedAt) continue;
      const list = map.get(order.vehicleId) ?? [];
      list.push(order);
      map.set(order.vehicleId, list);
    }
    return [...map.entries()];
  }, [workOrders]);

  /** Anything still open on the same vehicle blocks release. */
  const openFor = React.useCallback(
    (vehicleId: string) =>
      workOrders.filter(
        (order) =>
          order.vehicleId === vehicleId &&
          order.status !== "closed" &&
          order.status !== "cancelled" &&
          order.status !== "declined"
      ),
    [workOrders]
  );

  if (!ready) return <Skeleton className="h-96" />;

  if (byVehicle.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={PackageCheck}
          title="Nothing waiting to be collected"
          description="Every finished job has already been released to its client."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {released !== null ? (
        <div className="flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/[0.07] px-4 py-3">
          <CheckCircle2 className="size-4 shrink-0 text-ok" />
          <p className="text-xs text-muted-foreground">
            {released} {released === 1 ? "job" : "jobs"} released and stamped with
            your name and the time.
          </p>
        </div>
      ) : null}

      {byVehicle.map(([vehicleId, orders]) => {
        const vehicle = vehiclesById.get(vehicleId);
        const client = vehicle
          ? fleetClients.find((c) => c.id === vehicle.fleetClientId)
          : undefined;
        const blocking = openFor(vehicleId);
        const total = orders.reduce(
          (sum, order) => sum + order.laborCost + order.partsCost,
          0
        );

        const releaseButton = (
          <Button
            variant="primary"
            size="sm"
            disabled={blocking.length > 0}
            onClick={() => {
              const result = collectWorkOrders(orders.map((o) => o.id));
              setReleased(result.collected);
            }}
          >
            Mark collected
          </Button>
        );

        return (
          <section key={vehicleId} className="card-raised">
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0">
                <h3 className="tabular text-sm font-semibold tracking-tight">
                  {vehicle?.plateNumber ?? "Unknown vehicle"}
                </h3>
                <p className="mt-0.5 truncate text-xs text-subtle-foreground">
                  {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} · ` : ""}
                  {client?.name ?? "—"}
                </p>
              </div>
              {can("workorder:complete") ? (
                releaseButton
              ) : (
                <DeniedAction reason={reason("workorder:complete")}>
                  {releaseButton}
                </DeniedAction>
              )}
            </header>

            <ul className="divide-y divide-border border-t border-border">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                >
                  <Link
                    href={`/work-orders/${order.id}`}
                    className="w-[112px] shrink-0 text-xs font-medium transition-colors hover:text-brand"
                  >
                    {order.reference}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {order.title}
                  </span>
                  <span className="tabular shrink-0 text-xs font-medium">
                    {formatCurrency(order.laborCost + order.partsCost)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/60 px-5 py-3">
              {blocking.length > 0 ? (
                <p className="text-2xs text-critical">
                  {blocking.length} job{blocking.length === 1 ? "" : "s"} still open
                  on this vehicle — it is not finished.
                </p>
              ) : (
                <p className="text-2xs text-subtle-foreground">
                  All work closed. Ready to release.
                </p>
              )}
              <p className="tabular text-sm font-semibold">{formatCurrency(total)}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
