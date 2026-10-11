"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { formatDay } from "@/components/detailing/booking-status";
import { CustomerBenefitsNote } from "@/components/crm/customer-benefits";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { newIdempotencyKey } from "@/lib/api/client";
import { useAvailability, useDetailingActions, useDetailingCatalogue } from "@/lib/detailing";
import { useCan } from "@/lib/rbac";
import { useAllVehicles, useFleetClients } from "@/lib/store";
import { cn, formatPesos, manilaDateDaysAgo } from "@/lib/utils";
import type { SizeClass, StartOption } from "@/types/detailing";

const WHY_NOT: Record<NonNullable<StartOption["reason"]>, string> = {
  blocked: "Blocked by the shop",
  capacity: "No detailer free",
  overflow: "No slot left that day",
  past: "Already past",
};

/**
 * New booking at the counter. The form says who, what, which size and when;
 * the API answers which starts are free (and why not), where the job will sit
 * (it rolls into the next morning when it does not fit before closing), what
 * it costs for that size, and which detailers are already busy.
 */
export default function NewDetailingBookingPage() {
  const router = useRouter();
  const { can, reason } = useCan();
  const catalogue = useDetailingCatalogue();
  const { fleetClients, isSuccess: clientsReady } = useFleetClients();
  const actions = useDetailingActions();

  const [accountId, setAccountId] = React.useState("");
  const [vehicleId, setVehicleId] = React.useState("");
  const [vehicleLabel, setVehicleLabel] = React.useState("");
  const [packageId, setPackageId] = React.useState("");
  const [sizeClass, setSizeClass] = React.useState<SizeClass | "">("");
  const [date, setDate] = React.useState(() => manilaDateDaysAgo(0));
  const [startTime, setStartTime] = React.useState("");
  const [detailerIds, setDetailerIds] = React.useState<string[]>([]);
  const [addonIds, setAddonIds] = React.useState<string[]>([]);
  const [confirmed, setConfirmed] = React.useState(true);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  // One key per attempt at this form, so a retried click replays instead of booking twice.
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => newIdempotencyKey());

  const { vehicles } = useAllVehicles(accountId ? { customer_account_id: accountId } : {});
  const accountVehicles = accountId ? vehicles.filter((vehicle) => vehicle.fleetClientId === accountId) : [];

  const selectedPackage = catalogue.data?.packages.find((p) => p.id === packageId) ?? null;
  const price = selectedPackage?.prices.find((p) => p.sizeClass === sizeClass) ?? null;
  const availability = useAvailability({ packageId: packageId || null, sizeClass: sizeClass || null, date: date || null });
  const start = availability.data?.starts.find((option) => option.time === startTime) ?? null;

  React.useEffect(() => setStartTime(""), [packageId, sizeClass, date]);
  React.useEffect(() => setVehicleId(""), [accountId]);
  // A detailer who turns out to be busy at the chosen start is dropped from the selection.
  React.useEffect(() => {
    if (start) setDetailerIds((ids) => ids.filter((id) => !start.busyDetailerIds.includes(id)));
  }, [start]);

  if (catalogue.error) return <QueryError error={catalogue.error} onRetry={() => void catalogue.refetch()} />;
  if (!catalogue.isSuccess || !clientsReady) return <Skeleton className="h-96" />;

  const { packages, addons, detailers } = catalogue.data;
  const ready = Boolean(accountId && packageId && sizeClass && date && start?.available);

  async function submit() {
    if (!ready || !sizeClass) return;
    setBusy(true);
    setFailure(null);
    const vehicle = accountVehicles.find((v) => v.id === vehicleId);
    const result = await actions.takeBooking(
      {
        customerAccountId: accountId,
        vehicleId: vehicleId || undefined,
        vehicleLabel: vehicle ? undefined : vehicleLabel,
        packageId,
        sizeClass,
        date,
        startTime,
        detailerIds,
        confirmed,
        notes,
        addons: addonIds.map((addonId) => ({ addonId })),
      },
      idempotencyKey
    );
    setBusy(false);
    if (result.ok) {
      router.push(`/shop/detailing/bookings/${result.data.id}`);
      return;
    }
    // The slot may have filled while the form was open: show the API's words and read the starts again.
    setFailure(result.error);
    setIdempotencyKey(newIdempotencyKey());
    void availability.refetch();
  }

  const save = (
    <Button variant="primary" onClick={() => void submit()} disabled={!ready || busy}>
      <CalendarPlus />
      {busy ? "Booking…" : confirmed ? "Book and confirm" : "Book as pending"}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="New booking"
        description="Take a detailing booking at the counter. Times, price and detailer availability come from the server as you choose."
        breadcrumb={[{ label: "Bookings", href: "/shop/detailing" }, { label: "New booking" }]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold">Customer and vehicle</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="account">Customer</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="account">
                    <SelectValue placeholder="Choose a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {fleetClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-2xs text-subtle-foreground">A walk-in is registered under Check in / out first.</p>
                {accountId ? <CustomerBenefitsNote accountId={accountId} /> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vehicle">Vehicle</Label>
                {accountVehicles.length > 0 ? (
                  <Select value={vehicleId} onValueChange={setVehicleId}>
                    <SelectTrigger id="vehicle">
                      <SelectValue placeholder="Choose a vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountVehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")} · {vehicle.plateNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id="vehicle" value={vehicleLabel} onChange={(event) => setVehicleLabel(event.target.value)} placeholder="e.g. 2019 Toyota Fortuner" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="size">Vehicle size</Label>
                <Select value={sizeClass} onValueChange={(value) => setSizeClass(value as SizeClass)}>
                  <SelectTrigger id="size">
                    <SelectValue placeholder="Choose a size" />
                  </SelectTrigger>
                  <SelectContent>
                    {(["small", "medium", "large", "xl"] as const).map((size) => (
                      <SelectItem key={size} value={size}>
                        {size === "xl" ? "XL" : size[0].toUpperCase() + size.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold">Package</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {packages.map((pkg) => {
                const forSize = pkg.prices.find((p) => p.sizeClass === sizeClass);
                const offered = !sizeClass || Boolean(forSize);
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    disabled={!offered}
                    aria-pressed={packageId === pkg.id}
                    onClick={() => setPackageId(pkg.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      packageId === pkg.id ? "border-brand bg-brand-muted" : "border-border bg-surface hover:bg-surface-2"
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{pkg.name}</span>
                      <span className="tabular text-xs text-foreground">{forSize ? formatPesos(forSize.price) : sizeClass ? "Not offered" : ""}</span>
                    </span>
                    <span className="mt-0.5 block text-2xs text-subtle-foreground">
                      {(forSize?.duration ?? pkg.duration).interpreted} · needs {pkg.minDetailers} detailer{pkg.minDetailers === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>

            {addons.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Extras</p>
                <div className="flex flex-wrap gap-2">
                  {addons.map((addon) => {
                    const forSize = addon.prices.find((p) => p.sizeClass === sizeClass);
                    const on = addonIds.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        aria-pressed={on}
                        disabled={Boolean(sizeClass) && !forSize}
                        onClick={() => setAddonIds((ids) => (on ? ids.filter((id) => id !== addon.id) : [...ids, addon.id]))}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50",
                          on ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2"
                        )}
                      >
                        {addon.name}
                        {forSize ? <span className="tabular ml-1.5">{formatPesos(forSize.price)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="card space-y-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold">Date and start time</h2>
              <div className="space-y-1.5">
                <Label htmlFor="date" className="sr-only">
                  Date
                </Label>
                <Input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-44" />
              </div>
            </div>
            {!packageId || !sizeClass ? (
              <p className="text-xs text-muted-foreground">Choose a package and a vehicle size to see which starts are free.</p>
            ) : availability.error ? (
              <QueryError error={availability.error} onRetry={() => void availability.refetch()} />
            ) : !availability.data ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {availability.data.starts.map((option) => (
                  <button
                    key={option.time}
                    type="button"
                    disabled={!option.available}
                    aria-pressed={startTime === option.time}
                    title={option.available ? `${option.remaining} detailer${option.remaining === 1 ? "" : "s"} free` : option.reason ? WHY_NOT[option.reason] : undefined}
                    onClick={() => setStartTime(option.time)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-xs transition-colors",
                      startTime === option.time
                        ? "border-brand bg-brand text-brand-foreground"
                        : option.available
                          ? "border-border bg-surface hover:bg-surface-2"
                          : "cursor-not-allowed border-border bg-surface-2 text-subtle-foreground line-through"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            {start ? (
              <p className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  {start.plan.map((day, index) => (
                    <span key={day.date}>
                      {index > 0 ? ", then " : ""}
                      {formatDay(day.date)} ({day.slots.length} half-hour slot{day.slots.length === 1 ? "" : "s"})
                    </span>
                  ))}
                  . Expected finish {start.ends?.label ?? "—"}
                  {start.spansDays ? ` on ${formatDay(start.ends?.date ?? null)}` : ""}.
                  {start.spansDays ? " It does not fit before closing, so it carries on the next morning." : ""}
                </span>
              </p>
            ) : null}
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold">Detailers</h2>
            <p className="text-xs text-muted-foreground">Naming detailers is optional: the booking reserves heads from the pool either way.</p>
            <div className="flex flex-wrap gap-2">
              {detailers.map((detailer) => {
                const on = detailerIds.includes(detailer.id);
                const taken = start?.busyDetailerIds.includes(detailer.id) ?? false;
                return (
                  <button
                    key={detailer.id}
                    type="button"
                    aria-pressed={on}
                    disabled={taken}
                    title={taken ? "Already on another job in these hours" : undefined}
                    onClick={() => setDetailerIds((ids) => (on ? ids.filter((id) => id !== detailer.id) : [...ids, detailer.id]))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      on ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2"
                    )}
                  >
                    {detailer.name}
                    {taken ? " (busy)" : ""}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Anything the detailer should know" />
            </div>
          </section>
        </div>

        <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold">Summary</h2>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Package</dt>
              <dd className="text-right">{selectedPackage?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">When</dt>
              <dd className="text-right">{start ? `${formatDay(date)}, ${start.label}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Package price</dt>
              <dd className="tabular text-right">{price ? formatPesos(price.price) : "—"}</dd>
            </div>
          </dl>
          <p className="text-2xs text-subtle-foreground">The booking is priced by the server when it is saved, extras included; VAT is added on the invoice.</p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="size-4 accent-[hsl(var(--brand))]" />
            Confirm now (the customer is emailed)
          </label>
          {failure ? (
            <p role="alert" className="rounded-md border border-critical/30 bg-critical/10 p-3 text-xs text-critical">
              {failure}
            </p>
          ) : null}
          {can("detailing:book") ? save : <DeniedAction reason={reason("detailing:book")}>{save}</DeniedAction>}
        </aside>
      </div>
    </>
  );
}
