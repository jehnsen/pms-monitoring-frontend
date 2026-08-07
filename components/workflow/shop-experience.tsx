"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  PackageCheck,
  Pause,
  Play,
  RotateCcw,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PmsStatusBadge, WorkOrderStatusBadge } from "@/components/status";
import {
  AUTOPLAY_MS,
  AutoplayBar,
  MockScreen,
  useCountUp,
  useRevealed,
} from "@/components/workflow/workflow-experience";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * The provider's own loop, told the same way the client-side walkthrough is
 * — but it is not the same story with the labels swapped. The fleet client
 * asks "is my vehicle compliant"; the shop asks "what's on my floor, from
 * everyone, and what's it worth" — same records, scoped at the source
 * (`lib/tenancy.ts`), never merged and never a client-side filter.
 */

function CheckInPanel() {
  const revealed = useRevealed();
  const km = useCountUp(88420, 1000);
  return (
    <MockScreen label="Shop · Check in">
      <p className="text-2xs text-subtle-foreground">Search plate</p>
      <div className="mt-1 flex items-center justify-between rounded-md border border-border bg-surface-2/60 px-2.5 py-1.5">
        <span className="tabular text-xs font-medium">NWL 1201</span>
        <span className="text-2xs text-subtle-foreground">Northwind Logistics</span>
      </div>
      <p className="mt-3 text-2xs text-subtle-foreground">
        Isuzu N-Series NPR · odometer now
      </p>
      <p
        className={cn(
          "tabular mt-0.5 text-lg font-semibold transition-colors duration-500",
          revealed ? "text-foreground" : "text-subtle-foreground"
        )}
      >
        {revealed ? km.toLocaleString("en-US") : "— required —"}
        {revealed ? <span className="ml-1 text-xs font-normal text-subtle-foreground">km</span> : null}
      </p>
      <div
        className={cn(
          "mt-3 flex items-center justify-between rounded-md border border-critical/25 bg-critical/[0.06] px-2.5 py-1.5 transition-opacity delay-500 duration-500",
          revealed ? "opacity-100" : "opacity-0"
        )}
      >
        <span className="text-2xs font-medium text-foreground">
          Engine oil &amp; filter change
        </span>
        <PmsStatusBadge status="overdue" />
      </div>
      <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        The search reaches every client&rsquo;s fleet, not one. The reading is
        required before anything else can happen — it&rsquo;s the one moment
        it&rsquo;s certain.
      </p>
    </MockScreen>
  );
}

function QuotePanel() {
  const revealed = useRevealed();
  const lines = [
    { label: "Engine oil & filter change", cost: 3850 },
    { label: "Air filter replacement", cost: 1900 },
  ];
  const total = lines.reduce((sum, l) => sum + l.cost, 0);
  return (
    <MockScreen label="Work order · WO-2026-0512">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Northwind Logistics · NWL 1201</p>
        <WorkOrderStatusBadge status={revealed ? "pending_approval" : "draft"} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {lines.map((line) => (
          <li key={line.label} className="flex items-center justify-between text-2xs">
            <span className="text-muted-foreground">{line.label}</span>
            <span className="tabular font-medium text-foreground">
              {formatCurrency(line.cost)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-2xs font-medium text-foreground">Total</span>
        <span className="tabular text-sm font-semibold">{formatCurrency(total)}</span>
      </div>
      <div
        className={cn(
          "mt-3 flex items-center gap-1.5 text-2xs transition-opacity delay-500 duration-500",
          revealed ? "opacity-100 text-foreground" : "opacity-0"
        )}
      >
        <Send className="size-3 text-brand" />
        Sent — the client&rsquo;s clock starts now.
      </div>
      <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        A draft is the shop&rsquo;s own quote until someone sends it. Under
        Northwind&rsquo;s own auto-approve ceiling, it would have cleared
        itself instead.
      </p>
    </MockScreen>
  );
}

function BoardPanel() {
  const revealed = useRevealed();
  const rows = [
    { plate: "CAB 8845", client: "Actimed", bay: "Bay 1", status: "in_progress" as const },
    { plate: "NWL 1201", client: "Northwind", bay: "Bay 3", status: "pending_approval" as const },
    { plate: "SGR 8802", client: "Sagrada", bay: "Bay 5", status: "scheduled" as const },
  ];
  return (
    <MockScreen label="Job queue · every client">
      <table className="w-full text-2xs">
        <thead>
          <tr className="text-left text-subtle-foreground">
            <th className="pb-1.5 font-medium">Vehicle</th>
            <th className="pb-1.5 font-medium">Client</th>
            <th className="pb-1.5 font-medium">Bay</th>
            <th className="pb-1.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr
              key={row.plate}
              className={cn(
                "transition-all duration-500",
                revealed ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0"
              )}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <td className="tabular py-1.5 font-medium text-foreground">{row.plate}</td>
              <td className="py-1.5 text-muted-foreground">{row.client}</td>
              <td className="py-1.5 text-muted-foreground">{row.bay}</td>
              <td className="py-1.5 text-right">
                <WorkOrderStatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        Three clients, one board. Sign in as any one of them instead and the
        other two rows aren&rsquo;t hidden — they were never sent.
      </p>
    </MockScreen>
  );
}

function ReleasePanel() {
  const active = useRevealed();
  const orders = ["WO-2026-0498", "WO-2026-0501"];
  return (
    <MockScreen label="Check out · NWL 1201">
      <p className="text-2xs font-medium text-foreground">Work orders on this vehicle</p>
      <ul className="mt-1.5 space-y-1.5">
        {orders.map((ref, i) => (
          <li key={ref} className="flex items-center gap-2 text-2xs">
            <span
              className={cn(
                "flex size-3.5 shrink-0 items-center justify-center rounded border transition-all duration-300",
                active ? "border-ok bg-ok text-white" : "border-border-strong bg-transparent"
              )}
              style={{ transitionDelay: `${i * 180}ms` }}
            >
              {active ? <Check className="size-2.5" /> : null}
            </span>
            <span className="tabular text-muted-foreground">{ref}</span>
            <span className="ml-auto">
              <WorkOrderStatusBadge status="closed" />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-2xs text-subtle-foreground">Total</span>
        <span className="tabular text-sm font-semibold">{formatCurrency(5750)}</span>
      </div>
      <div
        className={cn(
          "mt-3 flex items-center gap-1.5 text-2xs transition-opacity delay-500 duration-500",
          active ? "opacity-100 text-foreground" : "opacity-0"
        )}
      >
        <PackageCheck className="size-3 text-ok" />
        Collected · Divina Lacson · just now
      </div>
      <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        Release is blocked while any order on the vehicle is still open —
        closed isn&rsquo;t the same as gone. Revenue counts from here, not
        from when the job finished.
      </p>
    </MockScreen>
  );
}

const STEPS = [
  {
    id: "checkin",
    kicker: "01 · Check in",
    icon: DoorOpen,
    title: "One counter, any client's vehicle",
    body: "The advisor doesn't search inside one fleet — the search reaches every vehicle this shop looks after. Confirm the client, capture the odometer, and the PMS engine says what's actually due before anyone has to ask.",
    bullets: [
      "Search spans every client's fleet, not just one",
      "Odometer capture is required — the one moment the reading is certain",
      "Overdue and due-soon items surface pre-selected, ready to offer",
    ],
    Panel: CheckInPanel,
  },
  {
    id: "quote",
    kicker: "02 · Quote & send",
    icon: Send,
    title: "A quote is a draft until someone sends it",
    body: "Selected services become a priced work order that sits with the shop. Nothing has been asked of the client yet — that starts the moment the advisor sends it, and from there the wait is on the record, not on memory.",
    bullets: [
      "Priced from the catalogue, bay and technician already assigned",
      "Sending stamps the approval log — the client's clock starts here",
      "Under that client's own auto-approve ceiling, it clears itself instantly",
    ],
    Panel: QuotePanel,
  },
  {
    id: "board",
    kicker: "03 · One board",
    icon: ClipboardList,
    title: "Every client's work, one queue — never merged",
    body: "The shop sees the whole floor: Actimed's brake job next to Northwind's truck next to Sagrada's ambulance, filterable by bay or technician. Sign in as one of those clients instead, and the other two rows simply aren't there.",
    bullets: [
      "Cross-client queue: filter by client, bay, technician, or status",
      "A fleet manager's own view of this same data shows one row, not three",
      "Scoped at the source — never a client-side filter switch",
    ],
    Panel: BoardPanel,
  },
  {
    id: "release",
    kicker: "04 · Release",
    icon: PackageCheck,
    title: "Closed isn't the same as gone",
    body: "A finished job still sits on the lot until someone confirms every order on that vehicle is actually done, and releases it — stamped with who let it go, and exactly when. Until then, it's the shop's own money, parked outside.",
    bullets: [
      "Blocks release while any job on the vehicle is still open",
      "Collection is stamped with who and when — never assumed",
      "Revenue counts on collection, not on completion",
    ],
    Panel: ReleasePanel,
  },
];

export function ShopWorkflowExperience() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setActive((s) => (s + 1) % STEPS.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [playing]);

  function goTo(index: number) {
    setActive(((index % STEPS.length) + STEPS.length) % STEPS.length);
    setPlaying(false);
  }

  const step = STEPS[active];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          const isDone = i < active;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300",
                isActive
                  ? "border-brand bg-brand text-brand-foreground shadow-sm"
                  : isDone
                    ? "border-ok/30 bg-ok/10 text-ok"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2"
              )}
            >
              {isDone ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Icon className="size-3.5" />
              )}
              <span className="hidden sm:inline">{s.kicker.split(" · ")[1]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <AutoplayBar playing={playing} stepKey={active} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div key={`copy-${step.id}`} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {step.kicker}
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {step.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {step.body}
          </p>
          <ul className="mt-5 space-y-2.5">
            {step.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" />
                <span className="text-foreground/90">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          key={`panel-${step.id}`}
          className="flex animate-in fade-in-0 slide-in-from-right-4 justify-center duration-500 lg:justify-end"
        >
          <step.Panel />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous step"
            onClick={() => goTo(active - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause /> : <Play />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next step"
            onClick={() => goTo(active + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <button
          type="button"
          onClick={() => {
            setActive(0);
            setPlaying(true);
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-subtle-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          Restart
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-subtle-foreground">
        Step {active + 1} of {STEPS.length} — a fleet manager never sees this
        board at all; they see one row of it, scoped from the same records.
      </p>
    </div>
  );
}
