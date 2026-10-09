"use client";

import { Hourglass } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * How long a quotation has been sitting with the client.
 *
 * Counted in *working* hours, so a quote sent at 5pm on Friday does not read
 * as three days late on Monday morning — that would train people to ignore
 * the number. The wait and the breach are the API's (`approval.waiting_hours`,
 * `approval.sla_breached`), as of the last read.
 */
export function ApprovalWaitBanner({
  since,
  waited,
  slaHours,
  breached,
}: {
  since: string;
  waited: number;
  slaHours: number;
  breached: boolean;
}) {
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
