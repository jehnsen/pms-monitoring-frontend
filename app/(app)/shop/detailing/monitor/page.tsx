"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { MonitorPlay, Radio, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MonitorBoard } from "@/components/detailing/monitor-board";
import { formatDay } from "@/components/detailing/booking-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { DETAILING_ROOT } from "@/lib/api/detailing";
import { useDetailingMonitor, useDetailingRealtime } from "@/lib/detailing";
import { useBookingChanges } from "@/lib/detailing-realtime";
import { manilaDateDaysAgo } from "@/lib/utils";

/**
 * The shop monitor for staff: the day's confirmed, on-going and completed
 * jobs. It refreshes when the API announces a booking change (or on a timer
 * where realtime is not set up); the wall screen shows the same board through
 * a display token (Detailing settings → Displays).
 */
export default function DetailingMonitorPage() {
  const [date, setDate] = React.useState(() => manilaDateDaysAgo(0));
  const { data, error, isSuccess, refetch, isFetching } = useDetailingMonitor(date);
  const realtime = useDetailingRealtime();
  const queryClient = useQueryClient();

  const refresh = React.useCallback(
    () => void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === DETAILING_ROOT }),
    [queryClient]
  );
  useBookingChanges(
    realtime.data,
    (socketId, channelName) => api<{ auth: string }>("/broadcasting/auth", { method: "POST", body: { socket_id: socketId, channel_name: channelName } }),
    refresh
  );

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader
        title="Shop monitor"
        description="Confirmed work for the day, as the wall screen shows it. Pending bookings appear once they are confirmed."
        actions={
          <Button asChild>
            <Link href="/shop/detailing/settings#displays">
              <MonitorPlay />
              Set up a wall screen
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value || manilaDateDaysAgo(0))} aria-label="Day" className="w-44" />
        <Button size="sm" variant="ghost" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw />
          Refresh
        </Button>
        {realtime.data ? (
          <Badge tone={realtime.data.enabled ? "ok" : "neutral"}>
            <Radio aria-hidden />
            {realtime.data.enabled ? "Live" : `Refreshes every ${realtime.data.pollSeconds}s`}
          </Badge>
        ) : null}
        {isSuccess ? (
          <p className="text-xs text-muted-foreground">
            {formatDay(data.date)}: <span className="tabular">{data.counts.upcoming}</span> upcoming, <span className="tabular">{data.counts.inProgress}</span> in progress,{" "}
            <span className="tabular">{data.counts.done}</span> done
          </p>
        ) : null}
      </div>

      {isSuccess ? <MonitorBoard monitor={data} /> : <Skeleton className="h-64" />}
    </>
  );
}
