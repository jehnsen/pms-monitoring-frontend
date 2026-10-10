"use client";

import { useEffect, useRef } from "react";
import type { RealtimeConfig } from "@/types/detailing";

/**
 * Listens for booking changes on a branch's private channel (Laravel Reverb
 * through Echo) and calls `onChange`; the screen then reads the API again,
 * which decides what it may see. The event carries ids only.
 *
 * When the API says realtime is not enabled, or the socket cannot be opened,
 * it falls back to calling `onChange` every `pollSeconds`.
 *
 * `authorize` signs this socket onto the channel: staff through their
 * session, a wall screen through its display token.
 */
export function useBookingChanges(
  config: RealtimeConfig | null | undefined,
  authorize: (socketId: string, channelName: string) => Promise<{ auth: string }>,
  onChange: () => void
) {
  const changed = useRef(onChange);
  const sign = useRef(authorize);
  changed.current = onChange;
  sign.current = authorize;

  const enabled = config?.enabled ?? false;
  const key = config?.key ?? null;
  const host = config?.host ?? null;
  const port = config?.port ?? null;
  const scheme = config?.scheme ?? null;
  const channel = config?.channel ?? null;
  const event = config?.event ?? null;
  const pollSeconds = config?.pollSeconds ?? 20;

  useEffect(() => {
    if (!channel) return;

    let closed = false;
    let leave: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = () => {
      if (!timer) timer = setInterval(() => changed.current(), Math.max(5, pollSeconds) * 1000);
    };

    if (!enabled || !key || !host || !event) {
      poll();
    } else {
      void (async () => {
        try {
          const [{ default: Echo }, { default: Pusher }] = await Promise.all([import("laravel-echo"), import("pusher-js")]);
          if (closed) return;
          const secure = scheme !== "http";
          const echo = new Echo({
            broadcaster: "reverb",
            Pusher,
            key,
            wsHost: host,
            wsPort: port ?? 80,
            wssPort: port ?? 443,
            forceTLS: secure,
            enabledTransports: ["ws", "wss"],
            authorizer: (target: { name: string }) => ({
              authorize: (socketId: string, callback: (error: Error | null, data: { auth: string } | null) => void) => {
                sign
                  .current(socketId, target.name)
                  .then((data) => callback(null, data))
                  .catch((error: unknown) => callback(error instanceof Error ? error : new Error("Not authorised"), null));
              },
            }),
          });
          // Laravel adds "private-" itself.
          const name = channel.replace(/^private-/, "");
          echo.private(name).listen(event, () => changed.current()).error(() => poll());
          leave = () => {
            echo.leave(name);
            echo.disconnect();
          };
          // A screen that was asleep may have missed events: catch up on reconnect.
          echo.connector.pusher.connection.bind("connected", () => changed.current());
        } catch {
          poll();
        }
      })();
    }

    return () => {
      closed = true;
      if (timer) clearInterval(timer);
      leave?.();
    };
  }, [enabled, key, host, port, scheme, channel, event, pollSeconds]);
}
