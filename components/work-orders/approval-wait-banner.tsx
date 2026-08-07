"use client";

import * as React from "react";
import { parseISO } from "date-fns";
import { Hourglass } from "lucide-react";
import { businessHoursBetween } from "@/lib/approvals";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * How long a quotation has been sitting with the client.
 *
 * Counted in *working* hours, so a quote sent at 5pm on Friday does not read
 * as three days late on Monday morning — that would train people to ignore
 * the number. Ticks every minute; a wait measured in hours does not need a
 * second hand.
 */
export function ApprovalWaitBanner({
  since,
  slaHours,
}: {
  since: string;
  slaHours: number;
}) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const waited = businessHoursBetween(parseISO(since), now);
  const breached = waited > slaHours;

  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3",
        breached
          ? "border-critical/25 bg-critical/[0.06]"
          : "border-warning/35 bg-warning/[0.08]"
      )}
    >
      <Hourglass
        className={cn(
          "size-4 shrink-0",
          breached ? "text-critical" : "text-foreground"
        )}
      />
      <p className="text-xs font-semibold">
        <span className={breached ? "text-critical" : "text-foreground"}>
          Waiting on the client · {waited}h
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Sent {formatDate(since.slice(0, 10))}.{" "}
        {breached
          ? `Past the ${slaHours}-hour agreement — worth a phone call.`
          : `Working hours only. Agreement is ${slaHours} hours.`}
      </p>
    </div>
  );
}
