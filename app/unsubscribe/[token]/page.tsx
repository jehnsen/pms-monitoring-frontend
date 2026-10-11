"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { LinkNotFound, PublicShell } from "@/components/crm/public-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/errors";
import { confirmUnsubscribe, fetchUnsubscribeLink } from "@/lib/crm-public";
import type { UnsubscribeLink } from "@/types/crm";

/**
 * The unsubscribe link in every reminder and campaign. Opening it changes
 * nothing (mail scanners follow links); the button does. No sign-in.
 */
export default function UnsubscribePage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = React.useState<UnsubscribeLink | null | "missing">(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchUnsubscribeLink(token).then(setView, () => setView("missing"));
  }, [token]);

  if (view === "missing") return <LinkNotFound />;
  if (view === null)
    return (
      <PublicShell shop={null}>
        <Skeleton className="h-32" />
      </PublicShell>
    );

  const kind = view.purposeLabel.toLowerCase();
  const by = view.channel === "sms" ? "text messages" : "emails";

  if (view.unsubscribed)
    return (
      <PublicShell shop={view.shop}>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="size-5 text-ok" aria-hidden />
          You are unsubscribed
        </h1>
        <p className="text-sm text-muted-foreground">
          {view.shop} will send no more {by} of this kind to this address. Messages about a job you have with the shop, such as a receipt, may still reach you.
        </p>
      </PublicShell>
    );

  return (
    <PublicShell shop={view.shop}>
      <div>
        <h1 className="text-lg font-semibold">Stop these {by}?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This was a {kind} from {view.shop}. If you unsubscribe, the shop will send no more of them to this address.
        </p>
      </div>
      {failure ? (
        <p role="alert" className="text-xs text-critical">
          {failure}
        </p>
      ) : null}
      <Button
        variant="primary"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setView(await confirmUnsubscribe(token));
          } catch (error) {
            setFailure(describeApiError(error));
          }
          setBusy(false);
        }}
      >
        {busy ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
    </PublicShell>
  );
}
