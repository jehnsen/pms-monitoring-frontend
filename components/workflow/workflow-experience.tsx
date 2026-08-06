"use client";

import { useEffect, useState } from "react";
import {
  BellRing,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Wrench,
  Boxes,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PmsStatusBadge,
  PurchaseOrderStatusBadge,
  WorkOrderStatusBadge,
} from "@/components/status";
import { cn, formatCurrency } from "@/lib/utils";

const AUTOPLAY_MS = 6500;

/**
 * Each panel below is remounted (via a `key` on its wrapper) every time its
 * step becomes active, so a plain mount-triggered animation is enough —
 * no need to thread an `active` prop through for replay.
 */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Flips true one frame after mount, so opacity/transform transitions gated on it actually animate instead of painting their end state immediately. */
function useRevealed() {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return revealed;
}

function MockScreen({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card-raised w-full max-w-md overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-2/60 px-3.5 py-2.5">
        <span className="size-2 rounded-full bg-critical/40" />
        <span className="size-2 rounded-full bg-warning/50" />
        <span className="size-2 rounded-full bg-ok/40" />
        <span className="ml-2 text-2xs font-medium text-subtle-foreground">
          {label}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function TrackPanel() {
  const revealed = useRevealed();
  const km = useCountUp(44635, 1100);
  const pct = revealed ? 96 : 0;
  return (
    <MockScreen label="Vehicle · CAB 8845 · PMS schedule">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Engine oil &amp; filter change</p>
          <p className="mt-0.5 text-2xs text-subtle-foreground">
            Engine · every 5,000 km or 6 months
          </p>
        </div>
        <PmsStatusBadge status="due_soon" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-warning transition-[width] duration-[1100ms] ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-2xs">
        <div>
          <p className="text-subtle-foreground">Distance limit</p>
          <p className="tabular mt-0.5 font-medium text-foreground">
            {km.toLocaleString("en-US")} km
          </p>
        </div>
        <div>
          <p className="text-subtle-foreground">Governed by</p>
          <p className="mt-0.5 font-medium text-foreground">Distance</p>
        </div>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        Time limit projected onto the calendar via 42 km/day average use —
        whichever limit gets there first wins.
      </p>
    </MockScreen>
  );
}

function DetectPanel() {
  const revealed = useRevealed();
  const drop = useCountUp(52, 1300);
  const score = 92 - drop;
  return (
    <MockScreen label="Dashboard · Fleet overview">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">PMS health score</p>
        <span className="relative flex size-6 items-center justify-center">
          <BellRing className="size-4 text-muted-foreground" />
          <span
            className={cn(
              "absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-critical text-[9px] font-semibold text-white transition-opacity duration-500",
              revealed ? "opacity-100" : "opacity-0"
            )}
          >
            5
          </span>
        </span>
      </div>
      <p className="tabular mt-1 text-3xl font-semibold">
        {score}
        <span className="text-base font-normal text-subtle-foreground">/100</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-critical transition-[width] duration-[1300ms] ease-out"
          style={{ width: `${score}%` }}
        />
      </div>
      <div
        className={cn(
          "mt-3 flex flex-wrap gap-1.5 transition-opacity delay-700 duration-500",
          revealed ? "opacity-100" : "opacity-0"
        )}
      >
        <Badge tone="critical" size="sm">
          2 overdue
        </Badge>
        <Badge tone="warning" size="sm">
          3 due soon
        </Badge>
        <Badge tone="critical" size="sm">
          Compliance expiring
        </Badge>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        Alerts are derived on every read, never stored — they can&rsquo;t
        outlive their trigger, and a breached safety interval always pulls
        the score down hard.
      </p>
    </MockScreen>
  );
}

function DecidePanel() {
  const revealed = useRevealed();
  return (
    <MockScreen label="Work order · WO-2026-0142">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Brake pad &amp; rotor inspection</p>
        <Badge tone="serious" size="sm">
          Safety critical
        </Badge>
      </div>
      <p className="mt-1 text-2xs text-subtle-foreground">
        Estimate {formatCurrency(1800)} · above the ₱1,500 auto-approve threshold
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div
          className={cn(
            "transition-all duration-500",
            revealed ? "opacity-100" : "opacity-60"
          )}
        >
          <WorkOrderStatusBadge
            status={revealed ? "approved" : "pending_approval"}
          />
        </div>
        <ChevronRight className="size-3.5 text-subtle-foreground" />
        <span
          className={cn(
            "flex items-center gap-2 text-2xs text-muted-foreground transition-opacity delay-500 duration-500",
            revealed ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-brand-muted text-[9px] font-semibold text-brand">
            GV
          </span>
          Grace Villanueva · Fleet Manager
        </span>
      </div>
      <p className="mt-4 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        Capabilities decide who can approve, raise, or close — a denied
        action stays visible and dimmed, with a reason, never hidden.
      </p>
    </MockScreen>
  );
}

function ExecutePanel() {
  const active = useRevealed();
  const items = [
    "Brake pad & rotor inspection",
    "Brake fluid flush",
    "Tire rotation & pressure check",
  ];
  const timeline = ["Open", "Approved", "In progress", "Completed"];
  return (
    <MockScreen label="Close &amp; record service">
      <p className="text-2xs text-subtle-foreground">
        Odometer reading{" "}
        <span className="font-medium text-foreground">— empty —</span>
      </p>
      <p className="mt-0.5 text-2xs text-subtle-foreground">
        Last recorded: 44,310 km · 6 days ago
      </p>
      <p className="mt-3 text-2xs font-medium text-foreground">
        PMS intervals to reset
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item, i) => (
          <li key={item} className="flex items-center gap-2 text-2xs">
            <span
              className={cn(
                "flex size-3.5 shrink-0 items-center justify-center rounded border transition-all duration-300",
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border-strong bg-transparent"
              )}
              style={{ transitionDelay: `${i * 180}ms` }}
            >
              {active ? <Check className="size-2.5" /> : null}
            </span>
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
        {timeline.map((step, i) => (
          <div key={step} className="flex flex-1 items-center gap-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border text-[8px] font-semibold transition-all duration-300",
                  active
                    ? "border-ok bg-ok text-white"
                    : "border-border-strong text-subtle-foreground"
                )}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                {active ? <Check className="size-2.5" /> : i + 1}
              </span>
              <span className="whitespace-nowrap text-[9px] text-subtle-foreground">
                {step}
              </span>
            </div>
            {i < timeline.length - 1 ? (
              <span
                className={cn(
                  "h-px flex-1 bg-border-strong transition-colors duration-300",
                  active && "bg-ok"
                )}
                style={{ transitionDelay: `${i * 150}ms` }}
              />
            ) : null}
          </div>
        ))}
      </div>
    </MockScreen>
  );
}

function SupplyPanel() {
  const stock = useCountUp(22, 900);
  return (
    <MockScreen label="Demand forecast · Next 6 weeks">
      <table className="w-full text-2xs">
        <thead>
          <tr className="text-left text-subtle-foreground">
            <th className="pb-1.5 font-medium">Part</th>
            <th className="pb-1.5 text-right font-medium">Req.</th>
            <th className="pb-1.5 text-right font-medium">Stock</th>
            <th className="pb-1.5 text-right font-medium">Short</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr>
            <td className="py-1.5">Engine oil filter</td>
            <td className="tabular py-1.5 text-right">14</td>
            <td className="tabular py-1.5 text-right">8</td>
            <td className="tabular py-1.5 text-right font-medium text-critical">6</td>
          </tr>
          <tr>
            <td className="py-1.5">15W-40 (L)</td>
            <td className="tabular py-1.5 text-right">60</td>
            <td className="tabular py-1.5 text-right">40</td>
            <td className="tabular py-1.5 text-right font-medium text-critical">20</td>
          </tr>
          <tr>
            <td className="py-1.5">Brake pad set</td>
            <td className="tabular py-1.5 text-right">4</td>
            <td className="tabular py-1.5 text-right">3</td>
            <td className="tabular py-1.5 text-right font-medium text-warning">1</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-2xs text-subtle-foreground">Engine oil filter stock</span>
        <span className="flex items-center gap-2">
          <span className="tabular text-xs font-semibold">{stock}</span>
          <PurchaseOrderStatusBadge status="received" />
        </span>
      </div>
    </MockScreen>
  );
}

function ComplyPanel() {
  const active = useRevealed();
  const docs = [
    { label: "LTO registration", status: "expired" as const, date: "13 May 2026" },
    { label: "Comprehensive insurance", status: "expiring" as const, date: "03 Oct 2026" },
    { label: "Driver licence", status: "ok" as const, date: "24 Aug 2027" },
  ];
  return (
    <MockScreen label="Vehicle · CAB 8845 · Vehicle details">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-critical" />
        <p className="text-sm font-semibold">Compliance expired</p>
      </div>
      <ul className="mt-3 space-y-2">
        {docs.map((doc, i) => (
          <li
            key={doc.label}
            className={cn(
              "flex items-center justify-between text-2xs transition-all duration-500",
              active ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0"
            )}
            style={{ transitionDelay: `${i * 150}ms` }}
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  doc.status === "expired" && "bg-critical",
                  doc.status === "expiring" && "bg-warning",
                  doc.status === "ok" && "bg-ok"
                )}
              />
              {doc.label}
            </span>
            <span className="tabular text-subtle-foreground">{doc.date}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
        Plate-ending schedule: renews every{" "}
        <span className="font-medium text-foreground">May</span>. Folded into
        the same notification count as an overdue service.
      </p>
    </MockScreen>
  );
}

const STEPS = [
  {
    id: "track",
    kicker: "01 · Track",
    icon: Gauge,
    title: "Every vehicle, every interval, two limits at once",
    body: "Each PMS item carries a distance limit and a time limit — oil every 5,000 km or 6 months, brakes every 15,000 km or 12 months. The distance limit is projected onto the calendar using the vehicle's average daily use, so both limits live on one timeline.",
    bullets: [
      "Dual-limit intervals — km and months, not just one",
      "Distance projected onto the calendar via average daily km",
      "Whichever limit arrives first governs the due date",
    ],
    Panel: TrackPanel,
  },
  {
    id: "detect",
    kicker: "02 · Detect",
    icon: BellRing,
    title: "Health drops the moment something slips",
    body: "Alerts are derived on every read, never stored — they can't outlive their trigger. Two breached safety intervals pull the health score down hard on purpose; a vehicle carrying overdue safety work should never read like a 90-something.",
    bullets: [
      "Health score weights overdue safety items steeply",
      "Alerts recompute live — dismissals stick, staleness can't",
      "Dashboard tile and notification bell surface it early",
    ],
    Panel: DetectPanel,
  },
  {
    id: "decide",
    kicker: "03 · Decide",
    icon: ClipboardCheck,
    title: "A work order routes to the right approver, automatically",
    body: "Requests above a cost threshold need sign-off before a technician touches the vehicle; safety-critical lines are called out so they don't get lost inside a routine repair. Role-based capabilities decide who can approve, raise, or close.",
    bullets: [
      "Approval thresholds by cost and by safety classification",
      "Role-based capabilities, not a single admin toggle",
      "Denied actions stay visible, dimmed, with a reason",
    ],
    Panel: DecidePanel,
  },
  {
    id: "execute",
    kicker: "04 · Execute",
    icon: Wrench,
    title: "Closing the order resets every interval it actually touched",
    body: "A technician logs the odometer at close-out — never pre-filled, always checked against the last reading, with a confirmation gate on any jump that looks wrong. One shop visit often covers more than one job, so closing it lets them tick off every interval the visit satisfied.",
    bullets: [
      "Odometer entry validated against the last recorded reading",
      "Multi-interval reset — one visit can close several PMS items",
      "A real timeline: Open → Approved → In progress → Completed",
    ],
    Panel: ExecutePanel,
  },
  {
    id: "supply",
    kicker: "05 · Supply",
    icon: Boxes,
    title: "Tomorrow's parts order, projected from today's due dates",
    body: "The same due-date projection that drives the schedule also drives the parts list. Pick a horizon, and every part behind an upcoming service adds up against what's already in stock — skipping anything already covered by an open work order or purchase order.",
    bullets: [
      "Demand projected straight from the PMS schedule, not re-derived",
      "Shortfall flagged against lead time, not just against stock",
      "Selected rows become a draft purchase order, grouped by vendor",
    ],
    Panel: SupplyPanel,
  },
  {
    id: "comply",
    kicker: "06 · Comply",
    icon: ShieldCheck,
    title: "An expired registration takes the truck off the road",
    body: "Registration, CTPL, comprehensive insurance, emission testing, LTFRB franchise, and driver licences all carry their own expiry, tracked the same way a service interval is — red once expired, amber inside the warning window, and folded into the same notification count as everything else.",
    bullets: [
      "Every compliance document type a PH fleet actually carries",
      "LTO renewal month surfaced from the plate ending, not guessed",
      "Expiries feed the same alert feed as overdue service",
    ],
    Panel: ComplyPanel,
  },
];

function AutoplayBar({ playing, stepKey }: { playing: boolean; stepKey: number }) {
  const [fill, setFill] = useState(false);
  useEffect(() => {
    setFill(false);
    if (!playing) return;
    const raf = requestAnimationFrame(() => setFill(true));
    return () => cancelAnimationFrame(raf);
  }, [stepKey, playing]);
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className="h-full rounded-full bg-brand"
        style={{
          width: fill ? "100%" : "0%",
          transition: fill ? `width ${AUTOPLAY_MS}ms linear` : "none",
        }}
      />
    </div>
  );
}

export function WorkflowExperience() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

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
      {/* Step rail */}
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

      {/* Content */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div key={`copy-${step.id}`} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
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

      {/* Controls */}
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
          Restart the walkthrough
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-subtle-foreground">
        Step {active + 1} of {STEPS.length} — every closed order feeds
        tomorrow&rsquo;s forecast, and the cycle starts again.
      </p>
    </div>
  );
}

const HERO_STATS = [
  { label: "Vehicles tracked", value: 16, suffix: "" },
  { label: "PMS intervals monitored", value: 192, suffix: "" },
  { label: "Parts shortfall caught ahead of lead time", value: 6, suffix: " SKUs" },
  { label: "Compliance documents watched", value: 64, suffix: "" },
];

/** Small animated KPI strip for the hero — counts up once on mount. */
export function HeroStats() {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {HERO_STATS.map((stat) => (
        <HeroStat key={stat.label} {...stat} />
      ))}
    </dl>
  );
}

function HeroStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix: string;
}) {
  const count = useCountUp(value, 1400);
  return (
    <div className="card-raised px-4 py-3.5">
      <dt className="text-2xs text-subtle-foreground">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-semibold text-foreground">
        {count}
        {suffix}
      </dd>
    </div>
  );
}
