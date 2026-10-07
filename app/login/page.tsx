import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Car, Check, ClipboardCheck, Wrench } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Your automotive service management workspace.",
};

const SERVICE_STEPS = [
  { icon: Car, title: "Check in", detail: "Every vehicle accounted for" },
  { icon: Wrench, title: "Service", detail: "Every job moving forward" },
  { icon: ClipboardCheck, title: "Handover", detail: "Every detail documented" },
];

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col overflow-hidden bg-chrome p-10 text-chrome-foreground lg:flex xl:p-14">
        <div aria-hidden className="blueprint-grid pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -right-40 top-20 size-[560px] rounded-full border border-chrome-active/10 shadow-[0_0_120px_hsl(var(--chrome-active)/0.06)]" />
        <div aria-hidden className="pointer-events-none absolute -right-20 top-40 size-[400px] rounded-full border border-chrome-active/10" />
        <Logo tone="inverted" tagline="Service management" className="relative" />

        <div className="relative my-auto py-16">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-chrome-active/20 bg-chrome-active/5 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-chrome-active">
            <Wrench className="size-3" /> Built for the road ahead
          </p>
          <h2 className="max-w-lg text-[42px] font-semibold leading-[1.12] tracking-[-0.045em] xl:text-[52px]">
            Great service.<br />
            <span className="text-chrome-active">From start to finish.</span>
          </h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-chrome-muted">
            Bring your workshop and fleet together. Plan maintenance, manage service jobs, and keep every vehicle moving with confidence.
          </p>

          <div className="mt-10 rounded-2xl border border-chrome-border bg-chrome/80 p-6">
            <div className="mb-6 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-chrome-muted">One connected workflow</p>
              <span className="flex size-6 items-center justify-center rounded-full bg-chrome-active/10 text-chrome-active"><Check className="size-3.5" /></span>
            </div>
            <ol className="grid grid-cols-3 gap-4">
              {SERVICE_STEPS.map(({ icon: Icon, title, detail }, index) => (
                <li key={title} className="relative">
                  {index < 2 ? <div aria-hidden className="absolute left-12 right-0 top-5 border-t border-dashed border-chrome-active/30" /> : null}
                  <span className="relative flex size-10 items-center justify-center rounded-xl border border-chrome-active/20 bg-chrome-active/10 text-chrome-active"><Icon className="size-[18px]" strokeWidth={1.5} /></span>
                  <p className="mt-4 text-xs font-medium">{title}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-chrome-muted">{detail}</p>
                </li>
              ))}
            </ol>
          </div>
          <Link href="/workflow" className="mt-6 inline-flex items-center gap-2 rounded text-xs font-medium text-chrome-active transition-colors hover:text-chrome-foreground">
            Explore the service workflow <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <p className="relative text-[10px] tracking-wide text-chrome-muted">MekanikoMoR &middot; Automotive Service Management Platform</p>
      </aside>

      <main className="relative flex items-center justify-center bg-surface px-6 py-16 sm:px-10">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <LoginForm next={searchParams.next} />
      </main>
    </div>
  );
}
