"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Megaphone, Pencil, Plus, Trash2, Users, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/progress";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SKIP_REASON } from "@/lib/api/crm";
import { useCampaigns, useCrmActions, useSegments, useTemplates, useTiers } from "@/lib/crm";
import { useCan } from "@/lib/rbac";
import { formatManilaTime } from "@/lib/utils";
import type { CrmCampaign, CrmSegment, SegmentFilters } from "@/types/crm";

const STATUS_TONE: Record<CrmCampaign["status"], "neutral" | "brand" | "warning" | "ok" | "outline"> = { draft: "neutral", scheduled: "brand", sending: "warning", sent: "ok", cancelled: "outline" };
const NONE = "none";

/**
 * Segments and campaigns. A segment is a definition; who is in it is worked
 * out by the API each time. A campaign sends one marketing template to a
 * segment: only customers who agreed to marketing get it, within the hourly
 * limit, and everyone else is logged as not sent with the reason.
 */
export default function CampaignsPage() {
  const segments = useSegments();
  const campaigns = useCampaigns();
  const templates = useTemplates();
  const actions = useCrmActions();
  const { can, reason } = useCan();
  const manages = can("crm:manage");
  const [segment, setSegment] = React.useState<CrmSegment | "new" | null>(null);
  const [campaign, setCampaign] = React.useState<CrmCampaign | "new" | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  const error = segments.error ?? campaigns.error ?? templates.error;
  if (error) return <QueryError error={error} onRetry={() => void Promise.all([segments.refetch(), campaigns.refetch(), templates.refetch()])} />;
  if (!segments.data || !campaigns.data || !templates.data) return <Skeleton className="h-96" />;

  const gate = (node: React.ReactElement) => (manages ? node : <DeniedAction reason={reason("crm:manage")}>{node}</DeniedAction>);
  const report = (result: { ok: boolean; error?: string }) => setFailure(result.ok ? null : (result.error ?? "That did not work."));
  const marketing = templates.data.data.filter((template) => template.purpose === "marketing" && template.isActive);

  return (
    <>
      <PageHeader
        title="Segments & campaigns"
        description="Groups of customers, and what is sent to them. A campaign reaches only customers who agreed to marketing."
        actions={gate(
          <Button variant="primary" onClick={() => setCampaign("new")}>
            <Megaphone />
            New campaign
          </Button>
        )}
      />
      {failure ? (
        <p role="alert" className="mb-4 text-xs text-critical">
          {failure}
        </p>
      ) : null}

      <section className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Campaigns</h2>
        {campaigns.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No campaigns yet.</p>
        ) : (
          <ul className="divide-y divide-border text-xs">
            {campaigns.data.map((row) => {
              const progress = row.progress;
              const done = progress ? progress.audience - progress.remaining : 0;
              return (
                <li key={row.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_18rem_auto] md:items-center">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {row.name}
                      <Badge tone={STATUS_TONE[row.status]} className="capitalize">
                        {row.status}
                      </Badge>
                    </p>
                    <p className="text-2xs text-subtle-foreground">
                      {row.segmentName} · {row.templateName}
                      {row.scheduledAt ? ` · ${row.status === "draft" ? "planned for" : "from"} ${formatManilaTime(row.scheduledAt)}` : ""}
                      {row.hourlyLimit ? ` · ${row.hourlyLimit} an hour` : ""}
                    </p>
                  </div>
                  <div>
                    {progress && progress.audience > 0 ? (
                      <>
                        <Meter value={done / progress.audience} tone="ok" label={`${done} of ${progress.audience} customers processed`} />
                        <p className="tabular mt-1 text-2xs text-subtle-foreground">
                          {progress.sent} sent · {progress.queued} queued · {progress.skipped} not sent
                          {Object.entries(progress.skippedByReason).map(([why, count]) => ` (${count} ${SKIP_REASON[why]?.toLowerCase() ?? why})`)}
                          {progress.remaining > 0 ? ` · ${progress.remaining} to go` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-2xs text-subtle-foreground">Its audience is fixed when sending begins.</p>
                    )}
                  </div>
                  <span className="flex justify-end gap-1">
                    {row.canEdit
                      ? gate(
                          <Button size="sm" variant="ghost" aria-label={`Edit ${row.name}`} onClick={() => setCampaign(row)}>
                            <Pencil />
                          </Button>
                        )
                      : null}
                    {row.canSchedule
                      ? gate(
                          <Button size="sm" onClick={async () => report(await actions.setCampaignStatus(row.id, "scheduled"))}>
                            <CalendarClock />
                            {row.scheduledAt ? "Schedule" : "Send now"}
                          </Button>
                        )
                      : null}
                    {row.canCancel && row.status !== "draft"
                      ? gate(
                          <Button size="sm" variant="ghost" onClick={async () => report(await actions.setCampaignStatus(row.id, "cancelled"))}>
                            <XCircle />
                            Cancel
                          </Button>
                        )
                      : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-2xs text-subtle-foreground">
          Who got each message, and who did not, is in the{" "}
          <Link href="/shop/crm/messages" className="text-brand hover:underline">
            Message log
          </Link>
          .
        </p>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Segments</h2>
          {gate(
            <Button size="sm" onClick={() => setSegment("new")}>
              <Plus />
              Add a segment
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border text-xs">
          {segments.data.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-2xs text-subtle-foreground">{row.description ?? describe(row.filters)}</p>
              </div>
              <span className="flex items-center gap-2">
                <span className="tabular inline-flex items-center gap-1 text-muted-foreground">
                  <Users className="size-3.5" aria-hidden />
                  {row.size ?? "—"}
                </span>
                {gate(
                  <Button size="sm" variant="ghost" aria-label={`Edit ${row.name}`} onClick={() => setSegment(row)}>
                    <Pencil />
                  </Button>
                )}
                {gate(
                  <Button size="sm" variant="ghost" aria-label={`Delete ${row.name}`} onClick={async () => report(await actions.deleteSegment(row.id))}>
                    <Trash2 />
                  </Button>
                )}
              </span>
            </li>
          ))}
          {segments.data.length === 0 ? <li className="py-2 text-muted-foreground">No segments yet.</li> : null}
        </ul>
      </section>

      {segment ? <SegmentDialog segment={segment === "new" ? null : segment} onClose={() => setSegment(null)} /> : null}
      {campaign ? <CampaignDialog campaign={campaign === "new" ? null : campaign} segments={segments.data} templates={marketing} onClose={() => setCampaign(null)} /> : null}
    </>
  );
}

/** A filter in words. Wording only: the API decides who matches. */
function describe(filters: SegmentFilters): string {
  const parts = [
    filters.account_type ? `${filters.account_type} accounts` : null,
    filters.min_spend_cents != null ? `paid at least ₱${(filters.min_spend_cents / 100).toLocaleString("en-PH")}` : null,
    filters.max_spend_cents != null ? `paid at most ₱${(filters.max_spend_cents / 100).toLocaleString("en-PH")}` : null,
    filters.visited_within_days != null ? `seen in the last ${filters.visited_within_days} days` : null,
    filters.not_visited_for_days != null ? `not seen for ${filters.not_visited_for_days} days` : null,
    filters.makes?.length ? `drives ${filters.makes.join(" or ")}` : null,
    filters.size_classes?.length ? `${filters.size_classes.join(" or ")} vehicles` : null,
    filters.tags?.length ? `tagged ${filters.tags.join(" or ")}` : null,
    filters.tier_ids?.length ? (filters.tier_ids.includes(NONE) ? "not a member" : "members of a chosen tier") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Every active customer";
}

function SegmentDialog({ segment, onClose }: { segment: CrmSegment | null; onClose: () => void }) {
  const actions = useCrmActions();
  const tiers = useTiers();
  const from = segment?.filters ?? {};
  const [draft, setDraft] = React.useState({
    name: segment?.name ?? "",
    description: segment?.description ?? "",
    accountType: from.account_type ?? "any",
    minSpend: from.min_spend_cents != null ? String(from.min_spend_cents / 100) : "",
    visitedWithin: from.visited_within_days != null ? String(from.visited_within_days) : "",
    notVisitedFor: from.not_visited_for_days != null ? String(from.not_visited_for_days) : "",
    makes: (from.makes ?? []).join(", "),
    tags: (from.tags ?? []).join(", "),
    sizeClass: from.size_classes?.[0] ?? "any",
    tier: from.tier_ids?.[0] ?? "any",
  });
  const [preview, setPreview] = React.useState<{ total: number; names: string[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const set = (key: "name" | "description" | "minSpend" | "visitedWithin" | "notVisitedFor" | "makes" | "tags") => (event: React.ChangeEvent<HTMLInputElement>) => setDraft((c) => ({ ...c, [key]: event.target.value }));
  const words = (text: string) => text.split(",").map((word) => word.trim()).filter(Boolean);

  const filters = (): SegmentFilters => ({
    ...(draft.accountType !== "any" ? { account_type: draft.accountType } : {}),
    ...(draft.minSpend.trim() !== "" ? { min_spend_cents: Math.round(Number(draft.minSpend) * 100) } : {}),
    ...(draft.visitedWithin.trim() !== "" ? { visited_within_days: Number(draft.visitedWithin) } : {}),
    ...(draft.notVisitedFor.trim() !== "" ? { not_visited_for_days: Number(draft.notVisitedFor) } : {}),
    ...(words(draft.makes).length ? { makes: words(draft.makes) } : {}),
    ...(words(draft.tags).length ? { tags: words(draft.tags) } : {}),
    ...(draft.sizeClass !== "any" ? { size_classes: [draft.sizeClass] } : {}),
    ...(draft.tier !== "any" ? { tier_ids: [draft.tier] } : {}),
  });

  async function check() {
    const result = await actions.previewSegment(filters());
    if (result.ok) setPreview({ total: result.data.meta.total, names: result.data.data.slice(0, 8).map((row) => row.displayName) });
    else setFailure(result.error);
  }
  async function save() {
    setBusy(true);
    const result = await actions.saveSegment({ name: draft.name, description: draft.description, filters: filters() }, segment?.id);
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }
  const text = (key: Parameters<typeof set>[0], label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`seg-${key}`}>{label}</Label>
      <Input id={`seg-${key}`} value={draft[key]} onChange={set(key)} {...props} />
    </div>
  );
  const choice = (id: string, label: string, value: string, onChange: (value: string) => void, options: [string, string][]) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([option, name]) => (
            <SelectItem key={option} value={option}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{segment ? `Edit ${segment.name}` : "Add a segment"}</DialogTitle>
          <DialogDescription>Every condition you fill in must hold. Leave one empty to ignore it. Only active customers are ever in a segment.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Name")}
            {text("description", "Description")}
            {choice("seg-type", "Account type", draft.accountType, (accountType) => setDraft((c) => ({ ...c, accountType })), [["any", "Any"], ["company", "Company"], ["individual", "Individual"]])}
            {choice("seg-tier", "Membership", draft.tier, (tier) => setDraft((c) => ({ ...c, tier })), [["any", "Any"], [NONE, "Not a member"], ...(tiers.data ?? []).map((tier): [string, string] => [tier.id, tier.name])])}
            {text("minSpend", "Paid at least (₱)", { type: "number", min: 0 })}
            {choice("seg-size", "Vehicle size", draft.sizeClass, (sizeClass) => setDraft((c) => ({ ...c, sizeClass })), [["any", "Any"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["xl", "XL"]])}
            {text("visitedWithin", "Seen in the last (days)", { type: "number", min: 0 })}
            {text("notVisitedFor", "Not seen for (days)", { type: "number", min: 0 })}
            {text("makes", "Vehicle makes", { placeholder: "Toyota, Honda" })}
            {text("tags", "Tags", { placeholder: "dealer" })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void check()}>
              <Users />
              See who matches
            </Button>
            {preview ? (
              <p className="text-xs text-muted-foreground" role="status">
                {preview.total} customer{preview.total === 1 ? "" : "s"}
                {preview.names.length ? `: ${preview.names.join(", ")}${preview.total > preview.names.length ? "…" : ""}` : ""}
              </p>
            ) : null}
          </div>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || draft.name.trim() === ""} onClick={() => void save()}>
            {busy ? "Saving…" : segment ? "Save changes" : "Add segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDialog({ campaign, segments, templates, onClose }: { campaign: CrmCampaign | null; segments: CrmSegment[]; templates: { id: string; name: string; channelLabel: string }[]; onClose: () => void }) {
  const actions = useCrmActions();
  const [draft, setDraft] = React.useState({ name: campaign?.name ?? "", segmentId: campaign?.segmentId ?? "", templateId: campaign?.templateId ?? "", scheduledAt: "", hourlyLimit: campaign?.hourlyLimit ? String(campaign.hourlyLimit) : "" });
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    const result = await actions.saveCampaign(draft, campaign?.id);
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{campaign ? `Edit ${campaign.name}` : "New campaign"}</DialogTitle>
          <DialogDescription>Saved as a draft. Nothing is sent until you schedule it, and then only to customers who agreed to marketing.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cmp-name">Name</Label>
            <Input id="cmp-name" value={draft.name} onChange={(event) => setDraft((c) => ({ ...c, name: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cmp-segment">To</Label>
              <Select value={draft.segmentId} onValueChange={(segmentId) => setDraft((c) => ({ ...c, segmentId }))}>
                <SelectTrigger id="cmp-segment">
                  <SelectValue placeholder="Pick a segment" />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id}>
                      {segment.name} ({segment.size ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cmp-template">Message</Label>
              <Select value={draft.templateId} onValueChange={(templateId) => setDraft((c) => ({ ...c, templateId }))}>
                <SelectTrigger id="cmp-template">
                  <SelectValue placeholder="Pick a marketing template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.channelLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cmp-when">Send at</Label>
              <Input id="cmp-when" type="datetime-local" value={draft.scheduledAt} onChange={(event) => setDraft((c) => ({ ...c, scheduledAt: event.target.value }))} />
              <p className="text-2xs text-subtle-foreground">{campaign?.scheduledAt ? `Now set to ${formatManilaTime(campaign.scheduledAt)}. ` : ""}Empty: as soon as it is scheduled.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cmp-limit">Messages per hour</Label>
              <Input id="cmp-limit" type="number" min={1} value={draft.hourlyLimit} onChange={(event) => setDraft((c) => ({ ...c, hourlyLimit: event.target.value }))} placeholder="The shop's limit" />
            </div>
          </div>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || draft.name.trim() === "" || draft.segmentId === "" || draft.templateId === ""} onClick={() => void save()}>
            {busy ? "Saving…" : campaign ? "Save changes" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
