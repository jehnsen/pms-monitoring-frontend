"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, Unlock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { formatDay } from "@/components/detailing/booking-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useDetailingActions, useDetailingSchedule } from "@/lib/detailing";
import { useCan } from "@/lib/rbac";
import { cn, manilaDateDaysAgo } from "@/lib/utils";
import type { DetailingBooking, ScheduleView } from "@/types/detailing";

type Lane = { id: string; name: string };

function shift(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The booking's unreleased slots on a day, as the API lists them. */
function slotsOn(booking: DetailingBooking, date: string) {
  return booking.days.find((day) => day.date === date)?.slots.filter((slot) => !slot.released).map((slot) => slot.slot) ?? [];
}

/**
 * The day's schedule, by bay or by detailer. Every block, every blocked slot
 * and every "free" count is the API's; the page only lays them on the grid.
 * A job with no bay (or no detailer named) sits in the "Not assigned" lane.
 */
export default function DetailingSchedulePage() {
  const [date, setDate] = React.useState(() => manilaDateDaysAgo(0));
  const [by, setBy] = React.useState<"bay" | "detailer">("bay");
  const { data, error, isSuccess, refetch } = useDetailingSchedule(date, date);
  const actions = useDetailingActions();
  const { can } = useCan();
  const manages = can("detailing:manage");

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader title="Schedule" description="Confirmed and pending detailing work for a day, laid out by bay or by detailer, with what the pool has left in each half hour." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="secondary" aria-label="Previous day" onClick={() => setDate((d) => shift(d, -1))}>
          <ChevronLeft />
        </Button>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value || manilaDateDaysAgo(0))} aria-label="Day" className="w-44" />
        <Button size="icon-sm" variant="secondary" aria-label="Next day" onClick={() => setDate((d) => shift(d, 1))}>
          <ChevronRight />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDate(manilaDateDaysAgo(0))}>
          Today
        </Button>
        <div className="ml-auto flex rounded-md border border-border p-0.5" role="group" aria-label="Lay out by">
          {(["bay", "detailer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={by === value}
              onClick={() => setBy(value)}
              className={cn("rounded px-3 py-1 text-xs capitalize", by === value ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-surface-2")}
            >
              By {value}
            </button>
          ))}
        </div>
      </div>

      {!isSuccess ? (
        <Skeleton className="h-96" />
      ) : (
        <ScheduleGrid
          view={data}
          date={date}
          by={by}
          onToggleBlock={
            manages
              ? (slot, blockedId) => void (blockedId ? actions.unblockSlot(blockedId) : actions.blockSlots(date, [slot]))
              : undefined
          }
        />
      )}
    </>
  );
}

function ScheduleGrid({ view, date, by, onToggleBlock }: { view: ScheduleView; date: string; by: "bay" | "detailer"; onToggleBlock?: (slot: number, blockedId: string | null) => void }) {
  const lanes: Lane[] = [...(by === "bay" ? view.bays : view.detailers), { id: "none", name: "Not assigned" }];
  const day = view.days.find((d) => d.date === date);
  const blocked = new Map(view.blocked.filter((b) => b.date === date).map((b) => [b.slot, b]));
  const onDay = view.bookings.filter((booking) => booking.status !== "cancelled" && booking.status !== "no_show" && slotsOn(booking, date).length > 0);

  const laneOf = (booking: DetailingBooking): string[] => {
    if (by === "bay") return [booking.bay?.id ?? "none"];
    return booking.detailers.length > 0 ? booking.detailers.map((d) => d.id) : ["none"];
  };

  return (
    <section className="card-raised overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <caption className="sr-only">
          Detailing schedule for {formatDay(date)} by {by}
        </caption>
        <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
          <tr>
            <th scope="col" className="w-24 px-4 py-3 font-medium">
              Time
            </th>
            <th scope="col" className="w-24 px-2 py-3 font-medium">
              Free of {view.pool}
            </th>
            {lanes.map((lane) => (
              <th key={lane.id} scope="col" className="min-w-36 px-2 py-3 font-medium">
                {lane.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.grid.map((slot) => {
            const held = day?.slots.find((s) => s.slot === slot.slot);
            const block = blocked.get(slot.slot) ?? null;
            return (
              <tr key={slot.slot} className={cn("border-b border-border/60", slot.afterClosing && "bg-surface-2/50")}>
                <th scope="row" className="tabular px-4 py-1.5 font-normal text-muted-foreground">
                  {slot.label}
                  {slot.afterClosing ? <span className="block text-2xs text-subtle-foreground">after closing</span> : null}
                </th>
                <td className="px-2 py-1.5">
                  <span className={cn("tabular", (held?.remaining ?? view.pool) <= 0 && "font-medium text-critical")}>{held?.remaining ?? view.pool}</span>
                  {onToggleBlock ? (
                    <button
                      type="button"
                      onClick={() => onToggleBlock(slot.slot, block?.id ?? null)}
                      aria-label={block ? `Unblock ${slot.label}` : `Block ${slot.label}`}
                      title={block ? `Blocked: ${block.label}. Click to unblock.` : "Block this slot for new bookings"}
                      className={cn("ml-2 rounded p-1 align-middle", block ? "text-critical hover:bg-critical/10" : "text-subtle-foreground hover:bg-surface-2")}
                    >
                      {block ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                    </button>
                  ) : block ? (
                    <Lock className="ml-2 inline size-3.5 text-critical" aria-label={`Blocked: ${block.label}`} />
                  ) : null}
                </td>
                {lanes.map((lane) => {
                  const here = onDay.filter((booking) => laneOf(booking).includes(lane.id) && slotsOn(booking, date).includes(slot.slot));
                  return (
                    <td key={lane.id} className="px-1 py-1 align-top">
                      {here.map((booking) => {
                        const first = slotsOn(booking, date)[0] === slot.slot;
                        return (
                          <Link
                            key={booking.id}
                            href={`/shop/detailing/bookings/${booking.id}`}
                            className={cn(
                              "mb-0.5 block rounded px-2 py-1",
                              booking.status === "pending" ? "border border-dashed border-border-strong bg-surface text-muted-foreground" : "bg-brand-muted text-brand",
                              booking.status === "completed" && "bg-ok/10 text-ok"
                            )}
                          >
                            {first ? (
                              <>
                                <span className="block truncate font-medium">{booking.vehicleLabel || booking.customer.name}</span>
                                <span className="block truncate text-2xs">
                                  {booking.package.name} · {booking.statusLabel}
                                </span>
                              </>
                            ) : (
                              <span className="block truncate text-2xs opacity-70">{booking.reference}</span>
                            )}
                          </Link>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
