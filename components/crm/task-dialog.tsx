"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCrmActions, useCrmOptions } from "@/lib/crm";
import type { CrmTask } from "@/types/crm";

const UNASSIGNED = "none";

/**
 * Add or edit a task. A task is about a customer or a lead: the caller says
 * which (`subject`) when it is new. The API holds the rules (an assignee is
 * active staff; a moved reminder is due again).
 */
export function TaskDialog({ task, subject, onClose }: { task: CrmTask | null; subject?: { customerAccountId?: string; leadId?: string; name: string }; onClose: () => void }) {
  const actions = useCrmActions();
  const options = useCrmOptions();
  const [draft, setDraft] = React.useState({
    title: task?.title ?? "",
    details: task?.details ?? "",
    kind: task?.kind ?? "follow_up",
    assigneeId: task?.assigneeId ?? UNASSIGNED,
    dueOn: task?.dueOn ?? "",
    remindAt: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    const result = await actions.saveTask(
      {
        title: draft.title,
        details: draft.details,
        kind: draft.kind,
        assigneeId: draft.assigneeId === UNASSIGNED ? null : draft.assigneeId,
        dueOn: draft.dueOn,
        remindAt: draft.remindAt,
        ...(task ? {} : { customerAccountId: subject?.customerAccountId, leadId: subject?.leadId }),
      },
      task?.id
    );
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "Add a task"}</DialogTitle>
          <DialogDescription>{task ? (task.customerName ?? task.leadName ?? "") : subject ? `About ${subject.name}.` : ""}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">What needs doing</Label>
            <Input id="task-title" value={draft.title} onChange={(event) => setDraft((c) => ({ ...c, title: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-kind">Kind</Label>
              <Select value={draft.kind} onValueChange={(kind) => setDraft((c) => ({ ...c, kind }))}>
                <SelectTrigger id="task-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(options.data?.taskKinds ?? []).map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Assigned to</Label>
              <Select value={draft.assigneeId} onValueChange={(assigneeId) => setDraft((c) => ({ ...c, assigneeId }))}>
                <SelectTrigger id="task-assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Nobody yet</SelectItem>
                  {(options.data?.staff ?? []).map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due</Label>
              <Input id="task-due" type="date" value={draft.dueOn} onChange={(event) => setDraft((c) => ({ ...c, dueOn: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-remind">Remind the assignee at</Label>
              <Input id="task-remind" type="datetime-local" value={draft.remindAt} onChange={(event) => setDraft((c) => ({ ...c, remindAt: event.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-details">Details</Label>
            <Textarea id="task-details" rows={3} value={draft.details} onChange={(event) => setDraft((c) => ({ ...c, details: event.target.value }))} />
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
          <Button variant="primary" disabled={busy || draft.title.trim() === ""} onClick={() => void save()}>
            {busy ? "Saving…" : task ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
