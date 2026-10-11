"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { LinkNotFound, PublicShell } from "@/components/crm/public-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/errors";
import { answerFeedback, fetchFeedbackLink } from "@/lib/crm-public";
import { cn } from "@/lib/utils";
import type { FeedbackLink } from "@/types/crm";

/** The feedback link sent after a payment: one 0–10 answer, once. No sign-in. */
export default function FeedbackLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = React.useState<FeedbackLink | null | "missing">(null);
  const [score, setScore] = React.useState<number | null>(null);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchFeedbackLink(token).then(setView, () => setView("missing"));
  }, [token]);

  if (view === "missing") return <LinkNotFound />;
  if (view === null)
    return (
      <PublicShell shop={null}>
        <Skeleton className="h-40" />
      </PublicShell>
    );

  async function send() {
    if (score === null) return;
    setBusy(true);
    try {
      setView(await answerFeedback(token, score, comment));
    } catch (error) {
      setFailure(describeApiError(error));
    }
    setBusy(false);
  }

  if (view.answered)
    return (
      <PublicShell shop={view.shop}>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="size-5 text-ok" aria-hidden />
          Thank you
        </h1>
        <p className="text-sm text-muted-foreground">
          Your answer ({view.score} out of 10) is with {view.shop}.
        </p>
      </PublicShell>
    );

  return (
    <PublicShell shop={view.shop}>
      <div>
        <h1 className="text-lg font-semibold">How did we do?</h1>
        <p className="mt-1 text-sm text-muted-foreground">How likely are you to recommend {view.shop} to someone you know?</p>
      </div>
      <fieldset>
        <legend className="sr-only">Your score, from 0 (not at all likely) to 10 (extremely likely)</legend>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, value) => (
            <button
              key={value}
              type="button"
              aria-pressed={score === value}
              onClick={() => setScore(value)}
              className={cn("tabular rounded-md border py-2 text-sm transition-colors", score === value ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface hover:bg-surface-2")}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="mt-1 flex justify-between text-2xs text-subtle-foreground">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </p>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="fb-comment">Anything you would like us to know (optional)</Label>
        <Textarea id="fb-comment" rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
      </div>
      {failure ? (
        <p role="alert" className="text-xs text-critical">
          {failure}
        </p>
      ) : null}
      <Button variant="primary" className="w-full" disabled={busy || score === null} onClick={() => void send()}>
        {busy ? "Sending…" : "Send"}
      </Button>
    </PublicShell>
  );
}
