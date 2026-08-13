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
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { CLIENT_ROLES, PROVIDER_ROLES, ROLE_LABEL } from "@/lib/rbac";
import { isProviderRole } from "@/lib/tenancy";
import type { FleetClient, Session } from "@/types";
import type { UserRole } from "@/types";

const EMPTY_DRAFT = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  title: "",
  role: "" as UserRole | "",
  fleetClientId: "",
};

export function AddUserDialog({
  session,
  fleetClients,
  onCreated,
}: {
  session: Session;
  /** Already tenant-scoped by `useFleet()` — every client beneath this provider. */
  fleetClients: FleetClient[];
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(EMPTY_DRAFT);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const callerIsProviderSide = isProviderRole(session.role);
  const roleOptions: UserRole[] = callerIsProviderSide
    ? [...PROVIDER_ROLES, ...CLIENT_ROLES]
    : CLIENT_ROLES;
  const activeClients = fleetClients.filter((client) => client.status === "active");
  const roleIsClientSide = draft.role !== "" && !isProviderRole(draft.role);

  function resetAndClose() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (
      !draft.firstName ||
      !draft.lastName ||
      !draft.username ||
      !draft.email ||
      !draft.password ||
      !draft.role
    ) {
      setError("Fill in every field except job title.");
      return;
    }
    if (draft.password.length < 8) {
      setError("Password needs to be at least 8 characters.");
      return;
    }

    const fleetClientId = callerIsProviderSide
      ? roleIsClientSide
        ? draft.fleetClientId || null
        : null
      : session.fleetClientId;

    if (roleIsClientSide && !fleetClientId) {
      setError("Choose which fleet client this person belongs to.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setPending(true);
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      setPending(false);
      setError("Your session has expired. Sign in again.");
      return;
    }

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email: draft.email,
        password: draft.password,
        firstName: draft.firstName,
        lastName: draft.lastName,
        username: draft.username,
        role: draft.role,
        title: draft.title,
        fleetClientId,
      }),
    });

    const result = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setError(result.error ?? "Could not create the account.");
      return;
    }

    onCreated();
    resetAndClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <UserPlus />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Creates a real sign-in — share the password with them directly,
            there&apos;s no email delivery in this build.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-user-first-name">First name</Label>
                <Input
                  id="new-user-first-name"
                  value={draft.firstName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, firstName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-last-name">Last name</Label>
                <Input
                  id="new-user-last-name"
                  value={draft.lastName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, lastName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-username">Username</Label>
                <Input
                  id="new-user-username"
                  value={draft.username}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-title">Job title (optional)</Label>
                <Input
                  id="new-user-title"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-user-email">Work email</Label>
                <Input
                  id="new-user-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-user-password">Initial password</Label>
                <PasswordInput
                  id="new-user-password"
                  value={draft.password}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-user-role">Role</Label>
                <Select
                  value={draft.role}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, role: value as UserRole }))
                  }
                >
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

              {roleIsClientSide && callerIsProviderSide ? (
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-client">Fleet client</Label>
                  <Select
                    value={draft.fleetClientId}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, fleetClientId: value }))
                    }
                  >
                    <SelectTrigger id="new-user-client">
                      <SelectValue placeholder="Choose a client" />
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
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-critical/25 bg-critical/[0.07] px-3 py-2 text-xs text-critical"
              >
                <AlertCircle className="mt-px size-4 shrink-0" />
                {error}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
