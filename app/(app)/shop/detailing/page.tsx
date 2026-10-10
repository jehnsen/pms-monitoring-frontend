"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CalendarPlus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { BOOKING_STATUSES, BookingStatusBadge, bookingStatusLabel, formatDay } from "@/components/detailing/booking-status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookingPage } from "@/lib/detailing";
import { useCan } from "@/lib/rbac";
import { cn, formatPesos } from "@/lib/utils";
import type { BookingStatus } from "@/types/detailing";

/**
 * Detailing bookings: every booking of the branch and the door to its job
 * card. The counts on the filter row are the API's, under the same search.
 */
export default function DetailingBookingsPage() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [status, setStatus] = React.useState<BookingStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const q = React.useDeferredValue(search.trim());
  const { can, reason } = useCan();

  const { data, error, isSuccess, refetch } = useBookingPage({
    page,
    per_page: pageSize,
    ...(status === "all" ? {} : { status: [status] }),
    ...(q ? { q } : {}),
  });

  React.useEffect(() => setPage(1), [pageSize, status, q]);

  const newBooking = (
    <Button asChild variant="primary">
      <Link href="/shop/detailing/new">
        <CalendarPlus />
        New booking
      </Link>
    </Button>
  );

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every detailing booking of this branch. Open one for its job card: inspection, checklist, sign-off and bill."
        actions={can("detailing:book") ? newBooking : <DeniedAction reason={reason("detailing:book")}>{newBooking}</DeniedAction>}
      />

      {/* Filters sit in one row above everything they scope. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, customer, vehicle, phone" aria-label="Search bookings" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {(["all", ...BOOKING_STATUSES] as const).map((value) => {
            const count = !isSuccess ? null : value === "all" ? data.summary.total : data.summary.byStatus[value];
            return (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  status === value ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2"
                )}
              >
                {value === "all" ? "All" : bookingStatusLabel(value)}
                {count !== null ? <span className="tabular ml-1.5 text-subtle-foreground">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {isSuccess ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Today ({formatDay(data.summary.today.date)}): <span className="tabular">{data.summary.today.bookings}</span> booked,{" "}
          <span className="tabular">{data.summary.today.onTheFloor}</span> on the floor, <span className="tabular">{data.summary.today.pending}</span> waiting to be confirmed.
        </p>
      ) : null}

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarCheck} title="No bookings here" description="Nothing matches this filter yet." />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Booking</th>
                <th className="px-3 py-3 font-medium">Customer and vehicle</th>
                <th className="px-3 py-3 font-medium">Package</th>
                <th className="px-3 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Detailers</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map((booking) => (
                <tr key={booking.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3">
                    <Link href={`/shop/detailing/bookings/${booking.id}`} className="tabular font-medium text-brand hover:underline">
                      {booking.reference}
                    </Link>
                    <p className="text-2xs text-subtle-foreground">{booking.source === "public" ? "Online" : "Counter"}</p>
                  </td>
                  <td className="px-3 py-3">
                    {booking.customer.name}
                    <p className="text-2xs text-subtle-foreground">
                      {booking.vehicleLabel || "No vehicle noted"} · {booking.sizeLabel}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {booking.package.name}
                    <p className="text-2xs text-subtle-foreground">{booking.package.durationText}</p>
                  </td>
                  <td className="px-3 py-3">
                    {formatDay(booking.scheduledDate)}, {booking.startLabel}
                    <p className="text-2xs text-subtle-foreground">
                      {booking.finish.actual ? "Finished" : "Until"} {booking.finish.label ?? "—"}
                      {booking.spansDays ? ` on ${formatDay(booking.finish.date)}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {booking.detailers.length > 0 ? booking.detailers.map((d) => d.name).join(", ") : <span className="text-subtle-foreground">Not named</span>}
                    <p className="text-2xs text-subtle-foreground">
                      {booking.detailersCount} reserved{booking.bay ? ` · ${booking.bay.name}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <BookingStatusBadge status={booking.status} />
                    {booking.invoice ? <p className="mt-1 text-2xs text-subtle-foreground">Invoice {booking.invoice.number ?? "draft"}</p> : null}
                  </td>
                  <td className="tabular px-5 py-3 text-right">{formatPesos(booking.totals.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isSuccess ? (
        <Pagination
          page={data.meta.page}
          pageCount={Math.max(1, Math.ceil(data.meta.total / data.meta.per_page))}
          pageSize={data.meta.per_page}
          totalItems={data.meta.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </>
  );
}
