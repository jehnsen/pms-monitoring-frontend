"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { BranchTheme } from "@/components/detailing/branch-theme";
import { BookingStatusBadge, formatDay } from "@/components/detailing/booking-status";
import { fetchPublicConfirmation } from "@/lib/detailing-public";
import { formatPesos } from "@/lib/utils";

/** A booking's confirmation page, opened from the link in the customer's email. */
export default function BookingConfirmationPage() {
  const { branchSlug, token } = useParams<{ branchSlug: string; token: string }>();
  const { data, error, isPending } = useQuery({ queryKey: ["public-booking", token], queryFn: () => fetchPublicConfirmation(token), retry: false });

  if (isPending) return <div className="min-h-screen bg-page" aria-busy="true" />;
  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">We could not find that booking</h1>
        <p className="text-sm text-muted-foreground">The link may be incomplete. Open it again from the email we sent you.</p>
        <Link href={`/book/${branchSlug}`} className="text-sm text-brand hover:underline">
          Back to booking
        </Link>
      </main>
    );
  }

  const { branch, booking } = data;
  return (
    <BranchTheme tokens={branch.themeTokens}>
      <main className="mx-auto max-w-xl px-5 py-14">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-brand">{branch.name}</p>
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-10 text-brand" aria-hidden />
          <h1 className="text-4xl font-semibold">{booking.status === "pending" ? "We received your request." : "Your booking"}</h1>
          <BookingStatusBadge status={booking.status} size="md" />
          {booking.status === "pending" ? <p className="text-sm text-muted-foreground">It is not confirmed yet. We will email you once our team has confirmed your slot.</p> : null}
        </div>

        <dl className="mt-8 divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {[
            ["Reference", booking.reference],
            ["Name", booking.customerName],
            ["Vehicle", booking.vehicleLabel || "—"],
            ["Package", `${booking.packageName} (${booking.sizeLabel})`],
            ["Date", formatDay(booking.scheduledDate)],
            ["Time", booking.days.map((day) => `${booking.days.length > 1 ? `${formatDay(day.date)} ` : ""}${day.fromLabel} – ${day.toLabel}`).join(", then ") || booking.startLabel],
            ["Package price", `${formatPesos(booking.price)} (VAT is added on the invoice)`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-5 py-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>
        {branch.contactPhone ? <p className="mt-6 text-center text-xs text-muted-foreground">Need to change something? Call us on {branch.contactPhone}.</p> : null}
      </main>
    </BranchTheme>
  );
}
