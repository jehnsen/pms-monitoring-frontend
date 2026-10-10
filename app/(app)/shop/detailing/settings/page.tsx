"use client";

import * as React from "react";
import { Copy, MonitorPlay, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useDetailingActions, useDetailingSettings, useDisplayTokens } from "@/lib/detailing";
import { useCan } from "@/lib/rbac";
import { formatManilaTime } from "@/lib/utils";
import type { DetailingSettings } from "@/types/detailing";

/**
 * Detailing settings for the branch: how many detailers the pool holds, when
 * the day closes, whether the vehicle is inspected before work, whether the
 * public may book online, how materials scale with vehicle size, and the
 * tokens of its wall screens. The API holds the rules (the pool cannot drop
 * below what is already booked); this page shows what it says.
 */
export default function DetailingSettingsPage() {
  const { data, error, isSuccess, refetch } = useDetailingSettings();
  const { can } = useCan();
  const manages = can("detailing:manage");

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader title="Detailing settings" description="This branch's detailer pool, closing time, online booking and wall screens." />
      {!isSuccess ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <SettingsForm key={JSON.stringify(data)} settings={data} manages={manages} />
          <Displays manages={manages} />
        </div>
      )}
    </>
  );
}

function SettingsForm({ settings, manages }: { settings: DetailingSettings; manages: boolean }) {
  const actions = useDetailingActions();
  const { reason } = useCan();
  const [pool, setPool] = React.useState(String(settings.detailerPoolSize));
  const [perBooking, setPerBooking] = React.useState(String(settings.defaultDetailersPerBooking));
  const [closing, setClosing] = React.useState(settings.closingTime);
  const [inspection, setInspection] = React.useState(settings.inspectionRequired);
  const [online, setOnline] = React.useState(settings.publicBookingEnabled);
  const [notice, setNotice] = React.useState(settings.publicBookingNotice);
  const [factors, setFactors] = React.useState(() => Object.fromEntries(settings.sizeMultipliers.map((row) => [row.sizeClass, row.factor])));
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const result = await actions.saveSettings({
      detailerPoolSize: Number(pool),
      defaultDetailersPerBooking: Number(perBooking),
      closingTime: closing,
      inspectionRequired: inspection,
      publicBookingEnabled: online,
      publicBookingNotice: notice,
      sizeMultipliers: factors,
    });
    setBusy(false);
    setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: Object.values(result.fields ?? {})[0]?.[0] ?? result.error });
  }

  const saveButton = (
    <Button variant="primary" disabled={busy} onClick={() => void save()}>
      <Save />
      {busy ? "Saving…" : "Save settings"}
    </Button>
  );

  return (
    <section className="card space-y-5 p-5">
      <h2 className="text-sm font-semibold">Booking rules</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pool">Detailer pool</Label>
          <Input id="pool" type="number" min={1} value={pool} onChange={(event) => setPool(event.target.value)} disabled={!manages} />
          <p className="text-2xs text-subtle-foreground">
            {settings.activeDetailers} active detailer{settings.activeDetailers === 1 ? "" : "s"} on the roster. Bookings already hold up to {settings.peakHeads} at once.
          </p>
          {manages && settings.activeDetailers > 0 && String(settings.activeDetailers) !== pool ? (
            <button type="button" className="text-2xs text-brand hover:underline" onClick={() => setPool(String(settings.activeDetailers))}>
              Match the roster ({settings.activeDetailers})
            </button>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="per-booking">Detailers per booking</Label>
          <Input id="per-booking" type="number" min={1} value={perBooking} onChange={(event) => setPerBooking(event.target.value)} disabled={!manages} />
          <p className="text-2xs text-subtle-foreground">Reserved by default when none is asked for.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="closing">Closing time</Label>
          <Input id="closing" type="time" step={1800} value={closing} onChange={(event) => setClosing(event.target.value)} disabled={!manages} />
          <p className="text-2xs text-subtle-foreground">Work that does not fit before this carries on the next morning.</p>
        </div>
      </div>

      <label className="flex items-start gap-3 text-xs">
        <input type="checkbox" checked={inspection} onChange={(event) => setInspection(event.target.checked)} disabled={!manages} className="mt-0.5 size-4 accent-[hsl(var(--brand))]" />
        <span>
          Inspect the vehicle before work starts
          <span className="block text-2xs text-subtle-foreground">A job cannot start without its check-in inspection, unless a reason is given.</span>
        </span>
      </label>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium">How much of a package&apos;s materials each size uses</legend>
        <div className="grid grid-cols-4 gap-2">
          {settings.sizeMultipliers.map((row) => (
            <div key={row.sizeClass} className="space-y-1">
              <Label htmlFor={`factor-${row.sizeClass}`} className="text-2xs text-subtle-foreground">
                {row.sizeLabel}
              </Label>
              <Input
                id={`factor-${row.sizeClass}`}
                type="number"
                min={0.1}
                max={10}
                step="0.05"
                value={factors[row.sizeClass] ?? row.factor}
                onChange={(event) => setFactors((current) => ({ ...current, [row.sizeClass]: event.target.value }))}
                disabled={!manages}
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-2xs text-subtle-foreground">A package lists what a medium vehicle uses; these factors scale it.</p>
      </fieldset>

      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-start gap-3 text-xs">
          <input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} disabled={!manages} className="mt-0.5 size-4 accent-[hsl(var(--brand))]" />
          <span>
            Let the public book online
            <span className="block text-2xs text-subtle-foreground">Online bookings arrive as pending, for you to confirm.</span>
          </span>
        </label>
        {!online ? (
          <div className="space-y-1.5">
            <Label htmlFor="notice">Notice shown on the booking page while it is off</Label>
            <Textarea id="notice" rows={2} value={notice} onChange={(event) => setNotice(event.target.value)} disabled={!manages} placeholder="Online booking is not available right now. Please call the shop." />
          </div>
        ) : null}
      </div>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-ok" : "text-xs text-critical"}>
          {message.text}
        </p>
      ) : null}
      {manages ? saveButton : <DeniedAction reason={reason("detailing:manage")}>{saveButton}</DeniedAction>}
    </section>
  );
}

function Displays({ manages }: { manages: boolean }) {
  const tokens = useDisplayTokens(manages);
  const actions = useDetailingActions();
  const { reason } = useCan();
  const [name, setName] = React.useState("");
  const [fresh, setFresh] = React.useState<{ name: string; url: string } | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  async function issue() {
    setFailure(null);
    const result = await actions.issueDisplayToken(name.trim());
    if (!result.ok) {
      setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
      return;
    }
    // The token rides in the URL's fragment, which browsers never send to a server.
    setFresh({ name: result.data.name, url: `${window.location.origin}/display/monitor#${result.data.token}` });
    setName("");
  }

  return (
    <section id="displays" className="card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <MonitorPlay className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Displays</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        A wall screen shows this branch&apos;s shop monitor without anyone signing in. Give each screen its own link; it can only read the monitor, and revoking it stops it at once.
      </p>

      {!manages ? (
        <DeniedAction reason={reason("detailing:manage")}>
          <Button>Add a screen</Button>
        </DeniedAction>
      ) : (
        <>
          <div className="flex gap-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Lobby TV" aria-label="Name of the screen" />
            <Button variant="primary" disabled={name.trim() === ""} onClick={() => void issue()}>
              Add a screen
            </Button>
          </div>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
          {fresh ? (
            <div role="status" className="space-y-2 rounded-md border border-brand/30 bg-brand-muted p-3 text-xs">
              <p className="font-medium">Open this link on “{fresh.name}”. It is shown only once.</p>
              <div className="flex gap-2">
                <Input readOnly value={fresh.url} aria-label="Display link" className="font-mono text-2xs" onFocus={(event) => event.target.select()} />
                <Button size="icon" aria-label="Copy the link" onClick={() => void navigator.clipboard.writeText(fresh.url)}>
                  <Copy />
                </Button>
              </div>
            </div>
          ) : null}

          {tokens.error ? (
            <QueryError error={tokens.error} onRetry={() => void tokens.refetch()} />
          ) : !tokens.data ? (
            <Skeleton className="h-20" />
          ) : tokens.data.length === 0 ? (
            <p className="text-xs text-subtle-foreground">No screens yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {tokens.data.map((token) => (
                <li key={token.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {token.name} <span className="font-mono text-2xs text-subtle-foreground">…{token.tokenHint}</span>
                    </p>
                    <p className="text-2xs text-subtle-foreground">
                      {token.isActive
                        ? token.lastUsedAt
                          ? `Last seen ${formatManilaTime(token.lastUsedAt)}`
                          : "Not opened yet"
                        : `Revoked by ${token.revokedByName}${token.revokedAt ? `, ${formatManilaTime(token.revokedAt)}` : ""}`}
                    </p>
                  </div>
                  {token.isActive ? (
                    <Button size="sm" variant="ghost" onClick={() => void actions.revokeDisplayToken(token.id)}>
                      Revoke
                    </Button>
                  ) : (
                    <Badge tone="outline">Revoked</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
