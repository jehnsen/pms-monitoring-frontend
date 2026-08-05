"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Bell, ChevronDown, LogOut, Menu, Search, UserCog } from "lucide-react";
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
import { useFleet } from "@/lib/store";

const CURRENT_USER = { name: "Jehnsen Ricardo", role: "Fleet Manager" };

export function Topbar() {
  const { open, setOpen } = useCommandPalette();
  const [mobileNav, setMobileNav] = React.useState(false);
  const { ready, summary } = useFleet();
  const [today, setToday] = React.useState<string | null>(null);

  // Rendered after mount so the server and client don't disagree about "today".
  React.useEffect(() => setToday(format(new Date(), "EEEE, dd MMMM yyyy")), []);

  const alerts = ready ? summary.overdue + summary.dueSoon : 0;

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

        <Link href="/dashboard" className="lg:hidden">
          <Logo />
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
          <Link
            href="/schedule"
            className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-label={`${alerts} maintenance alerts`}
          >
            <Bell className="size-4" />
            {alerts > 0 ? (
              <span className="absolute right-1 top-1 flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-critical opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-critical ring-2 ring-page" />
              </span>
            ) : null}
          </Link>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-surface-2">
                <Avatar name={CURRENT_USER.name} />
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-xs font-medium">
                    {CURRENT_USER.name}
                  </span>
                  <span className="block text-[10px] text-subtle-foreground">
                    {CURRENT_USER.role}
                  </span>
                </span>
                <ChevronDown className="hidden size-3.5 text-subtle-foreground md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{CURRENT_USER.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <UserCog />
                  Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>
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
            <Logo />
          </div>
          <div className="overflow-y-auto">
            <SidebarNav onNavigate={() => setMobileNav(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
