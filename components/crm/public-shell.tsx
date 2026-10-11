import * as React from "react";

/**
 * The frame of a page opened from a link in a message: no sign-in, no app
 * shell, the shop's name at the top. Used by the reminder, feedback and
 * unsubscribe pages.
 */
export function PublicShell({ shop, children }: { shop: string | null; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">
      <div className="card w-full max-w-md space-y-5 p-6">
        {shop ? <p className="text-2xs uppercase tracking-widest text-subtle-foreground">{shop}</p> : null}
        {children}
      </div>
    </main>
  );
}

/** The one message a dead or mistyped link gets: it never says whether a token ever existed. */
export function LinkNotFound() {
  return (
    <PublicShell shop={null}>
      <h1 className="text-lg font-semibold">This link does not work</h1>
      <p className="text-sm text-muted-foreground">It may have been mistyped or cut short. Open it again from the message it came in, or contact the shop directly.</p>
    </PublicShell>
  );
}
