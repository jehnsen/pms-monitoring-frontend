"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Logo } from "@/components/layout/logo";
import { api } from "@/lib/api/client";
import { describeApiError, isApiError } from "@/lib/api/errors";

/**
 * Choosing a password from an emailed link: a password reset
 * (`POST /auth/reset-password`, link from forgot-password) or accepting an
 * invitation (`POST /auth/invitations/accept`; the invitee sets their own
 * password). Either way the API checks the token; on success, sign in.
 */
export function SetPasswordForm({ mode, token, email }: { mode: "reset" | "invite"; token: string | undefined; email?: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const invalidLink = !token || (mode === "reset" && !email);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");

    setPending(true);
    try {
      if (mode === "reset") {
        await api("/auth/reset-password", {
          method: "POST",
          branch: null,
          body: { token, email, password, password_confirmation: confirm },
        });
      } else {
        await api("/auth/invitations/accept", {
          method: "POST",
          branch: null,
          body: { token, password, password_confirmation: confirm },
        });
      }
      router.replace("/login");
    } catch (failure) {
      setError(
        isApiError(failure) && failure.code === "validation"
          ? (failure.field("password") ?? failure.field("token") ?? failure.field("email") ?? describeApiError(failure))
          : describeApiError(failure)
      );
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Logo tagline="Service management" />
      <h1 className="mt-10 text-[28px] font-semibold tracking-[-0.04em]">
        {mode === "reset" ? "Choose a new password" : "Set up your account"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === "reset"
          ? `For ${email ?? "your account"}. You'll sign in with it next.`
          : "You've been invited. Choose the password you'll sign in with."}
      </p>

      {invalidLink ? (
        <p role="alert" className="mt-8 flex items-start gap-2 rounded-md border border-critical/25 bg-critical/[0.07] px-3 py-2 text-xs text-critical">
          <AlertCircle className="mt-px size-4 shrink-0" />
          This link is incomplete. Open it again from the email, or ask for a new one.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <PasswordInput id="password" autoComplete="new-password" className="h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput id="confirm" autoComplete="new-password" className="h-11" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-critical/25 bg-critical/[0.07] px-3 py-2 text-xs text-critical">
              <AlertCircle className="mt-px size-4 shrink-0" />
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">
            {pending ? (
              <>
                <Loader2 className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                Save password <ArrowRight />
              </>
            )}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-xs">
        <Link href="/login" className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
