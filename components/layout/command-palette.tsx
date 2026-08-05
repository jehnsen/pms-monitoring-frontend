"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Car, CornerDownLeft, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { PmsStatusBadge } from "@/components/status";
import { useFleet } from "@/lib/store";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";

interface Result {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { health } = useFleet();
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);

  const results = React.useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();

    const vehicles = health
      .filter((entry) => {
        if (!q) return false;
        const v = entry.vehicle;
        return `${v.plateNumber} ${v.make} ${v.model} ${v.assignedTo} ${v.department}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 6)
      .map<Result>((entry) => ({
        key: entry.vehicle.id,
        href: `/vehicles/${entry.vehicle.id}`,
        title: `${entry.vehicle.plateNumber} — ${entry.vehicle.make} ${entry.vehicle.model}`,
        subtitle: `${entry.vehicle.department} · ${entry.vehicle.assignedTo}`,
        icon: <Car className="size-4 text-subtle-foreground" />,
        trailing: <PmsStatusBadge status={entry.status} />,
      }));

    const pages = NAV_ITEMS.filter((item) =>
      q ? item.label.toLowerCase().includes(q) : true
    ).map<Result>((item) => ({
      key: item.href,
      href: item.href,
      title: item.label,
      subtitle: item.description,
      icon: <item.icon className="size-4 text-subtle-foreground" />,
    }));

    return [...vehicles, ...pages];
  }, [health, query]);

  // Reset the highlight whenever the candidate list changes underneath it.
  React.useEffect(() => setCursor(0), [query]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router]
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (c + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (c - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[cursor];
      if (target) go(target.href);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 grid-rows-[auto_minmax(0,1fr)]">
        <DialogTitle className="sr-only">Search the fleet</DialogTitle>
        <DialogDescription className="sr-only">
          Find a vehicle by plate, make, model, or assignee, or jump to a page.
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-subtle-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search plate, model, driver, or a page…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
          />
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-subtle-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            <ul>
              {results.map((result, index) => (
                <li key={result.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(result.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                      index === cursor ? "bg-surface-2" : "hover:bg-surface-2/60"
                    )}
                  >
                    {result.icon}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{result.title}</span>
                      <span className="block truncate text-2xs text-subtle-foreground">
                        {result.subtitle}
                      </span>
                    </span>
                    {result.trailing}
                    {index === cursor ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-subtle-foreground" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Registers the ⌘K / Ctrl+K shortcut and owns the palette's open state. */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}
