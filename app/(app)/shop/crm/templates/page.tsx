"use client";

import * as React from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmActions, useTemplates } from "@/lib/crm";
import { useCan } from "@/lib/rbac";
import type { MessageTemplate, TemplateMeta } from "@/types/crm";

const CONSENT: Record<string, string> = { service_reminders: "needs consent to service reminders", marketing: "needs consent to marketing" };

/**
 * Message templates: the wording of every reminder, feedback request and
 * campaign. A template's purpose decides the consent its messages need; the
 * API fills the `{{placeholders}}` when a message is written.
 */
export default function TemplatesPage() {
  const { data, error, refetch } = useTemplates();
  const actions = useCrmActions();
  const { can, reason } = useCan();
  const manages = can("crm:manage");
  const [editing, setEditing] = React.useState<MessageTemplate | "new" | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!data) return <Skeleton className="h-96" />;

  const gate = (node: React.ReactElement) => (manages ? node : <DeniedAction reason={reason("crm:manage")}>{node}</DeniedAction>);
  const consentOf = (purpose: string) => data.meta.purposes.find((option) => option.value === purpose)?.consent ?? null;

  return (
    <>
      <PageHeader
        title="Templates"
        description="The wording of the shop's messages. What a template is for decides who may be sent it."
        actions={gate(
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus />
            Add a template
          </Button>
        )}
      />
      {failure ? (
        <p role="alert" className="mb-4 text-xs text-critical">
          {failure}
        </p>
      ) : null}

      {data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={FileText} title="No templates yet" description="Add one before setting up a reminder or a campaign." />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.data.map((template) => {
            const consent = consentOf(template.purpose);
            return (
              <article key={template.id} className="card flex flex-col p-5 text-xs">
                <header className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{template.name}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{template.purposeLabel}</Badge>
                      <Badge tone="outline">{template.channelLabel}</Badge>
                      {!template.isActive ? <Badge tone="warning">Off</Badge> : null}
                    </p>
                  </div>
                  <span className="flex shrink-0">
                    {gate(
                      <Button size="sm" variant="ghost" aria-label={`Edit ${template.name}`} onClick={() => setEditing(template)}>
                        <Pencil />
                      </Button>
                    )}
                    {gate(
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${template.name}`}
                        onClick={async () => {
                          const result = await actions.deleteTemplate(template.id);
                          setFailure(result.ok ? null : result.error);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                </header>
                {template.subject ? <p className="font-medium">{template.subject}</p> : null}
                <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-muted-foreground">{template.body}</p>
                <p className="mt-3 text-2xs text-subtle-foreground">{consent ? `Sent only to a customer who agreed: ${CONSENT[consent] ?? consent}.` : "Needs no consent: use it only for something the customer asked for."}</p>
              </article>
            );
          })}
        </div>
      )}

      {editing ? <TemplateDialog template={editing === "new" ? null : editing} meta={data.meta} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function TemplateDialog({ template, meta, onClose }: { template: MessageTemplate | null; meta: TemplateMeta; onClose: () => void }) {
  const actions = useCrmActions();
  const [draft, setDraft] = React.useState({ name: template?.name ?? "", channel: template?.channel ?? "email", purpose: template?.purpose ?? "service_reminder", subject: template?.subject ?? "", body: template?.body ?? "", isActive: template?.isActive ?? true });
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const body = React.useRef<HTMLTextAreaElement>(null);

  async function save() {
    setBusy(true);
    const result = await actions.saveTemplate(draft, template?.id);
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }
  const insert = (placeholder: string) => {
    const at = body.current?.selectionStart ?? draft.body.length;
    setDraft((c) => ({ ...c, body: `${c.body.slice(0, at)}{{${placeholder}}}${c.body.slice(at)}` }));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? `Edit ${template.name}` : "Add a template"}</DialogTitle>
          <DialogDescription>Write {"{{placeholder}}"} where a detail goes; the API fills it in for each customer. Always include {"{{unsubscribe_link}}"} in a reminder or a campaign.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input id="tpl-name" value={draft.name} onChange={(event) => setDraft((c) => ({ ...c, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-purpose">For</Label>
              <Select value={draft.purpose} onValueChange={(purpose) => setDraft((c) => ({ ...c, purpose }))}>
                <SelectTrigger id="tpl-purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.purposes.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-channel">Sent by</Label>
              <Select value={draft.channel} onValueChange={(channel) => setDraft((c) => ({ ...c, channel: channel as "email" | "sms" }))}>
                <SelectTrigger id="tpl-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.channels.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {draft.channel === "email" ? (
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Subject</Label>
              <Input id="tpl-subject" value={draft.subject} onChange={(event) => setDraft((c) => ({ ...c, subject: event.target.value }))} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Message</Label>
            <Textarea id="tpl-body" ref={body} rows={9} value={draft.body} onChange={(event) => setDraft((c) => ({ ...c, body: event.target.value }))} />
            <p className="flex flex-wrap items-center gap-1.5 text-2xs text-subtle-foreground">
              Insert:
              {[...meta.standardPlaceholders, "vehicle", "services", "status", "due_in"].map((placeholder) => (
                <button key={placeholder} type="button" onClick={() => insert(placeholder)} className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-2">
                  {placeholder}
                </button>
              ))}
            </p>
          </div>
          <label className="flex items-center gap-3 text-xs">
            <input type="checkbox" className="size-4 accent-[hsl(var(--brand))]" checked={draft.isActive} onChange={(event) => setDraft((c) => ({ ...c, isActive: event.target.checked }))} />
            In use
          </label>
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
          <Button variant="primary" disabled={busy || draft.name.trim() === "" || draft.body.trim() === ""} onClick={() => void save()}>
            {busy ? "Saving…" : template ? "Save changes" : "Add template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
