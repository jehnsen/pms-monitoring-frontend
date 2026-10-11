"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Handshake, Plus, Target, Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { TaskDialog } from "@/components/crm/task-dialog";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatDay } from "@/components/detailing/booking-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { pesos } from "@/lib/api/crm";
import { useCrmActions, usePipeline } from "@/lib/crm";
import { useCan } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import type { CrmLead } from "@/types/crm";

/**
 * The B2B pipeline: leads by stage. A lead moves between the open stages
 * freely; losing one asks why; winning one is a conversion into a company
 * account with its terms. Counts and values per stage are the API's.
 */
export default function PipelinePage() {
  const [mine, setMine] = React.useState(false);
  const { data, error, refetch } = usePipeline(mine);
  const actions = useCrmActions();
  const { can, reason } = useCan();
  const works = can("crm:work");
  const [adding, setAdding] = React.useState(false);
  const [winning, setWinning] = React.useState<CrmLead | null>(null);
  const [losing, setLosing] = React.useState<CrmLead | null>(null);
  const [tasking, setTasking] = React.useState<CrmLead | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  const add = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      <Plus />
      Add a lead
    </Button>
  );
  const open = data?.stages.filter((stage) => stage.open) ?? [];
  const closed = data?.stages.filter((stage) => !stage.open) ?? [];

  async function move(lead: CrmLead, stage: string) {
    if (stage === "won") return setWinning(lead);
    if (stage === "lost") return setLosing(lead);
    const result = await actions.moveLead(lead.id, stage);
    setFailure(result.ok ? null : result.error);
  }

  return (
    <>
      <PageHeader title="Pipeline" description="Companies you are trying to win, by stage. A won lead becomes a customer account with its terms." actions={works ? add : <DeniedAction reason={reason("crm:work")}>{add}</DeniedAction>} />

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Open leads" value={String(data.summary.open)} icon={Target} hint={`${pesos(data.summary.openValueCents)} in play`} />
            <StatTile label="Won" value={String(data.summary.won)} icon={Trophy} tone="ok" hint={pesos(data.summary.wonValueCents)} />
            <StatTile label="Lost" value={String(data.summary.lost)} icon={AlertTriangle} />
          </div>

          <div className="mb-4 flex items-center gap-2">
            <button type="button" aria-pressed={mine} onClick={() => setMine((current) => !current)} className={cn("rounded-full border px-3 py-1 text-xs transition-colors", mine ? "border-brand bg-brand-muted text-brand" : "border-border bg-surface text-muted-foreground hover:bg-surface-2")}>
              My leads
            </button>
            {failure ? (
              <p role="alert" className="text-xs text-critical">
                {failure}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {open.map((stage) => (
              <section key={stage.value} aria-label={stage.label} className="card flex flex-col p-3">
                <header className="mb-3 flex items-baseline justify-between px-1">
                  <h2 className="text-xs font-semibold">
                    {stage.label} <span className="font-normal text-subtle-foreground">{stage.count}</span>
                  </h2>
                  <span className="tabular text-2xs text-subtle-foreground">{pesos(stage.valueCents)}</span>
                </header>
                <ul className="space-y-2">
                  {stage.leads.map((lead) => (
                    <li key={lead.id} className="rounded-md border border-border bg-surface p-3 text-xs">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        {lead.companyName}
                        {lead.isDealer ? <Badge tone="brand">Dealer</Badge> : null}
                      </p>
                      <p className="tabular text-muted-foreground">{pesos(lead.valueCents)}</p>
                      <p className="mt-1 text-2xs text-subtle-foreground">{[lead.contactName, lead.ownerName ? `owner: ${lead.ownerName}` : null].filter(Boolean).join(" · ")}</p>
                      {lead.nextStep ? (
                        <p className={cn("mt-1 text-2xs", lead.nextStepOverdue ? "text-critical" : "text-muted-foreground")}>
                          Next: {lead.nextStep}
                          {lead.nextStepOn ? ` (${formatDay(lead.nextStepOn)}${lead.nextStepOverdue ? ", overdue" : ""})` : ""}
                        </p>
                      ) : null}
                      {works ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Select value={lead.stage} onValueChange={(to) => void move(lead, to)}>
                            <SelectTrigger aria-label={`Move ${lead.companyName} to`} className="h-7 text-2xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {data.stages.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.value === "won" ? "Won: convert…" : option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="ghost" onClick={() => setTasking(lead)}>
                            Task
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                  {stage.leads.length === 0 ? <li className="px-1 text-2xs text-subtle-foreground">Nothing here.</li> : null}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {closed.map((stage) => (
              <section key={stage.value} className="card p-5">
                <h2 className="mb-3 text-sm font-semibold">
                  {stage.label} <span className="font-normal text-subtle-foreground">{stage.count}</span>
                </h2>
                <ul className="space-y-2 text-xs">
                  {stage.leads.map((lead) => (
                    <li key={lead.id} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {lead.customerAccountId ? (
                            <Link href={`/shop/crm/customers/${lead.customerAccountId}`} className="text-brand hover:underline">
                              {lead.companyName}
                            </Link>
                          ) : (
                            lead.companyName
                          )}
                        </p>
                        {lead.lostReason ? <p className="text-2xs text-subtle-foreground">{lead.lostReason}</p> : null}
                      </div>
                      <span className="flex items-center gap-2">
                        <span className="tabular text-muted-foreground">{pesos(lead.valueCents)}</span>
                        {works && stage.value === "lost" ? (
                          <Button size="sm" variant="ghost" onClick={() => void move(lead, "new")}>
                            Re-open
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                  {stage.leads.length === 0 ? <li className="text-muted-foreground">None yet.</li> : null}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {adding ? <LeadDialog onClose={() => setAdding(false)} /> : null}
      {winning ? <ConvertDialog lead={winning} onClose={() => setWinning(null)} /> : null}
      {losing ? <LostDialog lead={losing} onClose={() => setLosing(null)} /> : null}
      {tasking ? <TaskDialog task={null} subject={{ leadId: tasking.id, name: tasking.companyName }} onClose={() => setTasking(null)} /> : null}
    </>
  );
}

function useSubmit(onClose: () => void) {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const submit = async (fn: () => Promise<{ ok: boolean; error?: string; fields?: Record<string, string[]> }>) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error ?? "That did not work.");
  };
  return { busy, failure, submit };
}

function Failure({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="text-xs text-critical">
      {text}
    </p>
  ) : null;
}

function LeadDialog({ onClose }: { onClose: () => void }) {
  const actions = useCrmActions();
  const { busy, failure, submit } = useSubmit(onClose);
  const [lead, setLead] = React.useState({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", value: "", nextStep: "", nextStepOn: "", source: "", isDealer: false, notes: "" });
  const set = (key: keyof typeof lead) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLead((current) => ({ ...current, [key]: event.target.value }));
  const field = (key: Exclude<keyof typeof lead, "isDealer" | "notes">, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`lead-${key}`}>{label}</Label>
      <Input id={`lead-${key}`} value={lead[key]} onChange={set(key)} {...props} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>It starts as new and is yours until you give it to someone else.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("companyName", "Company")}
            {field("value", "Worth (₱)", { type: "number", min: 0, step: "0.01" })}
            {field("contactName", "Contact")}
            {field("contactEmail", "Email", { type: "email" })}
            {field("contactPhone", "Phone")}
            {field("source", "Where it came from")}
            {field("nextStep", "Next step")}
            {field("nextStepOn", "By", { type: "date" })}
          </div>
          <label className="flex items-start gap-3 text-xs">
            <input type="checkbox" checked={lead.isDealer} onChange={(event) => setLead((current) => ({ ...current, isDealer: event.target.checked }))} className="mt-0.5 size-4 accent-[hsl(var(--brand))]" />
            <span>
              A dealer
              <span className="block text-2xs text-subtle-foreground">Sends vehicles in batches for reconditioning. The account is tagged when the lead is won.</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea id="lead-notes" rows={2} value={lead.notes} onChange={set("notes")} />
          </div>
          <Failure text={failure} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || lead.companyName.trim() === ""} onClick={() => void submit(() => actions.saveLead(lead))}>
            {busy ? "Adding…" : "Add lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({ lead, onClose }: { lead: CrmLead; onClose: () => void }) {
  const actions = useCrmActions();
  const { busy, failure, submit } = useSubmit(onClose);
  const [why, setWhy] = React.useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {lead.companyName} as lost</DialogTitle>
          <DialogDescription>Say why, so the next attempt starts from it. A lost lead can be re-opened.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Label htmlFor="lost-why">Why it was lost</Label>
          <Textarea id="lost-why" rows={3} value={why} onChange={(event) => setWhy(event.target.value)} />
          <Failure text={failure} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || why.trim() === ""} onClick={() => void submit(() => actions.moveLead(lead.id, "lost", why))}>
            {busy ? "Saving…" : "Mark as lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CONSENT_CHANNELS = [
  ["in_person", "In person"],
  ["paper_form", "Signed form"],
  ["email", "By email"],
  ["sms", "By SMS"],
  ["phone", "By phone"],
] as const;

function ConvertDialog({ lead, onClose }: { lead: CrmLead; onClose: () => void }) {
  const actions = useCrmActions();
  const { busy, failure, submit } = useSubmit(onClose);
  const [terms, setTerms] = React.useState({ consentChannel: "", paymentTermsDays: "30", creditLimit: "", registeredName: lead.companyName, tin: "", address: "", autoApproveUnder: "", serviceReminders: false, marketing: false });
  const set = (key: "paymentTermsDays" | "creditLimit" | "registeredName" | "tin" | "address" | "autoApproveUnder") => (event: React.ChangeEvent<HTMLInputElement>) => setTerms((current) => ({ ...current, [key]: event.target.value }));
  const tick = (key: "serviceReminders" | "marketing", label: string) => (
    <label className="flex items-center gap-3 text-xs">
      <input type="checkbox" checked={terms[key]} onChange={(event) => setTerms((current) => ({ ...current, [key]: event.target.checked }))} className="size-4 accent-[hsl(var(--brand))]" />
      {label}
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Handshake className="mr-2 inline size-4" aria-hidden />
            Win {lead.companyName}
          </DialogTitle>
          <DialogDescription>This opens a company account with these terms{lead.isDealer ? ", tagged as a dealer," : ""} and moves the lead&apos;s tasks to it. It cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="win-name">Registered name</Label>
              <Input id="win-name" value={terms.registeredName} onChange={set("registeredName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="win-tin">TIN</Label>
              <Input id="win-tin" placeholder="000-000-000" value={terms.tin} onChange={set("tin")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="win-terms">Payment terms (days)</Label>
              <Input id="win-terms" type="number" min={0} value={terms.paymentTermsDays} onChange={set("paymentTermsDays")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="win-credit">Credit limit (₱)</Label>
              <Input id="win-credit" type="number" min={0} step="0.01" value={terms.creditLimit} onChange={set("creditLimit")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="win-auto">Approve work automatically under (₱)</Label>
              <Input id="win-auto" type="number" min={0} step="0.01" value={terms.autoApproveUnder} onChange={set("autoApproveUnder")} placeholder="Leave empty to use the branch's own band" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="win-address">Address</Label>
              <Input id="win-address" value={terms.address} onChange={set("address")} />
            </div>
          </div>
          <fieldset className="space-y-3 rounded-md border border-border p-4">
            <legend className="px-1 text-xs font-medium">Consent</legend>
            <p className="text-2xs text-subtle-foreground">An account opens with the customer&apos;s agreement to keeping their service records. Tick the others only if they agreed to them.</p>
            <div className="space-y-1.5">
              <Label htmlFor="win-channel">How they gave it</Label>
              <Select value={terms.consentChannel} onValueChange={(consentChannel) => setTerms((current) => ({ ...current, consentChannel }))}>
                <SelectTrigger id="win-channel">
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {CONSENT_CHANNELS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tick("serviceReminders", "Agreed to service reminders")}
            {tick("marketing", "Agreed to marketing")}
          </fieldset>
          <Failure text={failure} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || terms.consentChannel === ""} onClick={() => void submit(() => actions.convertLead(lead.id, terms))}>
            {busy ? "Opening the account…" : "Win and open the account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
