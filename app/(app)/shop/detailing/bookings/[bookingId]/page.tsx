"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, Banknote, CheckCircle2, Play, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { BookingStatusBadge, bookingStatusLabel, formatDay } from "@/components/detailing/booking-status";
import { InspectionPanel } from "@/components/detailing/inspection-panel";
import { RedeemCredit } from "@/components/crm/customer-benefits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYMENT_METHODS } from "@/lib/api/billing";
import { newIdempotencyKey } from "@/lib/api/client";
import { useBooking, useBookingInspections, useDetailingActions, useDetailingCatalogue } from "@/lib/detailing";
import { useCan } from "@/lib/rbac";
import { cn, formatManilaTime, formatPesos } from "@/lib/utils";
import type { BookingStatus, DetailingBooking } from "@/types/detailing";

type Prompt = { kind: "cancel" | "no_show" | "override" | "qc_fail" } | null;

/**
 * The job card: a booking from the moment it is taken to the moment it is
 * paid. Book → inspect → job → sign-off → bill. What each step needs, and
 * whether it is open to this user, is the API's (`next`, and its refusals).
 */
export default function JobCardPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { data: booking, error, refetch } = useBooking(bookingId);
  const inspections = useBookingInspections(bookingId);
  const catalogue = useDetailingCatalogue();
  const actions = useDetailingActions();
  const { can, reason } = useCan();

  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState<Prompt>(null);
  const [promptText, setPromptText] = React.useState("");
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!booking) return <Skeleton className="h-96" />;

  const id = booking.id;
  const books = can("detailing:book");
  const works = can("detailing:work");
  const mayMove = books || works;
  const open = booking.status === "pending" || booking.status === "confirmed";

  async function act<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string; reason?: string | null }>) {
    setBusy(true);
    setFailure(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      // Starting without the check-in inspection: offer the override the API allows.
      if (result.reason === "inspection_required") {
        setPromptText("");
        setPrompt({ kind: "override" });
      } else {
        setFailure(result.error);
      }
    }
    return result.ok;
  }

  const move = (status: BookingStatus, extra: { reason?: string; inspectionOverrideReason?: string } = {}) =>
    act(() => actions.setStatus(id, status, extra));

  async function confirmPrompt() {
    if (!prompt) return;
    const text = promptText.trim();
    const done =
      prompt.kind === "cancel"
        ? await move("cancelled", { reason: text })
        : prompt.kind === "no_show"
          ? await move("no_show", { reason: text })
          : prompt.kind === "override"
            ? await move("on_going", { inspectionOverrideReason: text })
            : await act(() => actions.signOff(id, false, text));
    if (done) setPrompt(null);
  }

  const gated = (allowed: boolean, capability: "detailing:book" | "detailing:work" | "detailing:qc", node: React.ReactElement) =>
    allowed ? node : <DeniedAction reason={reason(capability)}>{node}</DeniedAction>;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {booking.reference}
            <BookingStatusBadge status={booking.status} size="md" />
          </span>
        }
        description={`${booking.customer.name} · ${booking.vehicleLabel || "No vehicle noted"} · ${booking.sizeLabel}`}
        breadcrumb={[{ label: "Bookings", href: "/shop/detailing" }, { label: booking.reference }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {booking.status === "pending"
              ? gated(
                  books,
                  "detailing:book",
                  <Button variant="primary" disabled={busy} onClick={() => void move("confirmed")}>
                    <BadgeCheck />
                    Confirm
                  </Button>
                )
              : null}
            {open
              ? gated(
                  mayMove,
                  "detailing:work",
                  <Button variant={booking.status === "confirmed" ? "primary" : "secondary"} disabled={busy} onClick={() => void move("on_going")}>
                    <Play />
                    Start job
                  </Button>
                )
              : null}
            {booking.status === "on_going"
              ? gated(
                  mayMove,
                  "detailing:work",
                  <Button variant="primary" disabled={busy} onClick={() => void move("completed")}>
                    <CheckCircle2 />
                    Complete
                  </Button>
                )
              : null}
            {booking.status === "completed" && !booking.next.lockedByInvoice
              ? gated(
                  mayMove,
                  "detailing:work",
                  <Button disabled={busy} onClick={() => void move("on_going")}>
                    <RotateCcw />
                    Re-open
                  </Button>
                )
              : null}
            {open
              ? gated(
                  books,
                  "detailing:book",
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setPromptText("");
                      setPrompt({ kind: "cancel" });
                    }}
                  >
                    <XCircle />
                    Cancel
                  </Button>
                )
              : null}
            {booking.status === "confirmed"
              ? gated(
                  books,
                  "detailing:book",
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setPromptText("");
                      setPrompt({ kind: "no_show" });
                    }}
                  >
                    No-show
                  </Button>
                )
              : null}
          </div>
        }
      />

      {failure ? (
        <p role="alert" className="mb-4 rounded-md border border-critical/30 bg-critical/10 p-3 text-xs text-critical">
          {failure}
        </p>
      ) : null}
      {booking.next.needsInspection && open ? (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/15 p-3 text-xs">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          The vehicle is inspected before work starts. Record the check-in inspection below, or start with a reason.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Job</h2>
            <dl className="grid gap-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-subtle-foreground">Package</dt>
                <dd className="font-medium">{booking.package.name}</dd>
                <dd className="text-subtle-foreground">{booking.package.durationText}</dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Booked for</dt>
                <dd className="font-medium">
                  {formatDay(booking.scheduledDate)}, {booking.startLabel}
                </dd>
                <dd className="text-subtle-foreground">
                  {booking.finish.actual ? "Finished" : "Expected finish"} {booking.finish.label ?? "—"}
                  {booking.spansDays ? ` on ${formatDay(booking.finish.date)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-subtle-foreground">Times</dt>
                <dd>Started {booking.startedAt ? formatManilaTime(booking.startedAt) : "—"}</dd>
                <dd>Completed {booking.completedAt ? formatManilaTime(booking.completedAt) : "—"}</dd>
              </div>
            </dl>
            <ul className="mt-4 space-y-1 text-2xs text-subtle-foreground">
              {booking.days.map((day) => {
                const held = day.slots.filter((slot) => !slot.released);
                const released = day.slots.length - held.length;
                return (
                  <li key={day.date}>
                    {formatDay(day.date)}: {held.length > 0 ? `${held[0].label} onward, ${held.length} half-hour slot${held.length === 1 ? "" : "s"} held` : "nothing held"}
                    {released > 0 ? `, ${released} released when the job finished early` : ""}
                  </li>
                );
              })}
            </ul>
            {booking.notes ? <p className="mt-3 text-xs text-muted-foreground">{booking.notes}</p> : null}
            {booking.cancellationReason ? <p className="mt-3 text-xs text-muted-foreground">Reason: {booking.cancellationReason}</p> : null}
            {booking.inspection.overrideReason ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Started without an inspection ({booking.inspection.overriddenByName}): {booking.inspection.overrideReason}
              </p>
            ) : null}
          </section>

          {inspections.isSuccess ? (
            <>
              <InspectionPanel key={`in-${inspections.data.find((i) => i.stage === "check_in")?.id ?? "new"}`} booking={booking} stage="check_in" inspection={inspections.data.find((i) => i.stage === "check_in")} />
              {booking.status === "completed" || inspections.data.some((i) => i.stage === "check_out") ? (
                <InspectionPanel key={`out-${inspections.data.find((i) => i.stage === "check_out")?.id ?? "new"}`} booking={booking} stage="check_out" inspection={inspections.data.find((i) => i.stage === "check_out")} />
              ) : null}
            </>
          ) : (
            <Skeleton className="h-48" />
          )}

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Package checklist</h2>
              <p className="tabular text-xs text-muted-foreground">
                {booking.checklistProgress.done} of {booking.checklistProgress.total}
              </p>
            </div>
            {booking.checklist.length === 0 ? (
              <p className="text-xs text-muted-foreground">This package lists no steps.</p>
            ) : (
              <ul className="space-y-2">
                {booking.checklist.map((line) => (
                  <li key={line.index}>
                    <label className={cn("flex items-start gap-3 text-xs", !works && "opacity-60")}>
                      <input
                        type="checkbox"
                        checked={line.done}
                        disabled={!works || busy || booking.status === "cancelled" || booking.status === "no_show"}
                        onChange={(event) => void act(() => actions.tickChecklist(booking.id, line.index, event.target.checked))}
                        className="mt-0.5 size-4 accent-[hsl(var(--brand))]"
                      />
                      <span>
                        {line.label}
                        {line.done && line.doneByName ? <span className="block text-2xs text-subtle-foreground">{line.doneByName}</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">History</h2>
            <ol className="space-y-2 text-xs">
              {booking.statusLog.map((log) => (
                <li key={log.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular text-subtle-foreground">{formatManilaTime(log.changedAt)}</span>
                  <span>
                    {log.fromStatus ? `${bookingStatusLabel(log.fromStatus)} → ${bookingStatusLabel(log.toStatus)}` : `Booked (${bookingStatusLabel(log.toStatus)})`}
                  </span>
                  <span className="text-subtle-foreground">{log.actorName}</span>
                  {log.notes ? <span className="text-muted-foreground">“{log.notes}”</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-3 p-5">
            <h2 className="text-sm font-semibold">Detailers and bay</h2>
            <p className="text-xs text-muted-foreground">
              {booking.detailersCount} reserved from the pool; this package needs at least {booking.minDetailers}.
            </p>
            <div className="flex flex-wrap gap-2">
              {(catalogue.data?.detailers ?? booking.detailers).map((detailer) => {
                const on = booking.detailers.some((d) => d.id === detailer.id);
                return (
                  <button
                    key={detailer.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!books || busy || booking.next.lockedByInvoice}
                    onClick={() => {
                      const ids = booking.detailers.map((d) => d.id);
                      void act(() => actions.assignDetailers(booking.id, on ? ids.filter((id) => id !== detailer.id) : [...ids, detailer.id]));
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      on ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2"
                    )}
                  >
                    {detailer.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs">
              <span className="text-subtle-foreground">Bay: </span>
              {booking.bay?.name ?? "Not set"}
            </p>
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="text-sm font-semibold">Quality control</h2>
            {booking.qc.status ? (
              <p className="text-xs">
                <span className={booking.qc.status === "passed" ? "text-ok" : "text-critical"}>{booking.qc.status === "passed" ? "Signed off" : "Sent back"}</span> by {booking.qc.byName}
                {booking.qc.at ? `, ${formatManilaTime(booking.qc.at)}` : ""}
                {booking.qc.notes ? <span className="mt-1 block text-muted-foreground">{booking.qc.notes}</span> : null}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">A finished job is signed off by someone other than the detailer who worked it.</p>
            )}
            {booking.status === "completed" && booking.qc.status !== "passed" && !booking.next.lockedByInvoice ? (
              booking.next.canSignOff && can("detailing:qc") ? (
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" disabled={busy} onClick={() => void act(() => actions.signOff(booking.id, true))}>
                    <BadgeCheck />
                    Sign off
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setPromptText("");
                      setPrompt({ kind: "qc_fail" });
                    }}
                  >
                    Send back
                  </Button>
                </div>
              ) : (
                <DeniedAction reason={booking.next.signOffBlockedReason ?? reason("detailing:qc")}>
                  <Button variant="primary" size="sm">
                    Sign off
                  </Button>
                </DeniedAction>
              )
            ) : null}
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="text-sm font-semibold">Bill</h2>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  {booking.package.name} ({booking.sizeLabel})
                </dt>
                <dd className="tabular">{formatPesos(booking.totals.package)}</dd>
              </div>
              {booking.addons.map((addon) => (
                <div key={addon.id} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{addon.name}</dt>
                  <dd className="tabular">{formatPesos(addon.lineTotal)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-medium">
                <dt>Before VAT</dt>
                <dd className="tabular">{formatPesos(booking.totals.total)}</dd>
              </div>
            </dl>
            {booking.invoice ? (
              <p className="text-xs">
                Invoice{" "}
                <Link href={`/invoices/${booking.invoice.id}`} className="text-brand hover:underline">
                  {booking.invoice.number ?? "draft"}
                </Link>
                : {booking.invoice.status.replace("_", " ")}, {formatPesos(booking.invoice.balance)} due
              </p>
            ) : null}
            {booking.margin ? (
              <p className="text-2xs text-subtle-foreground">
                Materials used {formatPesos(booking.margin.materialsCost)}; margin {formatPesos(booking.margin.margin)}
                {booking.margin.marginPct ? ` (${booking.margin.marginPct}%)` : ""}.
              </p>
            ) : null}
            {booking.next.canCheckOut ? (
              books && can("billing:manage") ? (
                <Button variant="primary" className="w-full" onClick={() => setCheckoutOpen(true)}>
                  <Banknote />
                  Check out at the counter
                </Button>
              ) : (
                <DeniedAction reason={reason(books ? "billing:manage" : "detailing:book")}>
                  <Button variant="primary" className="w-full">
                    Check out at the counter
                  </Button>
                </DeniedAction>
              )
            ) : booking.status === "completed" && booking.qc.status !== "passed" && !booking.invoice ? (
              <p className="text-2xs text-subtle-foreground">Sign the job off to bill it.</p>
            ) : null}
            {booking.prepaid ? (
              <p className="text-xs">
                Settled with a prepaid credit of {booking.prepaid.planName} ({booking.prepaid.reference}), worth {formatPesos(booking.prepaid.amount)}. Nothing to invoice.
              </p>
            ) : null}
            <RedeemCredit bookingId={booking.id} accountId={booking.customerAccountId} packageId={booking.package.id} canRedeem={booking.next.canRedeem} />
          </section>
        </aside>
      </div>

      <Dialog open={prompt !== null} onOpenChange={(openNow) => !openNow && setPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {prompt?.kind === "cancel" ? "Cancel this booking" : prompt?.kind === "no_show" ? "Mark as no-show" : prompt?.kind === "override" ? "Start without an inspection" : "Send the job back"}
            </DialogTitle>
            <DialogDescription>
              {prompt?.kind === "override"
                ? "No check-in inspection is recorded for this vehicle. Give the reason to start anyway; it is kept on the job card."
                : prompt?.kind === "qc_fail"
                  ? "Say what is wrong. Re-open the job when the detailer is ready to redo it."
                  : "The reason is kept in the booking's history."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="prompt-text">Reason</Label>
            <Textarea id="prompt-text" rows={3} value={promptText} onChange={(event) => setPromptText(event.target.value)} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPrompt(null)}>
              Back
            </Button>
            <Button variant="primary" disabled={busy || ((prompt?.kind === "override" || prompt?.kind === "qc_fail") && promptText.trim() === "")} onClick={() => void confirmPrompt()}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {checkoutOpen ? <CheckoutDialog booking={booking} onClose={() => setCheckoutOpen(false)} /> : null}
    </>
  );
}

/** Invoice and payment in one action. The idempotency key is minted when the dialog opens and reused on a retry. */
function CheckoutDialog({ booking, onClose }: { booking: DetailingBooking; onClose: () => void }) {
  const actions = useDetailingActions();
  const [key] = React.useState(() => newIdempotencyKey());
  const [method, setMethod] = React.useState("cash");
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ invoiceId: string; invoiceNumber: string; paymentNumber: string | null } | null>(null);

  async function pay() {
    setBusy(true);
    setFailure(null);
    const result = await actions.checkout(booking.id, { method, referenceNo: reference }, key);
    setBusy(false);
    if (result.ok) setDone(result.data);
    else setFailure(result.fields?.reference_no?.[0] ?? result.error);
  }

  return (
    <Dialog open onOpenChange={(openNow) => !openNow && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? "Paid" : "Counter checkout"}</DialogTitle>
          <DialogDescription>
            {done
              ? `Invoice ${done.invoiceNumber} is issued and paid${done.paymentNumber ? ` (receipt ${done.paymentNumber})` : ""}.`
              : "Issues the invoice for this job and records the payment against it, in one step. The amount is the invoice total, VAT included, as the server computes it."}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <DialogFooter>
            <Button asChild>
              <Link href={`/invoices/${done.invoiceId}`}>Open the invoice</Link>
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        ) : (
          <>
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">Paid by</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="pay-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {method !== "cash" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="pay-ref">Reference number</Label>
                  <Input id="pay-ref" value={reference} onChange={(event) => setReference(event.target.value)} />
                </div>
              ) : null}
              {failure ? (
                <p role="alert" className="text-xs text-critical">
                  {failure}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Back
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void pay()}>
                <Banknote />
                {busy ? "Taking payment…" : "Issue and take payment"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
