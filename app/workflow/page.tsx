import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { HeroStats, WorkflowExperience } from "@/components/workflow/workflow-experience";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "An interactive walkthrough of the fleet PMS workflow — from a due interval to a closed work order, a purchase order, and a compliant vehicle.",
};

export default function WorkflowPage() {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="secondary" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="absolute -right-24 -top-32 size-96 rounded-full bg-brand/10 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -left-24 top-40 size-72 rounded-full bg-ok/10 blur-3xl"
          />
          <div className="container relative py-16 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              How it works
            </p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              From a due interval to a closed order, a purchase request, and
              a compliant vehicle.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              One continuous loop, not six disconnected screens. Play the
              six-step walkthrough below to see how a single overdue service
              interval moves through detection, approval, close-out, parts
              supply, and compliance — using the same data model the app
              runs on.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" asChild>
                <a href="#walkthrough">
                  <PlayCircle />
                  Play the walkthrough
                </a>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/login">
                  See it on your fleet
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            <div className="mt-12">
              <HeroStats />
            </div>
          </div>
        </section>

        {/* Interactive walkthrough */}
        <section id="walkthrough" className="container scroll-mt-8 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              The workflow
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Six stages, one loop
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Playing automatically — click a stage, or use the controls
              below, to move at your own pace.
            </p>
          </div>

          <div className="mt-12">
            <WorkflowExperience />
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border bg-brand">
          <div className="container flex flex-col items-center gap-4 py-14 text-center text-white">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              This is what your fleet office opens every morning.
            </h2>
            <p className="max-w-lg text-sm leading-relaxed text-white/80">
              Sign in with a demo account to click through the real thing —
              schedules, approvals, purchase orders, and compliance, seeded
              with a working fleet.
            </p>
            <Button
              variant="secondary"
              size="lg"
              className="mt-2 bg-white text-brand hover:bg-white/90"
              asChild
            >
              <Link href="/login">
                Sign in to explore
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
