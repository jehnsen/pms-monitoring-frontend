import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, KeyRound, Layers, PlayCircle, ShieldCheck, Split, Workflow } from "lucide-react";
import { ProcessSteps } from "@/components/docs/process-steps";
import { RoleCards, RoleMatrix } from "@/components/docs/role-matrix";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GUIDE_MODULES, GUIDE_PRINCIPLES, GUIDE_PROCESSES } from "@/lib/guide";
import { PLATFORM } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Documentation",
  description: `What ${PLATFORM.productName} is, what each module does, who may do what, and how the everyday processes run from start to finish.`,
};

const SIDE_LABEL = { staff: "Service centre", portal: "Fleet client", both: "Both sides" } as const;
const MODULE_SWITCH = { repair_pms: "Repair & PMS", detailing: "Detailing", equipment: "Equipment monitoring", crm: "CRM" } as const;

const CONTENTS = [
  { id: "what", label: `What ${PLATFORM.productName} is` },
  { id: "structure", label: "How it is organised" },
  { id: "modules", label: "Modules" },
  { id: "roles", label: "Roles and permissions" },
  { id: "processes", label: "Processes" },
  { id: "public", label: "Pages that need no sign-in" },
  { id: "principles", label: "What always holds" },
];

/**
 * The user guide: what the platform is, its modules, who may do what, and the
 * everyday processes. Public, like the workflow page. Its module and process
 * text comes from `lib/guide.ts`; its role tables from `lib/rbac.ts`.
 */
export default function DocumentationPage() {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/workflow">How it works</Link>
            </Button>
            <ThemeToggle />
            <Button variant="secondary" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="container py-14 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Documentation</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">A guide to {PLATFORM.productName}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            What the platform is, what each part of it does, who is allowed to do what, and how the everyday jobs run from start to finish. Written for the people who use it: the service centre&rsquo;s staff and the fleet clients they look after.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" asChild>
              <a href="#processes">
                <Workflow />
                Jump to the processes
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/workflow">
                <PlayCircle />
                Watch the walkthrough
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="container grid gap-10 py-12 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">On this page</p>
          <ul className="space-y-1.5 text-xs">
            {CONTENTS.map((entry) => (
              <li key={entry.id}>
                <a href={`#${entry.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Modules</p>
          <ul className="space-y-1.5 text-xs">
            {GUIDE_MODULES.map((module) => (
              <li key={module.id}>
                <a href={`#module-${module.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
                  {module.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 space-y-16">
          <section id="what" className="scroll-mt-8">
            <SectionTitle icon={Layers} title={`What ${PLATFORM.productName} is`} />
            <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                {PLATFORM.productName} is one system for running an automotive service business: a repair shop that maintains fleets on a schedule, a detailing studio, or both under one roof. It follows a vehicle from the moment it is due for service to the moment the work is paid for, and keeps the stock, the money and the customer relationship behind that in the same place.
              </p>
              <p>
                It is used from two sides. The <strong className="font-medium text-foreground">service centre</strong> runs the shop: its floor, its stock room, its billing and its books. A <strong className="font-medium text-foreground">fleet client</strong> signs in to the same system and sees only its own vehicles, approvals, invoices and documents. Both look at the same records; neither can see past its own boundary.
              </p>
              <p>
                {PLATFORM.productName} is built by <strong className="font-medium text-foreground">{PLATFORM.builtBy}</strong> as one of its platforms. It was designed by{" "}
                <strong className="font-medium text-foreground">{PLATFORM.designedBy.name}</strong>, {PLATFORM.designedBy.title} of {PLATFORM.designedBy.company}.
              </p>
            </div>
          </section>

          <section id="structure" className="scroll-mt-8">
            <SectionTitle icon={Building2} title="How it is organised" />
            <div className="grid gap-4 md:grid-cols-2">
              <Fact title="Organisation and branches">
                A service centre is an organisation with one or more branches. Staff may be held to particular branches; stock, bookings, invoices and the books are kept per branch. Staff who work in more than one use the branch switcher at the top of the screen.
              </Fact>
              <Fact title="Modules are switched on per branch">
                Repair &amp; PMS, Detailing, Equipment monitoring and CRM are modules. A branch shows only the modules it runs: a detailing studio need not see the repair floor. Opening a screen whose module is off says so, rather than showing an empty page.
              </Fact>
              <Fact title="Customer accounts">
                A customer is an account: a company with a fleet, or an individual. Vehicles, jobs, invoices, bookings and consent all hang on the account. A company&rsquo;s own people can be given sign-ins to see and approve their own work.
              </Fact>
              <Fact title="Branding">
                Inside the app you see the service centre&rsquo;s own name and colours, and a branch may carry its own. {PLATFORM.productName} is the name of the software underneath.
              </Fact>
            </div>
          </section>

          <section id="modules" className="scroll-mt-8">
            <SectionTitle icon={Split} title="Modules" />
            <p className="mb-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">Each part of the platform, the screens it has, and what is worth knowing before you use it. The screens you actually see depend on your role and on the modules your branch runs.</p>
            <div className="space-y-6">
              {GUIDE_MODULES.map((module) => (
                <article key={module.id} id={`module-${module.id}`} className="card scroll-mt-8 p-6">
                  <header className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{module.name}</h3>
                    <Badge tone="outline">{SIDE_LABEL[module.side]}</Badge>
                    {module.moduleKey ? <Badge tone="brand">Module: {MODULE_SWITCH[module.moduleKey]}</Badge> : null}
                  </header>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{module.summary}</p>
                  <div className="mt-5 grid gap-6 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Screens</h4>
                      <dl className="space-y-2 text-xs">
                        {module.screens.map((screen) => (
                          <div key={screen.label}>
                            <dt className="font-medium">{screen.label}</dt>
                            <dd className="text-muted-foreground">{screen.what}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div>
                      <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Worth knowing</h4>
                      <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
                        {module.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                      {GUIDE_PROCESSES.some((process) => process.moduleId === module.id) ? (
                        <p className="mt-4 text-xs">
                          {GUIDE_PROCESSES.filter((process) => process.moduleId === module.id).map((process) => (
                            <a key={process.id} href={`#process-${process.id}`} className="mr-4 inline-flex items-center gap-1 font-medium text-brand hover:underline">
                              {process.title}
                              <ArrowRight className="size-3.5" aria-hidden />
                            </a>
                          ))}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="roles" className="scroll-mt-8">
            <SectionTitle icon={KeyRound} title="Roles and permissions" />
            <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>Every sign-in has one role. What you can reach is decided by four things, checked in this order every time you do anything:</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Fact title="1. Your side">A fleet client&rsquo;s sign-in never reaches the service centre&rsquo;s own screens: the stock room, the books, detailing, equipment or the CRM.</Fact>
              <Fact title="2. Your scope">
                A fleet client sees its own account only; another client&rsquo;s record does not exist as far as it can tell. Staff held to a branch see that branch&rsquo;s records. The CRM is the exception: a customer&rsquo;s record there covers every branch.
              </Fact>
              <Fact title="3. The module">The branch you are working in must run the module the screen belongs to.</Fact>
              <Fact title="4. Your role&rsquo;s permissions">The tables below. A permission never widens your scope: a fleet manager&rsquo;s &ldquo;manage&rdquo; applies to their own fleet, not to the shop.</Fact>
            </div>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              An action you are not allowed is shown dimmed, with the reason when you point at it. It is not hidden, so you can always see what exists and whom to ask.
            </p>

            <h3 className="mb-4 mt-10 text-base font-semibold">Service centre roles</h3>
            <RoleCards side="staff" />
            <div className="mt-5">
              <RoleMatrix side="staff" />
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-subtle-foreground">
              A branch manager holds these permissions only in the branches they are assigned to. Organisation-wide settings, the chart of accounts and closing a month are the provider admin&rsquo;s alone.
            </p>

            <h3 className="mb-4 mt-10 text-base font-semibold">Fleet client roles</h3>
            <RoleCards side="portal" />
            <div className="mt-5">
              <RoleMatrix side="portal" />
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-subtle-foreground">
              Every fleet client role can read its own account&rsquo;s vehicles, jobs and documents. Approving spend is also held to an amount: each client sets how much may be approved automatically and by whom, and a request above your limit waits for someone with a higher one.
            </p>
          </section>

          <section id="processes" className="scroll-mt-8">
            <SectionTitle icon={Workflow} title="Processes" />
            <p className="mb-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              The everyday jobs, step by step, with who does each step. For an animated version of the first two, see the{" "}
              <Link href="/workflow" className="font-medium text-brand hover:underline">
                walkthrough
              </Link>
              .
            </p>
            <div className="grid gap-6 xl:grid-cols-2">
              {GUIDE_PROCESSES.map((process) => (
                <article key={process.id} id={`process-${process.id}`} className="card scroll-mt-8 p-6">
                  <h3 className="text-base font-semibold">{process.title}</h3>
                  <p className="mb-5 mt-1 text-xs text-muted-foreground">{process.summary}</p>
                  <ProcessSteps process={process} />
                </article>
              ))}
            </div>
          </section>

          <section id="public" className="scroll-mt-8">
            <SectionTitle icon={ArrowRight} title="Pages that need no sign-in" />
            <div className="grid gap-4 md:grid-cols-2">
              <Fact title="Online booking">A detailing branch can publish a booking page in its own look. Customers pick a package and a free time, and get a confirmation by email. The branch switches it on or off.</Fact>
              <Fact title="The wall screen">The shop monitor can run on a screen on the wall, opened with a link made under Detailing settings. The link can be revoked at any time.</Fact>
              <Fact title="Links inside messages">A reminder&rsquo;s booking link, a feedback link and the unsubscribe link each open one page for one customer. The link itself is the key; it shows nothing else.</Fact>
              <Fact title="This guide and the walkthrough">Open to anyone, with nothing of any customer&rsquo;s in them.</Fact>
            </div>
          </section>

          <section id="principles" className="scroll-mt-8">
            <SectionTitle icon={ShieldCheck} title="What always holds" />
            <dl className="grid gap-4 md:grid-cols-2">
              {GUIDE_PRINCIPLES.map((principle) => (
                <div key={principle.title} className="card p-5">
                  <dt className="text-sm font-semibold">{principle.title}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{principle.detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-surface-2/50 p-8 text-center">
            <h2 className="text-lg font-semibold">Ready to look around?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Sign in and the app takes you to your own home screen: the shop&rsquo;s floor, or your fleet.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button variant="primary" asChild>
                <Link href="/login">
                  Sign in
                  <ArrowRight />
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <a href={`mailto:${PLATFORM.supportEmail}`}>Ask for help</a>
              </Button>
            </div>
          </section>
        </main>
      </div>

      <footer className="border-t border-border">
        <div className="container flex flex-wrap items-center justify-between gap-2 py-6 text-xs text-subtle-foreground">
          <p>
            {PLATFORM.productName} &middot; {PLATFORM.productDescription}. A platform by {PLATFORM.builtBy}.
          </p>
          <p>
            Designed by {PLATFORM.designedBy.name}, {PLATFORM.designedBy.title}.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Layers; title: string }) {
  return (
    <h2 className="mb-5 flex items-center gap-2.5 text-xl font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg border border-brand/20 bg-brand-muted text-brand">
        <Icon className="size-4" aria-hidden />
      </span>
      {title}
    </h2>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
