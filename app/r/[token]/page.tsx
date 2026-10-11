"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { LinkNotFound, PublicShell } from "@/components/crm/public-shell";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/errors";
import { fetchReminderLink, requestBookingFromReminder } from "@/lib/crm-public";
import type { ReminderLink } from "@/types/crm";

/**
 * The booking link inside a service reminder. No sign-in: the token in the
 * URL is the credential. Where the branch takes bookings online it sends the
 * customer there; otherwise it leaves a booking request the shop calls back on.
 */
export default function ReminderLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = React.useState<ReminderLink | null | "missing">(null);
  const [date, setDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchReminderLink(token).then(setView, () => setView("missing"));
  }, [token]);

  if (view === "missing") return <LinkNotFound />;
  if (view === null)
    return (
      <PublicShell shop={null}>
        <Skeleton className="h-40" />
      </PublicShell>
    );

  async function request() {
    setBusy(true);
    try {
      setView(await requestBookingFromReminder(token, date, note));
      setFailure(null);
    } catch (error) {
      setFailure(describeApiError(error));
    }
    setBusy(false);
  }

  return (
    <PublicShell shop={view.shop}>
      <div>
        <h1 className="text-lg font-semibold">{view.headline}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.customerName ? `Hi ${view.customerName}. ` : ""}
          {view.vehicle ? `This is about ${[view.vehicle.label, view.vehicle.plateNumber].filter(Boolean).join(" · ")}.` : ""}
        </p>
      </div>

      {view.requested ? (
        <p className="flex items-start gap-2 text-sm" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
          <span>
            We have your request. {view.shop} will contact you to confirm a time
            {view.shopPhone ? `, or call ${view.shopPhone}` : ""}.
          </span>
        </p>
      ) : view.booking.mode === "online" && view.booking.branchSlug ? (
        <Button asChild variant="primary" className="w-full">
          <Link href={`/book/${view.booking.branchSlug}`}>
            <CalendarCheck />
            Choose a time online
          </Link>
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-date">A day that suits you</Label>
            <Input id="r-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-note">Anything we should know</Label>
            <Textarea id="r-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => void request()}>
            <CalendarCheck />
            {busy ? "Sending…" : "Ask for a booking"}
          </Button>
          <p className="text-2xs text-subtle-foreground">The shop will get back to you to confirm the time{view.shopPhone ? `. You can also call ${view.shopPhone}` : ""}.</p>
        </div>
      )}
    </PublicShell>
  );
}
