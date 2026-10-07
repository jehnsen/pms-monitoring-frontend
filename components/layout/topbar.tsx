"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays, ChevronDown, LogOut, Menu, Search, User, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/layout/command-palette";
import { useAuthActions, useSession } from "@/lib/auth";
import { AlertsPanel } from "@/components/alerts/alerts-panel";
import { ROLE_LABEL } from "@/lib/rbac";
import { useFleet } from "@/lib/store";
import { homeHrefFor } from "@/lib/nav";
import { isProviderRole } from "@/lib/tenancy";

export function Topbar() {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const [mobileNav, setMobileNav] = React.useState(false);
  const { session } = useSession();
  const { signOut } = useAuthActions();
  const { tenant } = useFleet();
  const [today, setToday] = React.useState<string | null>(null);

  // The shell only renders behind AuthGuard, so a session is always present by
  // the time this paints; the fallback is purely for type narrowing.
  const user = session ?? { name: "Signed out", title: "—", role: "viewer" as const };

  // Rendered after mount so the server and client don't disagree about "today".
  React.useEffect(() => setToday(format(new Date(), "EEEE, dd MMMM yyyy")), []);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[76px] items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur-md sm:gap-3 lg:px-8">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => setMobileNav(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>

        <Link href={homeHrefFor(user.role)} className="min-w-0 [&>span>span:last-child]:hidden sm:[&>span>span:last-child]:flex lg:hidden">
          <Logo
            name={tenant.displayName}
            logoUrl={tenant.logoUrl}
            tagline={isProviderRole(user.role) ? "Service Centre" : "Fleet PMS"}
          />
        </Link>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search vehicles, work orders, and pages"
          className="ml-auto flex h-10 items-center gap-2.5 rounded-md border border-border bg-surface-2/60 px-3 text-sm text-subtle-foreground transition-colors hover:border-border-strong hover:text-muted-foreground lg:ml-0 lg:w-80"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden text-xs lg:inline">Search vehicles, work orders…</span>
          <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-medium text-subtle-foreground lg:flex">
            Ctrl K
          </kbd>
        </button>

        <p className="ml-auto hidden items-center gap-2 text-[11px] text-muted-foreground xl:flex">
          <CalendarDays className="size-3.5 text-subtle-foreground" />
          {today ?? ""}
        </p>

        <div className="flex items-center gap-1 lg:ml-auto xl:ml-2">
          <AlertsPanel />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label={`Account menu for ${user.name}`} className="ml-1 flex items-center gap-2.5 rounded-md py-1.5 pl-1 pr-2 transition-colors hover:bg-surface-2 sm:ml-2">
                <Avatar name={user.name} />
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-xs font-medium">{user.name}</span>
                  <span className="block text-[10px] text-subtle-foreground">
                    {user.title}
                  </span>
                </span>
                <ChevronDown className="hidden size-3.5 text-subtle-foreground md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
              {session ? (
                <p className="px-2 pb-1.5 text-2xs text-subtle-foreground">
                  {session.email}
                  <span className="mt-0.5 block font-medium text-muted-foreground">
                    {ROLE_LABEL[session.role]}
                  </span>
                </p>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User />
                  My profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <UserCog />
                  Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() => {
                  signOut();
                  router.replace("/login");
                }}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={open} onOpenChange={setOpen} />

      <Dialog open={mobileNav} onOpenChange={setMobileNav}>
        <DialogContent className="left-0 top-0 h-dvh max-h-dvh max-w-[280px] translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none rounded-r-xl border-chrome-border bg-chrome text-chrome-foreground [&>button]:text-chrome-muted">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Move between the monitoring, maintenance, and configuration areas.
          </DialogDescription>
          <div className="flex h-[76px] items-center border-b border-chrome-border px-5">
            <Logo tone="inverted" name={tenant.displayName} logoUrl={tenant.logoUrl} tagline={isProviderRole(user.role) ? "Service Centre" : "Fleet PMS"} />
          </div>
          <div className="overflow-y-auto">
            <SidebarNav onNavigate={() => setMobileNav(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
