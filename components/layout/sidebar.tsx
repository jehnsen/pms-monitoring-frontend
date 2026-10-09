"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, OctagonAlert, Wrench } from "lucide-react";
import { homeHrefFor, navSectionsFor } from "@/lib/nav";
import { useBranding, useFleetSummary, useRequests } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

/** Pending lines the signed-in user may decide: the API's count (`GET /requests`). */
function useRequestsForMeCount() {
  const { side } = useCan();
  const { data } = useRequests({ enabled: side === "portal" });
  return data?.myPending.lineCount ?? 0;
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const requestsForMe = useRequestsForMeCount();
  const { side } = useCan();
  // The two sides get different section lists, not one list with items hidden.
  const sections = navSectionsFor(side);

  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-6 px-4 py-6">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-chrome-muted">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/shop" && pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors",
                      active
                        ? "bg-chrome-active/15 font-semibold text-chrome-active ring-1 ring-inset ring-chrome-active/15"
                        : "text-chrome-muted hover:bg-chrome-foreground/5 hover:text-chrome-foreground"
                    )}
                  >
                    {/* The active rail reads faster than a fill alone in peripheral vision. */}
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-chrome-active transition-opacity",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active
                          ? "text-chrome-active"
                          : "text-chrome-muted group-hover:text-chrome-foreground"
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.dynamicBadge === "requestsForMe" && requestsForMe > 0 ? (
                      <span className="tabular flex min-w-4 shrink-0 items-center justify-center rounded-full bg-critical px-1 text-[9px] font-semibold leading-4 text-critical-foreground">
                        {requestsForMe > 9 ? "9+" : requestsForMe}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Standing alert at the foot of the rail — the number that should never be ignored. */
function OverdueCallout() {
  const { side } = useCan();
  const { data: summary } = useFleetSummary();

  // Provider-side, "vehicles overdue" is every client's problem at once and
  // links into a fleet screen that side does not have. The shop's equivalent
  // standing number is the approval queue, which lives on its own dashboard.
  if (side !== "portal") return null;
  if (!summary || summary.overdue === 0) return null;

  return (
    <Link
      href="/schedule?status=overdue"
      className="mx-3 mb-4 block rounded-lg border border-critical/25 bg-critical/[0.06] p-3 transition-colors hover:bg-critical/10"
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-chrome-alert">
        <OctagonAlert className="size-4 shrink-0" />
        {summary.overdue} {summary.overdue === 1 ? "vehicle" : "vehicles"} overdue
      </span>
      <span className="mt-1 block text-2xs leading-relaxed text-chrome-muted">
        Past a service limit. Review and raise work orders.
      </span>
    </Link>
  );
}

export function Sidebar() {
  const tenant = useBranding();
  const { role, side } = useCan();
  const providerSide = side === "staff";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col border-r border-chrome-border bg-chrome text-chrome-foreground lg:flex">
      <div className="flex h-[76px] shrink-0 items-center border-b border-chrome-border px-6">
        <Link href={homeHrefFor(side, role)} className="rounded-md">
          <Logo
            tone="inverted"
            name={tenant.displayName}
            logoUrl={tenant.logoUrl}
            tagline={providerSide ? "Service Centre" : "Fleet PMS"}
          />
        </Link>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <SidebarNav />
        <OverdueCallout />
      </div>
      <div className="shrink-0 border-t border-chrome-border p-4">
        <Link href="/workflow" className="group flex items-center gap-3 rounded-lg border border-chrome-border bg-chrome-foreground/[0.03] p-3 transition-colors hover:bg-chrome-foreground/[0.07]">
          <Wrench className="size-4 shrink-0 text-chrome-active" />
          <span className="flex-1">
            <span className="block text-xs font-medium">Service workflow</span>
            <span className="mt-1 block text-[10px] text-chrome-muted">From check-in to handover</span>
          </span>
          <ArrowUpRight className="size-3.5 text-chrome-muted group-hover:text-chrome-foreground" />
        </Link>
        <p className="mt-4 text-center text-[9px] font-medium uppercase tracking-[0.16em] text-chrome-muted">Automotive service management</p>
      </div>
    </aside>
  );
}
