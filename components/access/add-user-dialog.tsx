"use client";

import * as React from "react";
import { AlertCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFleetActions } from "@/lib/store";
import { CLIENT_ROLES, PROVIDER_ROLES, ROLE_LABEL } from "@/lib/rbac";
import type { FleetClient, Session, UserRole } from "@/types";

const EMPTY_DRAFT = {
  firstName: "",
  lastName: "",
  email: "",
  title: "",
  role: "" as UserRole | "",
  fleetClientId: "",
};

const STAFF_ROLES = new Set<UserRole>(PROVIDER_ROLES);

/**
 * Adds someone by INVITATION (`POST /invitations`): the API emails them a
 * link, and they choose their own password when they accept — nobody types a
 * password for anyone else. Portal roles belong to one customer account; staff
 * roles to the organization. The API refuses granting a role above the
 * inviter's own (no escalation).
 */
export function AddUserDialog({
  session,
  fleetClients,
  onCreated,
}: {
  session: Session;
  /** The customer accounts the inviter can reach. */
  fleetClients: FleetClient[];
  onCreated: () => void;
}) {
  const { inviteUser } = useFleetActions();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(EMPTY_DRAFT);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const callerIsStaff = session.side === "staff";
  const roleOptions: UserRole[] = callerIsStaff ? [...PROVIDER_ROLES, ...CLIENT_ROLES] : CLIENT_ROLES;
  const activeClients = fleetClients.filter((client) => client.status === "active");
  const roleIsClientSide = draft.role !== "" && !STAFF_ROLES.has(draft.role);

  function resetAndClose() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setSentTo(null);
    setOpen(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!draft.firstName || !draft.lastName || !draft.email || !draft.role) {
      setError("Fill in every field except job title.");
      return;
    }

    const fleetClientId = callerIsStaff ? (roleIsClientSide ? draft.fleetClientId || null : null) : session.fleetClientId;
    if (roleIsClientSide && !fleetClientId) {
      setError("Choose which customer account this person belongs to.");
      return;
    }

    setPending(true);
    const result = await inviteUser({
      email: draft.email.trim().toLowerCase(),
      name: `${draft.firstName.trim()} ${draft.lastName.trim()}`,
      role: draft.role,
      title: draft.title.trim() || null,
      customer_account_id: fleetClientId,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.fields ? Object.values(result.fields)[0]?.[0] ?? result.error : result.error);
      return;
    }

    onCreated();
    setSentTo(result.data.email);
    setDraft(EMPTY_DRAFT);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <UserPlus />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>
            They get an email with a link to set their own password. The invitation lasts a few days and can be revoked.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <DialogBody className="space-y-4">
            {sentTo ? (
              <p role="status" className="rounded-md border border-ok/25 bg-ok/[0.07] px-3 py-2 text-xs">
                Invitation sent to <span className="font-medium">{sentTo}</span>. Invite someone else, or close.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-user-first-name">First name</Label>
                <Input id="new-user-first-name" value={draft.firstName} onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-last-name">Last name</Label>
                <Input id="new-user-last-name" value={draft.lastName} onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-user-email">Work email</Label>
                <Input
                  id="new-user-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-user-title">Job title (optional)</Label>
                <Input id="new-user-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-user-role">Role</Label>
                <Select value={draft.role} onValueChange={(value) => setDraft((current) => ({ ...current, role: value as UserRole }))}>
                  <SelectTrigger id="new-user-role">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {roleIsClientSide && callerIsStaff ? (
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-client">Customer account</Label>
                  <Select value={draft.fleetClientId} onValueChange={(value) => setDraft((current) => ({ ...current, fleetClientId: value }))}>
                    <SelectTrigger id="new-user-client">
                      <SelectValue placeholder="Choose an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeClients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-critical/25 bg-critical/[0.07] px-3 py-2 text-xs text-critical">
                <AlertCircle className="mt-px size-4 shrink-0" />
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={resetAndClose}>
              {sentTo ? "Close" : "Cancel"}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
