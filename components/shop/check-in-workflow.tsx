"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatISO } from "date-fns";
import { Car, CheckCircle2, DoorOpen, Gauge, PackageCheck, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PmsStatusBadge } from "@/components/status";
import { DeniedAction } from "@/components/auth/denied-action";
import { QueryError } from "@/components/ui/query-error";
import {
  useBays,
  useCheckInLookup,
  useFleetActions,
  useFleetClients,
  usePreviewSettings,
  useReadyForCollection,
  useServiceTasks,
  useTechnicians,
  useVehiclePage,
  useWorkOrderPage,
  type NewWorkOrderLine,
} from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { computeTotals, recalcLine } from "@/lib/billing";
import { formatCurrency, formatDate, formatKm } from "@/lib/utils";
import type { WorkOrder, WorkOrderStatus } from "@/types";

const SLOTS = ["08:00", "09:30", "11:00", "13:00", "14:30", "16:00"];

/** Statuses that mean a job on the vehicle is not finished. */
const OPEN_STATUSES: WorkOrderStatus[] = ["draft", "pending_approval", "approved", "partially_approved", "scheduled", "in_progress"];

function useDebounced<T>(value: T, ms: number): T {
  const [current, setCurrent] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return current;
}

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

interface Outcome {
  plate: string;
  booked: number;
  waiting: number;
  failures: string[];
  /** Said by the API but not a failure: an account over its credit limit still gets the work. */
  notes: string[];
}

function CheckInPanel() {
  const router = useRouter();
  const { technicians } = useTechnicians();
  const { bays } = useBays();
  const { tasksById } = useServiceTasks();
  const { clientName } = useFleetClients();
  const settings = usePreviewSettings();
  const { createWorkOrder, sendForApproval, scheduleWorkOrder, recordReading } = useFleetActions();
  const { canAsStaff, staffReason } = useCan();

  const activeTechnicians = React.useMemo(() => technicians.filter((tech) => tech.active), [technicians]);

  const [query, setQuery] = React.useState("");
  // What the exact lookup runs on: the typed text, or the plate picked from the list.
  const [lookupText, setLookupText] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState("");
  const [warning, setWarning] = React.useState<string | null>(null);
  const [readingError, setReadingError] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  // Recorded once per vehicle and value, so a retry after a failed job does
  // not post the same reading twice.
  const [recorded, setRecorded] = React.useState<string | null>(null);
  const [taskIds, setTaskIds] = React.useState<string[]>([]);
  const [bayId, setBayId] = React.useState("");
  const [technicianId, setTechnicianId] = React.useState("");
  const [slot, setSlot] = React.useState(SLOTS[0]);
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Outcome | null>(null);

  // Rosters load asynchronously; default to the first entry once they arrive.
  React.useEffect(() => {
    if (!bayId && bays.length > 0) setBayId(bays[0].id);
  }, [bayId, bays]);
  React.useEffect(() => {
    if (!technicianId && activeTechnicians.length > 0) setTechnicianId(activeTechnicians[0].id);
  }, [technicianId, activeTechnicians]);

  const debounced = useDebounced(query, 250);
  React.useEffect(() => {
    if (!selectedId) setLookupText(debounced);
  }, [debounced, selectedId]);

  // Substring matches for the picker (plate, make, model, driver)…
  const search = debounced.trim();
  const { data: matchPage } = useVehiclePage({ search, per_page: 6 }, { enabled: search.length > 0 && !selectedId });
  const matches = selectedId ? [] : (matchPage?.data ?? []);

  // …and the API's exact plate/VIN lookup, which hydrates the counter form.
  const { data: lookup, error: lookupError } = useCheckInLookup(lookupText);
  const found = lookup?.outcome === "existing" ? lookup : null;

  /**
   * An exact plate or VIN skips the picker entirely — the advisor typed the
   * whole identifier, so making them then click the single result is asking
   * for data the system already has.
   */
  React.useEffect(() => {
    const vehicle = found?.vehicle;
    if (!vehicle || vehicle.id === selectedId) return;
    setSelectedId(vehicle.id);
    setQuery("");
    // Pre-fill the last known reading only when it is recent. A stale one is
    // left blank to force a real look at the dash: accepted unchanged, it
    // would shift every due date behind it. The API decides which case this is.
    setReading(found.form.odometer !== null && !found.form.odometerNeedsConfirmation ? String(found.form.odometer) : "");
    setWarning(null);
    setReadingError(null);
    setConfirmed(false);
    // Pre-tick everything already overdue: the advisor is meant to offer it.
    setTaskIds(found.suggestedWork.filter((item) => item.status === "overdue").map((item) => item.task.id));
  }, [found, selectedId]);

  const vehicle = found && found.vehicle?.id === selectedId ? found.vehicle : null;
  const customerName = found?.customer?.name ?? (vehicle ? clientName(vehicle.fleetClientId) : "");
  const due = vehicle && found ? found.suggestedWork : [];

  function reset() {
    setSelectedId(null);
    setQuery("");
    setLookupText("");
    setReading("");
    setWarning(null);
    setReadingError(null);
    setConfirmed(false);
    setRecorded(null);
    setTaskIds([]);
    setNotes("");
    setError(null);
  }

  const parsed = Number(reading);
  const readingEntered = reading.trim().length > 0 && Number.isFinite(parsed) && parsed >= 0;
  const readingOk = readingEntered && (warning === null || confirmed);

  const chosen = due.filter((item) => taskIds.includes(item.task.id));
  const defaultLabourRate = settings?.defaultLabourRate ?? 0;

  /** One catalogue line per chosen job, at the catalogue's own estimate. */
  const linesFor = React.useCallback(
    (serviceTaskId: string): NewWorkOrderLine[] => {
      const task = tasksById.get(serviceTaskId);
      if (!task) return [];
      return [
        {
          serviceTaskId: task.id,
          description: task.name,
          category: task.category,
          quantity: 1,
          unitPartRate: task.estimatedCost,
          labourHours: task.estimatedHours,
          labourRate: defaultLabourRate,
          urgency: task.critical ? "safety_critical" : "recommended",
          partsSource: settings?.defaultPartsSource ?? "supplier_provided",
        },
      ];
    },
    [tasksById, defaultLabourRate, settings?.defaultPartsSource]
  );

  // PREVIEW: the API's billing arithmetic (golden-tested), so the counter can
  // quote while choosing. The saved quotes are priced by the API, and the API
  // decides who must approve them when they are sent.
  const previewOf = (lines: NewWorkOrderLine[]) =>
    computeTotals(
      lines.map((line) => recalcLine({ ...line, partCost: 0, labourCost: 0, approvalStatus: "pending" as const })),
      { vatRatePct: settings?.vatRatePct ?? 0, miscFeeFlat: 0 }
    );
  const estimate = previewOf(chosen.flatMap((item) => linesFor(item.task.id)));

  // A fresh provider's roster can be genuinely empty; booking needs a bay.
  const canSubmit = Boolean(vehicle) && readingOk && chosen.length > 0 && Boolean(bayId) && !pending;

  async function submit() {
    if (!vehicle || !canSubmit) return;
    setPending(true);
    setError(null);
    setReadingError(null);

    // The reading lands first and stands on its own: even if every quoted
    // line is later declined, the odometer capture is the part of check-in
    // that keeps every projection in the system honest.
    const value = Math.round(parsed);
    const readingKey = `${vehicle.id}:${value}`;
    if (recorded !== readingKey) {
      const result = await recordReading(vehicle.id, { value, confirmWarning: warning !== null && confirmed });
      if (!result.ok) {
        setPending(false);
        if (result.fields?.confirm_warning) {
          setWarning(result.fields.value?.[0] ?? result.error);
          setConfirmed(false);
        } else {
          setReadingError(result.fields?.value?.[0] ?? result.error);
        }
        return;
      }
      setRecorded(readingKey);
    }

    const today = formatISO(new Date(), { representation: "date" });
    const outcome: Outcome = { plate: vehicle.plateNumber, booked: 0, waiting: 0, failures: [], notes: [] };

    for (const item of chosen) {
      // Draft → send (numbered, auto-approved inside the client's band) →
      // book the bay once approved. In-house work: the vendor stays empty.
      const created = await createWorkOrder({
        vehicleId: vehicle.id,
        title: item.task.name,
        type: "preventive",
        priority: item.status === "overdue" ? "high" : "medium",
        scheduledFor: today,
        scheduledTime: slot,
        odometerAtIntake: value,
        taskIds: [item.task.id],
        notes,
        vendor: "",
        lines: linesFor(item.task.id),
      });
      if (!created.ok) {
        outcome.failures.push(`${item.task.name}: ${created.error}`);
        continue;
      }
      // Over the credit limit: the work stands; say so with the rest of the outcome.
      if (created.data.warnings.length > 0 && !outcome.notes.includes(created.data.warnings[0].message)) {
        outcome.notes.push(created.data.warnings[0].message);
      }
      const sent = await sendForApproval(created.data.id);
      if (!sent.ok) {
        outcome.failures.push(`${item.task.name}: saved as a draft, not sent — ${sent.error}`);
        continue;
      }
      if (sent.data.status !== "approved") {
        outcome.waiting += 1;
        continue;
      }
      const booked = await scheduleWorkOrder(sent.data.id, {
        scheduledFor: today,
        scheduledTime: slot,
        bayId,
        technicianId: technicianId || null,
      });
      if (booked.ok) outcome.booked += 1;
      else outcome.failures.push(`${item.task.name}: approved, but not booked — ${booked.error}`);
    }

    setPending(false);
    setDone(outcome);
    reset();
  }

  if (!canAsStaff("workorder:create")) {
    return (
      <div className="card">
        <EmptyState icon={DoorOpen} title="Check-in raises work orders" description={staffReason("workorder:create")} />
      </div>
    );
  }

  if (done) {
    const raised = done.booked + done.waiting;
    return (
      <section className="card-raised p-8 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-ok/10">
          <CheckCircle2 className="size-5 text-ok" />
        </span>
        <h3 className="mt-4 text-sm font-semibold tracking-tight">{done.plate} checked in</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          The odometer is recorded. {raised} {raised === 1 ? "work order" : "work orders"} raised
          {done.booked > 0 ? ` — ${done.booked} auto-approved and booked into the bay` : ""}
          {done.waiting > 0 ? `${done.booked > 0 ? ";" : " —"} ${done.waiting} waiting on the client's approval, to be booked once approved` : ""}.
        </p>
        {done.notes.length > 0 ? (
          <ul className="mx-auto mt-3 max-w-md space-y-1 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-left text-xs" role="status">
            {done.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        {done.failures.length > 0 ? (
          <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-xs text-critical" role="alert">
            {done.failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        ) : null}
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
            <h3 className="text-sm font-semibold tracking-tight">1 · Find the vehicle</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">Search by plate, VIN, make, model, or driver.</p>
          </header>

          <div className="space-y-3 border-t border-border px-5 py-4">
            {!vehicle ? (
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
            ) : null}

            {lookupError ? <QueryError error={lookupError} /> : null}

            {matches.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {matches.map((entry) => (
                  <li key={entry.id}>
                    <button
                      onClick={() => setLookupText(entry.plateNumber)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2/60"
                    >
                      <span className="tabular w-[92px] shrink-0 text-xs font-medium">{entry.plateNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {entry.year} {entry.make} {entry.model}
                        <span className="ml-2 text-subtle-foreground">{clientName(entry.fleetClientId)}</span>
                      </span>
                      {entry.pms ? <PmsStatusBadge status={entry.pms.status} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {!vehicle && lookup?.outcome === "new" && matches.length === 0 ? (
              <WalkInForm
                identifier={lookupText.trim()}
                onRegistered={(plate) => {
                  // The lookup refetches (the write invalidates it) and now
                  // finds the vehicle, which selects it like any exact match.
                  setQuery(plate);
                  setLookupText(plate);
                }}
              />
            ) : null}

            {vehicle ? (
              <div className="rounded-lg border border-brand/30 bg-brand-muted/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="tabular text-sm font-semibold">{vehicle.plateNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {vehicle.year} {vehicle.make} {vehicle.model} · {customerName}
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
                  <Gauge className="size-4 text-subtle-foreground" />2 · Odometer reading
                  <Badge tone="critical">Required</Badge>
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-subtle-foreground">
                  Drive-in is the one moment the reading is certain. Every distance projection in the system is only as
                  good as this number.
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
                    setWarning(null);
                    setReadingError(null);
                    setConfirmed(false);
                  }}
                />
                {readingError ? (
                  <p className="text-xs text-critical">{readingError}</p>
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
                  <p className="text-xs text-subtle-foreground">
                    Last recorded {formatKm(vehicle.odometer)} on {formatDate(vehicle.odometerReadAt)}
                    {found?.form.odometerNeedsConfirmation ? " — too old to pre-fill; read the dash." : "."}
                  </p>
                )}
              </div>
            </section>

            {/* 3 — what's due */}
            <section className="card-raised">
              <header className="px-5 pb-3 pt-4">
                <h3 className="text-sm font-semibold tracking-tight">3 · Work to offer</h3>
                <p className="mt-0.5 text-xs text-subtle-foreground">
                  Everything this vehicle is overdue or nearly due for. Overdue items are ticked already.
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
                              event.target.checked ? [...current, item.task.id] : current.filter((id) => id !== item.task.id)
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{item.task.name}</span>
                          <span className="tabular block text-2xs text-subtle-foreground">
                            {item.dueLabel} · governed by {item.governedBy}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-xs text-muted-foreground">
                          {formatCurrency(previewOf(linesFor(item.task.id)).subTotal)}
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
                <h3 className="text-sm font-semibold tracking-tight">4 · Bay and technician</h3>
                <p className="mt-0.5 text-xs text-subtle-foreground">
                  Booked as soon as a job is approved — straight away when it falls inside the client&apos;s auto-approve
                  band.
                </p>
              </header>
              <div className="grid gap-4 border-t border-border px-5 py-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="checkin-bay">Bay</Label>
                  <Select value={bayId} onValueChange={setBayId}>
                    <SelectTrigger id="checkin-bay">
                      <SelectValue placeholder="No bays set up" />
                    </SelectTrigger>
                    <SelectContent>
                      {bays.map((bay) => (
                        <SelectItem key={bay.id} value={bay.id}>
                          {bay.name}
                          {bay.focus ? ` — ${bay.focus}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="checkin-tech">Technician</Label>
                  <Select value={technicianId} onValueChange={setTechnicianId}>
                    <SelectTrigger id="checkin-tech">
                      <SelectValue placeholder="No technicians on the roster" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTechnicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
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
              Find a vehicle to begin. Nothing is written until you raise the work orders.
            </p>
          ) : (
            <>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Vehicle</dt>
                  <dd className="tabular text-right font-medium">{vehicle.plateNumber}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Client</dt>
                  <dd className="text-right font-medium">{customerName}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Odometer</dt>
                  <dd className={`tabular text-right font-medium ${readingOk ? "" : "text-subtle-foreground"}`}>
                    {readingOk ? formatKm(Math.round(parsed)) : "Not captured"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-subtle-foreground">Jobs</dt>
                  <dd className="tabular text-right font-medium">{chosen.length}</dd>
                </div>
                <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
                  <dt className="text-subtle-foreground">Estimate · preview</dt>
                  <dd className="tabular text-right font-semibold">{formatCurrency(estimate.subTotal)}</dd>
                </div>
              </dl>

              {chosen.length > 0 ? (
                <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
                  Before VAT, at catalogue rates. The server prices each quote when it is raised and decides whether the
                  client must approve it first.
                </p>
              ) : null}

              {error ? <p className="mt-3 text-xs text-critical">{error}</p> : null}

              <Button variant="primary" className="mt-4 w-full" disabled={!canSubmit} onClick={() => void submit()}>
                {pending ? "Raising…" : `Raise ${chosen.length || ""} ${chosen.length === 1 ? "work order" : "work orders"}`}
              </Button>

              {!readingOk ? (
                <p className="mt-2 text-2xs text-subtle-foreground">
                  {warning ? "Confirm the reading to continue." : "Record the odometer to continue."}
                </p>
              ) : chosen.length === 0 ? (
                <p className="mt-2 text-2xs text-subtle-foreground">Select at least one service to raise.</p>
              ) : null}
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ walk-in */

/**
 * No vehicle matched the plate: register the customer, the vehicle and its
 * first reading in one call (`POST /check-in`). Consent to keep service
 * records is part of that same transaction — no records without it.
 */
function WalkInForm({ identifier, onRegistered }: { identifier: string; onRegistered: (plate: string) => void }) {
  const { checkInWalkIn } = useFleetActions();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    accountType: "individual" as "individual" | "company",
    firstName: "",
    lastName: "",
    companyName: "",
    mobile: "",
    email: "",
    plate: identifier,
    make: "",
    model: "",
    year: "",
    odometer: "",
    consent: false,
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    setForm((current) => ({ ...current, plate: identifier }));
  }, [identifier]);

  const patch = (next: Partial<typeof form>) => setForm((current) => ({ ...current, ...next }));
  const named = form.accountType === "company" ? form.companyName.trim() : form.firstName.trim() && form.lastName.trim();
  const canSubmit = Boolean(named && form.plate.trim() && form.odometer.trim() && form.consent) && !pending;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setFields({});
    const result = await checkInWalkIn({
      customer:
        form.accountType === "company"
          ? { account_type: "company", display_name: form.companyName.trim(), mobile: form.mobile || null, email: form.email || null }
          : {
              account_type: "individual",
              first_name: form.firstName.trim(),
              last_name: form.lastName.trim(),
              mobile: form.mobile || null,
              email: form.email || null,
            },
      consents: [{ purpose: "service_records", granted: true, channel: "in_person" }],
      vehicle: {
        plate_number: form.plate.trim(),
        make: form.make || null,
        model: form.model || null,
        year: form.year ? Number(form.year) : null,
      },
      odometer: Number(form.odometer),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? {});
      return;
    }
    onRegistered(result.data.vehicle.plateNumber);
  }

  const fieldError = (key: string) => fields[key]?.[0];

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          No vehicle with plate or VIN <span className="tabular font-medium text-foreground">{identifier}</span>.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <UserPlus />
          Register a walk-in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="walkin-type">Customer</Label>
          <Select value={form.accountType} onValueChange={(value) => patch({ accountType: value as "individual" | "company" })}>
            <SelectTrigger id="walkin-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="company">Company</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.accountType === "company" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="walkin-company">Company name</Label>
            <Input id="walkin-company" value={form.companyName} onChange={(event) => patch({ companyName: event.target.value })} />
            {fieldError("customer.display_name") ? <p className="text-2xs text-critical">{fieldError("customer.display_name")}</p> : null}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-first">First name</Label>
              <Input id="walkin-first" value={form.firstName} onChange={(event) => patch({ firstName: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkin-last">Last name</Label>
              <Input id="walkin-last" value={form.lastName} onChange={(event) => patch({ lastName: event.target.value })} />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="walkin-mobile">Mobile</Label>
          <Input id="walkin-mobile" value={form.mobile} onChange={(event) => patch({ mobile: event.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="walkin-email">Email</Label>
          <Input id="walkin-email" type="email" value={form.email} onChange={(event) => patch({ email: event.target.value })} />
          {fieldError("customer.email") ? <p className="text-2xs text-critical">{fieldError("customer.email")}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="walkin-plate">Plate</Label>
          <Input id="walkin-plate" className="tabular" value={form.plate} onChange={(event) => patch({ plate: event.target.value })} />
          {fieldError("vehicle.plate_number") ? <p className="text-2xs text-critical">{fieldError("vehicle.plate_number")}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="walkin-make">Make</Label>
          <Input id="walkin-make" value={form.make} onChange={(event) => patch({ make: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="walkin-model">Model</Label>
          <Input id="walkin-model" value={form.model} onChange={(event) => patch({ model: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="walkin-year">Year</Label>
          <Input id="walkin-year" type="number" inputMode="numeric" className="tabular" value={form.year} onChange={(event) => patch({ year: event.target.value })} />
          {fieldError("vehicle.year") ? <p className="text-2xs text-critical">{fieldError("vehicle.year")}</p> : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="walkin-odo">Odometer now (km)</Label>
          <Input id="walkin-odo" type="number" inputMode="numeric" className="tabular" value={form.odometer} onChange={(event) => patch({ odometer: event.target.value })} />
          {fieldError("odometer") ? <p className="text-2xs text-critical">{fieldError("odometer")}</p> : null}
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="mt-0.5 size-3.5 accent-brand"
          checked={form.consent}
          onChange={(event) => patch({ consent: event.target.checked })}
        />
        The customer agreed, in person, to the shop keeping service records for this vehicle.
      </label>

      {error ? <p className="text-xs text-critical">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={!canSubmit} onClick={() => void submit()}>
          {pending ? "Registering…" : "Register and continue"}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- check-out */

function CheckOutPanel() {
  // Closed and the vehicle still here — the API's list. Handing it back settles nothing: payment does (Billing).
  const { data: ready, error, refetch } = useReadyForCollection();
  const [released, setReleased] = React.useState<number | null>(null);

  const byVehicle = React.useMemo(() => {
    const map = new Map<string, WorkOrder[]>();
    for (const order of ready ?? []) {
      const list = map.get(order.vehicleId) ?? [];
      list.push(order);
      map.set(order.vehicleId, list);
    }
    return [...map.entries()];
  }, [ready]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!ready) return <Skeleton className="h-96" />;

  if (byVehicle.length === 0) {
    return (
      <div className="space-y-4">
        {released !== null ? <Released count={released} /> : null}
        <div className="card">
          <EmptyState
            icon={PackageCheck}
            title="Nothing waiting to be collected"
            description="Every finished job's vehicle has been handed back to its client."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {released !== null ? <Released count={released} /> : null}
      {byVehicle.map(([vehicleId, orders]) => (
        <CollectionCard key={vehicleId} vehicleId={vehicleId} orders={orders} onReleased={setReleased} />
      ))}
    </div>
  );
}

function Released({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/[0.07] px-4 py-3">
      <CheckCircle2 className="size-4 shrink-0 text-ok" />
      <p className="text-xs text-muted-foreground">
        {count} {count === 1 ? "job" : "jobs"} handed back and stamped with your name and the time. Billing follows from the billing queue.
      </p>
    </div>
  );
}

function CollectionCard({
  vehicleId,
  orders,
  onReleased,
}: {
  vehicleId: string;
  orders: WorkOrder[];
  onReleased: (count: number) => void;
}) {
  const { collectWorkOrders } = useFleetActions();
  const { canAsStaff, staffReason } = useCan();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Anything still open on the same vehicle blocks release.
  const { data: open } = useWorkOrderPage({ vehicle_id: vehicleId, status: OPEN_STATUSES, per_page: 1 });
  const blocking = open?.meta.total ?? 0;

  const first = orders[0];
  const vehicle = first.vehicle;
  const total = orders.reduce((sum, order) => sum + order.totals.grandTotal, 0);

  const releaseButton = (
    <Button
      variant="primary"
      size="sm"
      disabled={blocking > 0 || pending}
      onClick={async () => {
        setPending(true);
        setError(null);
        const result = await collectWorkOrders(orders.map((o) => o.id));
        setPending(false);
        if (result.ok) onReleased(result.data.collected);
        else setError(result.error);
      }}
    >
      {pending ? "Releasing…" : "Hand back vehicle"}
    </Button>
  );

  return (
    <section className="card-raised">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="tabular flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Car className="size-4 text-subtle-foreground" />
            {vehicle?.plateNumber ?? "Unknown vehicle"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-subtle-foreground">
            {vehicle ? `${vehicle.make} ${vehicle.model} · ` : ""}
            {first.customerName ?? "—"}
          </p>
        </div>
        {canAsStaff("workorder:complete") ? (
          releaseButton
        ) : (
          <DeniedAction reason={staffReason("workorder:complete")}>{releaseButton}</DeniedAction>
        )}
      </header>

      <ul className="divide-y divide-border border-t border-border">
        {orders.map((order) => (
          <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <Link
              href={`/work-orders/${order.id}`}
              className="w-[112px] shrink-0 text-xs font-medium transition-colors hover:text-brand"
            >
              {order.displayReference}
            </Link>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{order.title}</span>
            <span className="tabular shrink-0 text-xs font-medium">{formatCurrency(order.totals.grandTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/60 px-5 py-3">
        {error ? (
          <p className="text-2xs text-critical">{error}</p>
        ) : blocking > 0 ? (
          <p className="text-2xs text-critical">
            {blocking} job{blocking === 1 ? "" : "s"} still open on this vehicle — it is not finished.
          </p>
        ) : (
          <p className="text-2xs text-subtle-foreground">All work closed. Ready to release.</p>
        )}
        <p className="tabular text-sm font-semibold">{formatCurrency(total)}</p>
      </div>
    </section>
  );
}
