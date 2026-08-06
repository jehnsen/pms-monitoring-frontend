import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, GaugeCircle, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the fleet maintenance console.",
};

const HIGHLIGHTS = [
  {
    icon: GaugeCircle,
    title: "Dual-limit intervals",
    body: "Every service item tracks distance and time, and falls due on whichever limit arrives first.",
  },
  {
    icon: CalendarClock,
    title: "Forward workload",
    body: "See what lands in each of the next six weeks before it becomes an unplanned repair.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance at a glance",
    body: "Safety-critical intervals carry the weight they should in every health score.",
  },
];

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel. Hidden on small screens, where it would just push the
          form below the fold. */}
      <aside className="relative hidden overflow-hidden bg-brand p-10 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/25"
        />
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-20 size-96 rounded-full bg-black/20 blur-3xl"
        />

        <div className="relative">
          <Logo tone="inverted" />
        </div>

        <div className="relative mt-auto">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Preventive maintenance, before it turns into a breakdown.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
            Monitor every interval across the fleet, plan the work while there is
            still lead time, and keep unplanned repairs off the books.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/20">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-0.5 block max-w-sm text-xs leading-relaxed text-white/70">
                      {item.body}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <Link
            href="/workflow"
            className="mt-8 inline-flex items-center gap-1.5 text-xs font-medium text-white/80 transition-colors hover:text-white"
          >
            See how the whole workflow fits together
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <p className="relative mt-auto pt-10 text-2xs text-white/50">
          MekanikoMoRe · Fleet PMS &amp; Maintenance
        </p>
      </aside>

      <main className="relative flex items-center justify-center bg-page px-6 py-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <LoginForm next={searchParams.next} />
      </main>
    </div>
  );
}
