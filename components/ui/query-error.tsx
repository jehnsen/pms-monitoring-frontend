"use client";

import Link from "next/link";
import { AlertTriangle, Blocks, Lock, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { describeApiError, isApiError } from "@/lib/api/errors";

/**
 * How a screen shows a failed read, by the API's error code:
 *
 *  - `not_found`: "not found, or not yours" — a record outside the caller's
 *    scope reads exactly like a missing one, so the page never confirms that
 *    another tenant's record exists;
 *  - `module_disabled`: the module is off where the caller works;
 *  - `forbidden` / `account_suspended`: no access, with the API's reason;
 *  - anything else: the message, and a retry.
 *
 * (401 never reaches here: it clears the session and AuthGuard redirects.)
 */
export function QueryError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  if (isApiError(error) && error.isNotFound) {
    return (
      <div className={className ?? "card"}>
        <EmptyState
          icon={SearchX}
          title="Not found, or not yours"
          description="This record doesn't exist, or it belongs to an account you can't see. Check the link, or go back."
          action={
            <Button asChild variant="secondary">
              <Link href="/">Go to my home screen</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isApiError(error) && error.isModuleDisabled) {
    return <ModuleNotice message={error.message} className={className} />;
  }

  if (isApiError(error) && (error.code === "forbidden" || error.code === "account_suspended")) {
    return (
      <div className={className ?? "card"}>
        <EmptyState icon={Lock} title="You don't have access to this" description={error.message} />
      </div>
    );
  }

  return (
    <div className={className ?? "card"}>
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load this"
        description={describeApiError(error)}
        action={
          onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

/** A screen whose module isn't switched on where the session works. */
export function ModuleNotice({ message, className }: { message?: string; className?: string }) {
  return (
    <div className={className ?? "card"}>
      <EmptyState
        icon={Blocks}
        title="This module isn't enabled here"
        description={
          message ??
          "Your organization hasn't switched this module on for the branch you're working in. Switch branch, or ask an administrator."
        }
      />
    </div>
  );
}
