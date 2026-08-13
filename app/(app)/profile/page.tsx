"use client";

import { useEffect, useState } from "react";
import { AlertCircle, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { SuccessDialog } from "@/components/ui/success-dialog";
import { useAuthActions, useSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/rbac";

function ProfileDetailsCard() {
  const { session } = useSession();
  const { updateProfile } = useAuthActions();

  const [draft, setDraft] = useState({
    firstName: session?.firstName ?? "",
    lastName: session?.lastName ?? "",
    username: session?.username ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  // Resyncs the draft if the session changes from outside this card (e.g.
  // a fresh sign-in). Not on every session update, so an in-flight edit isn't
  // clobbered by the optimistic write this same card just made.
  useEffect(() => {
    setDraft({
      firstName: session?.firstName ?? "",
      lastName: session?.lastName ?? "",
      username: session?.username ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.uid]);

  if (!session) return null;

  const dirty =
    draft.firstName !== session.firstName ||
    draft.lastName !== session.lastName ||
    draft.username !== session.username;

  async function onSave() {
    setError(null);
    setPending(true);
    const result = await updateProfile(draft);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <section className="card-raised">
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        <Avatar name={session.name} size="md" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">
            Profile details
          </h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            {session.email} · {ROLE_LABEL[session.role]}
          </p>
        </div>
      </header>

      <div className="space-y-4 border-t border-border px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-first-name">First name</Label>
            <Input
              id="profile-first-name"
              value={draft.firstName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, firstName: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-last-name">Last name</Label>
            <Input
              id="profile-last-name"
              value={draft.lastName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, lastName: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              value={draft.username}
              onChange={(event) =>
                setDraft((current) => ({ ...current, username: event.target.value }))
              }
            />
          </div>
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

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-2xs text-subtle-foreground">
            Job title, role, and tenancy are set by an administrator — see{" "}
            <span className="font-medium text-muted-foreground">Access</span>.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || pending}
            onClick={onSave}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <SuccessDialog
        open={success}
        onOpenChange={setSuccess}
        title="Profile updated"
        description="Your name and username have been saved."
      />
    </section>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput
        id={id}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ChangePasswordCard() {
  const { changePassword } = useAuthActions();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  const dirty = Boolean(currentPassword || newPassword || confirmPassword);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Fill in all three fields.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Your new password needs to be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    setPending(true);
    const result = await changePassword(currentPassword, newPassword);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  return (
    <section className="card-raised">
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-subtle-foreground">
          <KeyRound className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            Change password
          </h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            You&apos;ll need your current password to set a new one.
          </p>
        </div>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 border-t border-border px-5 py-5" noValidate>
        <PasswordField
          id="current-password"
          label="Current password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField
            id="new-password"
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
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

        <div className="flex items-center justify-end border-t border-border pt-4">
          <Button type="submit" variant="primary" size="sm" disabled={!dirty || pending}>
            {pending ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>

      <SuccessDialog
        open={success}
        onOpenChange={setSuccess}
        title="Password changed"
        description="Use your new password next time you sign in."
      />
    </section>
  );
}

export default function ProfilePage() {
  const { ready } = useSession();

  return (
    <>
      <PageHeader
        title="My profile"
        description="Update your name, username, and password."
        breadcrumb={[{ label: "My profile" }]}
      />

      {ready ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <ProfileDetailsCard />
          <ChangePasswordCard />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="card-raised h-64 animate-pulse" />
          <div className="card-raised h-64 animate-pulse" />
        </div>
      )}
    </>
  );
}
