"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BranchTheme } from "@/components/detailing/branch-theme";
import { formatDay } from "@/components/detailing/booking-status";
import { MonitorBoard } from "@/components/detailing/monitor-board";
import { isApiError } from "@/lib/api/errors";
import { authorizeDisplaySocket, fetchDisplay } from "@/lib/detailing-public";
import { useBookingChanges } from "@/lib/detailing-realtime";

const STORAGE_KEY = "torquelane.display-token";

/**
 * The shop monitor on a wall screen. Nobody signs in: the link made under
 * Detailing settings → Displays carries a display token in its fragment (the
 * part after #, which a browser never sends to a server). It is kept on this
 * device and taken out of the address bar. The token reads one branch's
 * monitor and nothing else; once revoked, the screen says so.
 */
export default function DisplayMonitorPage() {
  const [token, setToken] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const fromLink = window.location.hash.replace(/^#/, "");
    if (fromLink) {
      window.localStorage.setItem(STORAGE_KEY, fromLink);
      window.history.replaceState(null, "", window.location.pathname);
    }
    setToken(fromLink || window.localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  const view = useQuery({
    queryKey: ["display-monitor", token],
    queryFn: () => fetchDisplay(token as string),
    enabled: Boolean(token),
    retry: (count, error) => !(isApiError(error) && error.status === 401) && count < 3,
  });

  const refresh = React.useCallback(() => void queryClient.invalidateQueries({ queryKey: ["display-monitor"] }), [queryClient]);
  useBookingChanges(view.data?.realtime, (socketId, channelName) => authorizeDisplaySocket(token as string, socketId, channelName), refresh);

  // A clock, and a reload after midnight so the board turns to the new day.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const today = now ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now) : null;
  React.useEffect(() => {
    if (today && view.data && view.data.monitor.date !== today) refresh();
  }, [today, view.data, refresh]);

  if (!ready) return <div className="min-h-screen bg-page" />;

  const revoked = isApiError(view.error) && view.error.status === 401;
  if (!token || revoked) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page p-8 text-center">
        <h1 className="text-2xl font-semibold">{revoked ? "This screen has been disconnected" : "This screen is not set up yet"}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {revoked ? "Its display link was revoked. " : ""}Ask a manager to open Detailing settings → Displays, add a screen, and open the link it gives on this device.
        </p>
      </main>
    );
  }
  if (!view.data) return <div className="min-h-screen bg-page" aria-busy="true" />;

  const { branch, monitor, realtime } = view.data;
  return (
    <BranchTheme tokens={branch.themeTokens} className="p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand">Shop monitor</p>
          <h1 className="text-5xl font-semibold">{branch.name}</h1>
        </div>
        <div className="text-right">
          <p className="text-4xl font-semibold tabular-nums">{now ? now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : ""}</p>
          <p className="text-base text-muted-foreground">{formatDay(monitor.date)}</p>
        </div>
      </header>

      <p className="mb-6 text-lg text-muted-foreground">
        {monitor.counts.upcoming} upcoming · {monitor.counts.inProgress} in progress · {monitor.counts.done} done
      </p>
      <MonitorBoard monitor={monitor} large />

      <footer className="mt-8 flex items-center justify-between text-xs text-subtle-foreground">
        <span>{view.data.displayName}</span>
        <span>{view.isError ? "Connection lost. Showing the last update; retrying." : realtime.enabled ? "Live" : `Updates every ${realtime.pollSeconds} seconds`}</span>
      </footer>
    </BranchTheme>
  );
}
