"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BranchTheme } from "@/components/detailing/branch-theme";
import { formatDay } from "@/components/detailing/booking-status";
import { describeApiError, isApiError } from "@/lib/api/errors";
import { fetchPublicAvailability, fetchPublicPage, requestPublicBooking } from "@/lib/detailing-public";
import { cn, formatPesos } from "@/lib/utils";
import type { PublicPage, SizeClass } from "@/types/detailing";

const field = "w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-subtle-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring/40";
const WHY_NOT: Record<string, string> = { blocked: "Unavailable", capacity: "Fully booked", overflow: "Unavailable", past: "Already past" };

/**
 * A detailing branch's public booking page, in that branch's own look. Three
 * steps, as in the source: vehicle and package, date and time, your details.
 * Which times are free, what the package costs for the vehicle's size and
 * when the job would end all come from the API; a request lands pending and
 * the shop confirms it.
 */
export default function PublicBookingPage() {
  const { branchSlug } = useParams<{ branchSlug: string }>();
  const page = useQuery({ queryKey: ["public-detailing", branchSlug], queryFn: () => fetchPublicPage(branchSlug), retry: false });

  if (page.isPending) return <div className="min-h-screen bg-page" aria-busy="true" />;
  if (page.error || !page.data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">This booking page is not available</h1>
        <p className="text-sm text-muted-foreground">Check the address, or contact the shop directly.</p>
      </main>
    );
  }

  const { branch, booking } = page.data;
  return (
    <BranchTheme tokens={branch.themeTokens}>
      <header className="border-b border-border px-5 py-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-brand">Auto detailing</p>
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">{branch.name}</h1>
        {branch.address ? <p className="mt-2 text-xs text-muted-foreground">{branch.address}</p> : null}
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        {booking.enabled ? (
          <BookingForm slug={branchSlug} page={page.data} />
        ) : (
          <section className="rounded-lg border border-border bg-surface p-8 text-center">
            <h2 className="text-2xl font-semibold">Online booking is unavailable</h2>
            <p className="mt-3 text-sm text-muted-foreground">{booking.notice}</p>
            {branch.contactPhone ? <p className="mt-4 text-sm">Call us on {branch.contactPhone}.</p> : null}
          </section>
        )}
      </main>
    </BranchTheme>
  );
}

function BookingForm({ slug, page }: { slug: string; page: PublicPage }) {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [sizeClass, setSizeClass] = React.useState<SizeClass | "">("");
  const [packageId, setPackageId] = React.useState("");
  const [date, setDate] = React.useState(page.booking.firstDate);
  const [startTime, setStartTime] = React.useState("");
  const [details, setDetails] = React.useState({ firstName: "", lastName: "", email: "", phone: "", vehicleMake: "", vehicleModel: "", vehicleYear: "", plateNumber: "", notes: "" });
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  const offered = page.packages.filter((pkg) => !sizeClass || pkg.prices.some((p) => p.sizeClass === sizeClass));
  const selected = page.packages.find((pkg) => pkg.id === packageId) ?? null;
  const price = selected?.prices.find((p) => p.sizeClass === sizeClass) ?? null;

  const availability = useQuery({
    queryKey: ["public-detailing-availability", slug, packageId, sizeClass, date],
    queryFn: () => fetchPublicAvailability(slug, packageId, sizeClass as SizeClass, date),
    enabled: step >= 2 && Boolean(packageId && sizeClass && date),
  });
  const start = availability.data?.starts.find((option) => option.time === startTime) ?? null;

  React.useEffect(() => setStartTime(""), [packageId, sizeClass, date]);

  const set = (key: keyof typeof details) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDetails((current) => ({ ...current, [key]: event.target.value }));
  const errorFor = (key: string) => (fieldErrors[key]?.[0] ? <p className="mt-1 text-xs text-critical">{fieldErrors[key][0]}</p> : null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!sizeClass || !start) return;
    setBusy(true);
    setFailure(null);
    setFieldErrors({});
    try {
      const made = await requestPublicBooking(slug, {
        packageId,
        sizeClass,
        date,
        startTime,
        firstName: details.firstName,
        lastName: details.lastName,
        email: details.email,
        phone: details.phone,
        vehicleMake: details.vehicleMake,
        vehicleModel: details.vehicleModel,
        vehicleYear: details.vehicleYear ? Number(details.vehicleYear) : undefined,
        plateNumber: details.plateNumber,
        notes: details.notes,
        consent,
      });
      router.push(`/book/${slug}/confirmation/${made.token}`);
    } catch (error) {
      setBusy(false);
      setFailure(describeApiError(error));
      if (isApiError(error)) {
        setFieldErrors(error.fields ?? {});
        // The slot filled while the form was open: back to the times, read afresh.
        if (error.status === 409) {
          setStep(2);
          setStartTime("");
          void availability.refetch();
        }
      }
    }
  }

  return (
    <>
      <ol className="mb-8 flex items-center justify-center gap-3 text-xs" aria-label="Booking steps">
        {["Vehicle & package", "Date & time", "Your details"].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={cn("flex items-center gap-2", step === index + 1 ? "text-brand" : "text-subtle-foreground")}>
            <span className={cn("flex size-6 items-center justify-center rounded-full border text-2xs", step >= index + 1 ? "border-brand" : "border-border")}>{index + 1}</span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold">How big is your vehicle?</h2>
            <p className="mt-1 text-sm text-muted-foreground">We&apos;ll tailor the packages and prices to its size.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Vehicle size">
              {page.sizes.map((size) => (
                <button
                  key={size.sizeClass}
                  type="button"
                  aria-pressed={sizeClass === size.sizeClass}
                  onClick={() => {
                    setSizeClass(size.sizeClass);
                    setPackageId("");
                  }}
                  className={cn("rounded-lg border px-4 py-3 text-sm transition-colors", sizeClass === size.sizeClass ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface hover:border-border-strong")}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {sizeClass ? (
            <div>
              <h2 className="text-2xl font-semibold">Choose a package</h2>
              {offered.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No packages are available for this vehicle size yet.</p> : null}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {offered.map((pkg) => {
                  const forSize = pkg.prices.find((p) => p.sizeClass === sizeClass);
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      aria-pressed={packageId === pkg.id}
                      onClick={() => setPackageId(pkg.id)}
                      className={cn("rounded-lg border p-5 text-left transition-colors", packageId === pkg.id ? "border-brand bg-brand-muted" : "border-border bg-surface hover:border-border-strong")}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-xl font-semibold [font-family:var(--font-heading,inherit)]">{pkg.name}</span>
                        <span className="text-brand">{forSize ? formatPesos(forSize.price) : ""}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {(forSize?.duration ?? pkg.duration).interpreted}
                        {pkg.isPopular ? " · Most popular" : ""}
                      </span>
                      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {pkg.inclusions.slice(0, 5).map((line) => (
                          <li key={line}>· {line}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button type="button" disabled={!packageId} onClick={() => setStep(2)} className="rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-40">
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold">When would you like to come?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected?.name} takes about {(price?.duration ?? selected?.duration)?.interpreted}. We close at {page.booking.closingLabel}.
            </p>
          </div>
          <div>
            <label htmlFor="date" className="mb-1.5 block text-xs text-muted-foreground">
              Date
            </label>
            <input id="date" type="date" min={page.booking.firstDate} max={page.booking.lastDate} value={date} onChange={(event) => setDate(event.target.value || page.booking.firstDate)} className={cn(field, "max-w-xs")} />
          </div>
          {availability.isPending ? (
            <p className="text-sm text-muted-foreground">Checking which times are free…</p>
          ) : availability.error ? (
            <p role="alert" className="text-sm text-critical">
              {describeApiError(availability.error)}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label="Start time">
              {availability.data.starts.map((option) => (
                <button
                  key={option.time}
                  type="button"
                  disabled={!option.available}
                  aria-pressed={startTime === option.time}
                  title={option.available ? undefined : WHY_NOT[option.reason ?? ""]}
                  onClick={() => setStartTime(option.time)}
                  className={cn(
                    "rounded-md border px-2 py-2.5 text-sm transition-colors",
                    startTime === option.time ? "border-brand bg-brand text-brand-foreground" : option.available ? "border-border bg-surface hover:border-border-strong" : "cursor-not-allowed border-border text-subtle-foreground line-through opacity-60"
                  )}
                >
                  {option.label}
                </button>
              ))}
              {availability.data.starts.every((option) => !option.available) ? <p className="col-span-full text-sm text-muted-foreground">Nothing is free that day. Try another date.</p> : null}
            </div>
          )}
          {start ? (
            <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted-foreground">
              We expect to finish at {start.ends?.label}
              {start.spansDays ? ` on ${formatDay(start.ends?.date ?? null)}: this package does not fit before closing, so it carries on the next morning.` : "."}
            </p>
          ) : null}
          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="rounded-md border border-border px-5 py-2.5 text-sm">
              Back
            </button>
            <button type="button" disabled={!start} onClick={() => setStep(3)} className="rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-40">
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <form onSubmit={(event) => void submit(event)} className="space-y-6">
          <h2 className="text-2xl font-semibold">Your details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["firstName", "First name", "given-name", "text", "first_name", true],
                ["lastName", "Last name", "family-name", "text", "last_name", true],
                ["email", "Email", "email", "email", "email", true],
                ["phone", "Mobile number", "tel", "tel", "phone", true],
                ["vehicleMake", "Vehicle make", "off", "text", "vehicle_make", true],
                ["vehicleModel", "Vehicle model", "off", "text", "vehicle_model", true],
                ["vehicleYear", "Year (optional)", "off", "number", "vehicle_year", false],
                ["plateNumber", "Plate number (optional)", "off", "text", "plate_number", false],
              ] as const
            ).map(([key, label, autoComplete, type, apiField, required]) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1.5 block text-xs text-muted-foreground">
                  {label}
                </label>
                <input id={key} type={type} autoComplete={autoComplete} required={required} value={details[key]} onChange={set(key)} className={field} />
                {errorFor(apiField)}
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="notes" className="mb-1.5 block text-xs text-muted-foreground">
              Anything we should know? (optional)
            </label>
            <textarea id="notes" rows={3} value={details.notes} onChange={set("notes")} className={field} />
          </div>

          <dl className="rounded-lg border border-border bg-surface p-5 text-sm">
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Package</dt>
              <dd>{selected?.name}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">When</dt>
              <dd>
                {formatDay(date)}, {start?.label}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Package price</dt>
              <dd className="text-brand">{price ? formatPesos(price.price) : "—"}</dd>
            </div>
          </dl>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required className="mt-1 size-4 accent-[hsl(var(--brand))]" />
            <span>
              I agree that {page.branch.name} keeps a record of this booking and the work done on my vehicle.
              {errorFor("consent_service_records")}
            </span>
          </label>

          {failure ? (
            <p role="alert" className="rounded-md border border-critical/40 bg-critical/10 p-3 text-sm text-critical">
              {failure}
            </p>
          ) : null}
          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(2)} className="rounded-md border border-border px-5 py-2.5 text-sm">
              Back
            </button>
            <button type="submit" disabled={busy || !consent} className="rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-40">
              {busy ? "Sending…" : "Request this booking"}
            </button>
          </div>
          <p className="text-center text-xs text-subtle-foreground">Your booking is a request until our team confirms it. We will email you both times.</p>
        </form>
      ) : null}
    </>
  );
}
