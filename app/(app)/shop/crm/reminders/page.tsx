"use client";

import * as React from "react";
import Link from "next/link";
import { BellRing, Play, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { clockToMinutes, minutesToClock, SKIP_REASON } from "@/lib/api/crm";
import { useCrmActions, useCrmSettings, useReminderRules, useTemplates } from "@/lib/crm";
import { useCan } from "@/lib/rbac";
import type { ReminderRuleRow } from "@/types/crm";

const ABOUT: Record<string, string> = {
  pms_due: "A vehicle with maintenance due soon or overdue. One reminder per vehicle, naming what is due.",
  document_expiry: "A registration, insurance or other dated document about to lapse, or lapsed in the last 30 days.",
  detailing_repeat: "A detailing package that is due again (its repeat interval has passed) with nothing booked.",
  lapsed_customer: "A customer served before but not for a long while, with nothing booked and no other reminder going out.",
};

/**
 * Reminder rules and the settings every message is held to. The API builds
 * the reminders each morning; "Run now" does the same run on demand and says
 * what it queued and what it held back, and why.
 */
export default function ReminderRulesPage() {
  const rules = useReminderRules();
  const settings = useCrmSettings();
  const templates = useTemplates();
  const actions = useCrmActions();
  const { can, reason } = useCan();
  const manages = can("crm:manage");
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string | boolean>>({});

  const error = rules.error ?? settings.error ?? templates.error;
  if (error) return <QueryError error={error} onRetry={() => void Promise.all([rules.refetch(), settings.refetch(), templates.refetch()])} />;
  if (!rules.data || !settings.data || !templates.data) return <Skeleton className="h-96" />;

  const current = settings.data;
  const reminderTemplates = templates.data.data.filter((template) => template.purpose === "service_reminder" && template.isActive);
  const gate = (node: React.ReactElement) => (manages ? node : <DeniedAction reason={reason("crm:manage")}>{node}</DeniedAction>);
  const value = <K extends string>(key: K, fallback: string | boolean) => (key in draft ? draft[key] : fallback);

  async function saveRule(row: ReminderRuleRow, change: { templateId?: string; enabled?: boolean; leadDays?: number }) {
    const templateId = change.templateId ?? row.rule?.templateId;
    if (!templateId) return;
    const result = await actions.saveRule(row.kind, { templateId, enabled: change.enabled ?? row.rule?.enabled ?? true, leadDays: row.hasLeadDays ? (change.leadDays ?? row.rule?.leadDays ?? 30) : null });
    setMessage(result.ok ? null : { ok: false, text: result.error });
  }

  async function run() {
    setRunning(true);
    const result = await actions.runReminders();
    setRunning(false);
    if (!result.ok) return setMessage({ ok: false, text: result.error });
    const held = Object.entries(result.data.skipped).map(([why, count]) => `${count} ${SKIP_REASON[why]?.toLowerCase() ?? why}`);
    setMessage({ ok: true, text: `${result.data.queued} queued of ${result.data.candidates} worth sending${held.length ? `; held back: ${held.join(", ")}` : ""}.` });
  }

  async function saveSettings() {
    const body: Record<string, number | boolean> = {};
    if ("quietStart" in draft) body.quiet_start_minutes = clockToMinutes(String(draft.quietStart));
    if ("quietEnd" in draft) body.quiet_end_minutes = clockToMinutes(String(draft.quietEnd));
    for (const [key, field] of [["cooldown", "reminder_cooldown_days"], ["lapsed", "lapsed_after_days"], ["hourly", "campaign_hourly_limit"], ["perPoint", "loyalty_cents_per_point"]] as const) {
      if (key in draft && String(draft[key]).trim() !== "") body[field] = key === "perPoint" ? Math.round(Number(draft[key]) * 100) : Number(draft[key]);
    }
    if ("feedback" in draft) body.feedback_enabled = Boolean(draft.feedback);
    if ("loyalty" in draft) body.loyalty_enabled = Boolean(draft.loyalty);
    const result = await actions.saveSettings(body);
    setMessage(result.ok ? { ok: true, text: "Settings saved." } : { ok: false, text: Object.values(result.fields ?? {})[0]?.[0] ?? result.error });
    if (result.ok) setDraft({});
  }

  const number = (key: string, label: string, fallback: number, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`set-${key}`}>{label}</Label>
      <Input id={`set-${key}`} type="number" min={1} disabled={!manages} value={String(value(key, String(fallback)))} onChange={(event) => setDraft((c) => ({ ...c, [key]: event.target.value }))} />
      <p className="text-2xs text-subtle-foreground">{hint}</p>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Reminder rules"
        description="What the shop reminds customers about, and the limits every message keeps to. A reminder goes only to a customer who agreed to service reminders."
        actions={gate(
          <Button variant="primary" disabled={running} onClick={() => void run()}>
            <Play />
            {running ? "Building…" : "Run now"}
          </Button>
        )}
      />
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`mb-4 text-xs ${message.ok ? "text-ok" : "text-critical"}`}>
          {message.text}
        </p>
      ) : null}

      <section className="card mb-6 divide-y divide-border">
        {rules.data.map((row) => (
          <div key={row.kind} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_16rem_8rem_auto] md:items-end">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BellRing className="size-4 text-subtle-foreground" aria-hidden />
                {row.label}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{ABOUT[row.kind]}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`rule-${row.kind}`}>Template</Label>
              <Select value={row.rule?.templateId ?? ""} disabled={!manages} onValueChange={(templateId) => void saveRule(row, { templateId })}>
                <SelectTrigger id={`rule-${row.kind}`}>
                  <SelectValue placeholder="Pick a template" />
                </SelectTrigger>
                <SelectContent>
                  {reminderTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.channelLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              {row.hasLeadDays ? (
                <>
                  <Label htmlFor={`lead-${row.kind}`}>Days ahead</Label>
                  <Input id={`lead-${row.kind}`} type="number" min={1} max={365} disabled={!manages || !row.rule} defaultValue={row.rule?.leadDays ?? 30} onBlur={(event) => Number(event.target.value) !== row.rule?.leadDays && void saveRule(row, { leadDays: Number(event.target.value) })} />
                </>
              ) : null}
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs">
              <input type="checkbox" className="size-4 accent-[hsl(var(--brand))]" disabled={!manages || !row.rule} checked={row.rule?.enabled ?? false} onChange={(event) => void saveRule(row, { enabled: event.target.checked })} />
              {row.rule ? (row.rule.enabled ? "On" : "Off") : "Not set up"}
            </label>
          </div>
        ))}
      </section>
      <p className="-mt-3 mb-6 text-2xs text-subtle-foreground">
        Wording lives under{" "}
        <Link href="/shop/crm/templates" className="text-brand hover:underline">
          Templates
        </Link>
        ; what went out, and what did not, under the{" "}
        <Link href="/shop/crm/messages" className="text-brand hover:underline">
          Message log
        </Link>
        .
      </p>

      <section className="card space-y-5 p-5">
        <h2 className="text-sm font-semibold">Limits every message keeps to</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="set-quiet-start">Quiet hours (Manila time)</Label>
            <div className="flex items-center gap-2">
              <Input id="set-quiet-start" type="time" disabled={!manages} value={String(value("quietStart", minutesToClock(current.quietStartMinutes)))} onChange={(event) => setDraft((c) => ({ ...c, quietStart: event.target.value }))} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input aria-label="Quiet hours end" type="time" disabled={!manages} value={String(value("quietEnd", minutesToClock(current.quietEndMinutes)))} onChange={(event) => setDraft((c) => ({ ...c, quietEnd: event.target.value }))} />
            </div>
            <p className="text-2xs text-subtle-foreground">A message due in these hours waits until they end; it is never dropped.</p>
          </div>
          {number("cooldown", "Do not repeat a reminder for (days)", current.reminderCooldownDays, "The same reminder about the same thing.")}
          {number("lapsed", "A customer has lapsed after (days)", current.lapsedAfterDays, "Without a finished job or booking.")}
          {number("hourly", "Campaign messages per hour", current.campaignHourlyLimit, "A campaign may set a lower limit of its own.")}
          {number("perPoint", "Pesos paid per loyalty point", current.loyaltyCentsPerPoint / 100, "Only counted while points are on.")}
          <div className="space-y-3 pt-1">
            <label className="flex items-center gap-3 text-xs">
              <input type="checkbox" className="size-4 accent-[hsl(var(--brand))]" disabled={!manages} checked={Boolean(value("feedback", current.feedbackEnabled))} onChange={(event) => setDraft((c) => ({ ...c, feedback: event.target.checked }))} />
              Ask for a 0–10 score when an invoice is paid in full
            </label>
            <label className="flex items-center gap-3 text-xs">
              <input type="checkbox" className="size-4 accent-[hsl(var(--brand))]" disabled={!manages} checked={Boolean(value("loyalty", current.loyaltyEnabled))} onChange={(event) => setDraft((c) => ({ ...c, loyalty: event.target.checked }))} />
              Loyalty points on payments
            </label>
          </div>
        </div>
        {gate(
          <Button disabled={Object.keys(draft).length === 0} onClick={() => void saveSettings()}>
            <Save />
            Save settings
          </Button>
        )}
      </section>
    </>
  );
}
