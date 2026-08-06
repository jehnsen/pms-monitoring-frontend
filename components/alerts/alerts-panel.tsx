"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  Contact,
  FileWarning,
  Hourglass,
  OctagonAlert,
  RotateCcw,
  Wrench,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAlerts, useFleetActions } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Alert, AlertKind } from "@/types";

const KIND_ICON: Record<AlertKind, typeof Bell> = {
  pms_overdue: OctagonAlert,
  pms_due_soon: Clock,
  work_order_overdue: Wrench,
  document_expiry: FileWarning,
  approval_sla_breach: Hourglass,
  driver_licence_expiry: Contact,
};

const SEVERITY_STYLE = {
  critical: "text-critical",
  warning: "text-foreground",
  info: "text-brand",
} as const;

function AlertRow({
  alert,
  read,
  onOpen,
  onDismiss,
}: {
  alert: Alert;
  read: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const Icon = KIND_ICON[alert.kind];

  return (
    <li className="group relative">
      <Link
        href={alert.href}
        onClick={onOpen}
        className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70"
      >
        {/* Unread is carried by the dot AND the weight of the title — never by
            colour alone. */}
        <span className="relative mt-0.5 shrink-0">
          <Icon className={cn("size-4", SEVERITY_STYLE[alert.severity])} />
          {!read ? (
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-brand ring-2 ring-surface" />
          ) : null}
        </span>

        <span className="min-w-0 flex-1 pr-6">
          <span
            className={cn(
              "block truncate text-xs",
              read ? "font-normal text-muted-foreground" : "font-medium"
            )}
          >
            {alert.title}
          </span>
          <span className="mt-0.5 block text-2xs leading-relaxed text-subtle-foreground">
            {alert.body}
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss: ${alert.title}`}
        className="absolute right-2 top-3 flex size-6 items-center justify-center rounded text-subtle-foreground opacity-0 transition-opacity hover:bg-surface-3 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

export function AlertsPanel() {
  const [open, setOpen] = React.useState(false);
  const { ready, visible, unread, unreadCount, dismissedCount } = useAlerts();
  const { markAlertsRead, dismissAlert, restoreAlerts } = useFleetActions();

  const readIds = React.useMemo(
    () => new Set(visible.filter((a) => !unread.includes(a)).map((a) => a.id)),
    [visible, unread]
  );

  const shown = visible.slice(0, 12);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          aria-label={
            unreadCount > 0
              ? `Alerts: ${unreadCount} unread`
              : "Alerts: none unread"
          }
        >
          <Bell className="size-4" />
          {ready && unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[9px] font-semibold leading-4 text-white ring-2 ring-page">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[380px] p-0">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold tracking-tight">Alerts</p>
            <p className="mt-0.5 text-2xs text-subtle-foreground">
              {visible.length === 0
                ? "Nothing needs attention"
                : `${visible.length} active · ${unreadCount} unread`}
            </p>
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAlertsRead(visible.map((a) => a.id))}
            >
              <CheckCheck />
              Mark all read
            </Button>
          ) : null}
        </header>

        {shown.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="All clear"
            description="No breached intervals, overdue jobs, or expiring documents."
            className="py-10"
          />
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {shown.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                read={readIds.has(alert.id)}
                onOpen={() => {
                  markAlertsRead([alert.id]);
                  setOpen(false);
                }}
                onDismiss={() => dismissAlert(alert.id)}
              />
            ))}
          </ul>
        )}

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-surface-2/50 px-4 py-2.5">
          <span className="text-2xs text-subtle-foreground">
            {visible.length > shown.length
              ? `${visible.length - shown.length} more not shown`
              : "Generated from live fleet data"}
          </span>
          {dismissedCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={restoreAlerts}>
              <RotateCcw />
              Restore {dismissedCount} dismissed
            </Button>
          ) : null}
        </footer>
      </PopoverContent>
    </Popover>
  );
}
