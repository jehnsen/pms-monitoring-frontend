"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronDown, LogOut, Menu, Search, User, UserCog } from "lucide-react";
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
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-page/85 px-4 backdrop-blur-md lg:px-8">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => setMobileNav(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>

        <Link href={homeHrefFor(user.role)} className="lg:hidden">
          <Logo
            name={tenant.displayName}
            logoUrl={tenant.logoUrl}
            tagline={isProviderRole(user.role) ? "Service Centre" : "Fleet PMS"}
          />
        </Link>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-subtle-foreground shadow-xs transition-colors hover:border-border-strong hover:text-muted-foreground lg:ml-0 lg:w-72"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden lg:inline">Search fleet…</span>
          <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-medium text-subtle-foreground lg:flex">
            ⌘K
          </kbd>
        </button>

        <p className="ml-auto hidden text-xs text-subtle-foreground xl:block">
          {today ?? ""}
        </p>

        <div className="flex items-center gap-1">
          <AlertsPanel />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-surface-2">
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
        <DialogContent className="left-0 top-0 h-full max-w-[280px] translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] rounded-none rounded-r-xl">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Move between the monitoring, maintenance, and configuration areas.
          </DialogDescription>
          <div className="flex h-14 items-center border-b border-border px-5">
            <Logo name={tenant.displayName} logoUrl={tenant.logoUrl} />
          </div>
          <div className="overflow-y-auto">
            <SidebarNav onNavigate={() => setMobileNav(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
