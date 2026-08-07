"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/logo";
import { DEMO_ACCOUNTS, useAuthActions, useSession } from "@/lib/auth";
import { homeHrefFor } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

/**
 * The account the login screen advertises. Looked up by email rather than by
 * position — `DEMO_ACCOUNTS` is now ordered provider-side first, and taking
 * `[0]` would quietly hand out the Provider Admin instead.
 */
const PRIMARY_ACCOUNT =
  DEMO_ACCOUNTS.find((account) => account.role === "provider_admin") ??
  DEMO_ACCOUNTS[0];

/**
 * Where a bare sign-in drops you. Provider staff land on the shop floor,
 * client staff on their fleet dashboard — two different jobs, two different
 * home screens. See `homeHrefFor`.
 */
function defaultDestinationFor(role: UserRole | undefined) {
  return homeHrefFor(role);
}

/**
 * `next` arrives from the query string, so it is attacker-controllable. Only
 * same-site absolute paths are honoured — `//evil.com` and `https://evil.com`
 * are both rejected — otherwise the login screen becomes an open redirect.
 */
function safeDestination(next: string | undefined, role: UserRole | undefined) {
  if (!next) return defaultDestinationFor(role);
  if (!next.startsWith("/") || next.startsWith("//")) return defaultDestinationFor(role);
  return next;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { session, ready } = useSession();
  const { signIn } = useAuthActions();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Someone with a live session has no business on the login screen.
  React.useEffect(() => {
    if (ready && session) router.replace(safeDestination(next, session.role));
  }, [ready, session, router, next]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter both your email and password.");
      return;
    }

    setPending(true);
    // Brief hold so the pending state is actually observable; a real call would
    // supply this latency on its own.
    await new Promise((resolve) => setTimeout(resolve, 450));

    const result = signIn(email, password);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    const account = DEMO_ACCOUNTS.find(
      (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase()
    );
    router.replace(safeDestination(next, account?.role));
  }

  function fillDemo() {
    setEmail(PRIMARY_ACCOUNT.email);
    setPassword(PRIMARY_ACCOUNT.password);
    setError(null);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="lg:hidden">
        <Logo />
      </div>

      <h1 className="mt-8 text-2xl font-semibold tracking-tight lg:mt-0">
        Sign in
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Access the fleet maintenance console.
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
              placeholder="you@mekanikomore.ph"
              className="pl-9"
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
              onClick={() =>
                setError(
                  "Password recovery needs a mail service, which this demo build doesn't have."
                )
              }
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="pl-9 pr-10"
              aria-invalid={Boolean(error)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
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
            "Sign in"
          )}
        </Button>
      </form>

      {/* Nobody should be able to get locked out of a demo. */}
      <div className="mt-6 rounded-lg border border-border bg-surface-2/60 p-4">
        <p className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
          Demo credentials
        </p>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-subtle-foreground">Email</dt>
            <dd className="tabular font-medium">{PRIMARY_ACCOUNT.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-subtle-foreground">Password</dt>
            <dd className="tabular font-medium">{PRIMARY_ACCOUNT.password}</dd>
          </div>
        </dl>

        <hr />

        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-subtle-foreground">Email</dt>
            <dd className="tabular font-medium">purchasing@mekanikomor.ph</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-subtle-foreground">Password</dt>
            <dd className="tabular font-medium">{PRIMARY_ACCOUNT.password}</dd>
          </div>
        </dl>

        <hr />

        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-subtle-foreground">Email</dt>
            <dd className="tabular font-medium">fleet@actimed.ph</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-subtle-foreground">Password</dt>
            <dd className="tabular font-medium">demo1234</dd>
          </div>
        </dl>

        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          onClick={fillDemo}
        >
          Fill demo credentials
        </Button>
      </div>

      <p className={cn("mt-6 text-center text-2xs text-subtle-foreground")}>
        Demonstration build. Credentials are checked in the browser and no data
        leaves this device.
      </p>
    </div>
  );
}
