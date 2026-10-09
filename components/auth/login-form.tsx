"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Logo } from "@/components/layout/logo";
import { DEMO_ACCOUNTS, DEMO_MODE, useAuthActions, useSession } from "@/lib/auth";
import { api } from "@/lib/api/client";
import { describeApiError } from "@/lib/api/errors";
import { homeHrefFor } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Session } from "@/types";

/**
 * Where a bare sign-in drops you. Provider staff land on the shop floor,
 * client staff on their fleet dashboard — two different jobs, two different
 * home screens. See `homeHrefFor`.
 */
function defaultDestinationFor(session: Pick<Session, "side" | "role"> | null) {
  return homeHrefFor(session?.side, session?.role);
}

/**
 * `next` arrives from the query string, so it is attacker-controllable. Only
 * same-site absolute paths are honoured — `//evil.com` and `https://evil.com`
 * are both rejected — otherwise the login screen becomes an open redirect.
 */
function safeDestination(next: string | undefined, session: Pick<Session, "side" | "role"> | null) {
  if (!next) return defaultDestinationFor(session);
  if (!next.startsWith("/") || next.startsWith("//")) return defaultDestinationFor(session);
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { session, ready } = useSession();
  const { signIn } = useAuthActions();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Someone with a live session has no business on the login screen.
  React.useEffect(() => {
    if (ready && session) router.replace(safeDestination(next, session));
  }, [ready, session, router, next]);

  async function attempt(withEmail: string, withPassword: string) {
    setPending(true);
    // The API's cookie session: CSRF cookie, then POST /auth/login → /me.
    const result = await signIn(withEmail, withPassword);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.replace(safeDestination(next, result.session));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError("Enter both your email and password.");
      return;
    }
    await attempt(email, password);
  }

  /** POST /auth/forgot-password; the answer never says whether the address exists. */
  async function onForgot() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your work email first, then choose “Forgot password?”.");
      return;
    }
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim().toLowerCase() }, branch: null });
      setNotice("If that address has an account, a reset link is on its way.");
    } catch (failure) {
      setError(describeApiError(failure));
    }
  }

  /** Demo builds only: sign in as a seeded account in one click. */
  async function signInAs(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    setNotice(null);
    await attempt(demoEmail, demoPassword);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="lg:hidden">
        <Logo tagline="Service management" />
      </div>

      <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand lg:mt-0">Your service workspace</p>
      <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.04em]">
        Welcome back
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sign in to manage your workshop and fleet.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.ph"
              className="h-11 pl-9"
              aria-invalid={Boolean(error)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button
              type="button"
              className="rounded text-xs text-brand transition-colors hover:underline"
              onClick={() => void onForgot()}
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            className="h-11"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
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

        {notice ? (
          <p role="status" className="flex items-start gap-2 rounded-md border border-ok/25 bg-ok/[0.07] px-3 py-2 text-xs">
            <CheckCircle2 className="mt-px size-4 shrink-0 text-ok" />
            {notice}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending}
          className="w-full"
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Signing in…
            </>
          ) : (
            <>Sign in to workspace <ArrowRight /></>
          )}
        </Button>
      </form>

      {/* Demo builds only (NEXT_PUBLIC_DEMO_MODE=true): one click per seeded role. */}
      {DEMO_MODE && DEMO_ACCOUNTS.length > 0 ? (
        <details className="mt-6 rounded-lg border border-border bg-surface-2/60 p-4">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Explore with a demo account</summary>
          <p className="mt-3 text-2xs leading-relaxed text-subtle-foreground">
            Seeded accounts on the demo API; every password is{" "}
            <span className="font-medium text-foreground">demo1234</span>.
          </p>
          <ul className="mt-3 space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void signInAs(account.email, account.password)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-brand/35 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{account.name}</span>
                    <span className="block truncate text-2xs text-subtle-foreground">
                      {account.title}
                      {account.account ? ` · ${account.account}` : " · Provider staff"}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-subtle-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className={cn("mt-7 flex items-center justify-center gap-2 text-center text-[11px] text-subtle-foreground")}>
        <ShieldCheck className="size-3.5 shrink-0" />
        Secure access for your service team.
      </p>
    </div>
  );
}
