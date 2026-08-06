"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OctagonAlert } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav";
import { useFleet } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { canApprove, pendingValue } from "@/lib/approvals";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

/** Pending lines the signed-in user is actually authorised to approve. */
function useRequestsForMeCount() {
  const { ready, workOrders, approvalSettings } = useFleet();
  const { role } = useCan();

  if (!ready || !role) return 0;

  let count = 0;
  for (const order of workOrders) {
    if (order.status !== "pending_approval") continue;
    const orderPendingValue = pendingValue(order.lines);
    if (!canApprove(role, orderPendingValue, approvalSettings)) continue;
    count += order.lines.filter((line) => line.approvalStatus === "pending").length;
  }
  return count;
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const requestsForMe = useRequestsForMeCount();

  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle-foreground">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-surface-2 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground"
                    )}
                  >
                    {/* The active rail reads faster than a fill alone in peripheral vision. */}
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand transition-opacity",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active
                          ? "text-brand"
                          : "text-subtle-foreground group-hover:text-muted-foreground"
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.dynamicBadge === "requestsForMe" && requestsForMe > 0 ? (
                      <span className="tabular flex min-w-4 shrink-0 items-center justify-center rounded-full bg-critical px-1 text-[9px] font-semibold leading-4 text-white">
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
  const { ready, summary } = useFleet();

  if (!ready || summary.overdue === 0) return null;

  return (
    <Link
      href="/schedule?status=overdue"
      className="mx-3 mb-4 block rounded-lg border border-critical/25 bg-critical/[0.06] p-3 transition-colors hover:bg-critical/10"
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-critical">
        <OctagonAlert className="size-4 shrink-0" />
        {summary.overdue} {summary.overdue === 1 ? "vehicle" : "vehicles"} overdue
      </span>
      <span className="mt-1 block text-2xs leading-relaxed text-muted-foreground">
        Past a service limit. Review and raise work orders.
      </span>
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/dashboard" className="rounded-md">
          <Logo />
        </Link>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <SidebarNav />
        <OverdueCallout />
      </div>
    </aside>
  );
}
