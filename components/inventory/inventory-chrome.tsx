"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileEdit,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Send,
  Truck,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MoveType, ReorderReason, ShopOrderStatus } from "@/types/inventory";

const TABS = [
  { href: "/shop/inventory", label: "Items" },
  { href: "/shop/inventory/stock", label: "Stock on hand" },
  { href: "/shop/inventory/movements", label: "Item movements" },
  { href: "/shop/inventory/purchasing", label: "Receive PO" },
  { href: "/shop/inventory/counts", label: "Stock count" },
  { href: "/shop/inventory/transfers", label: "Transfers" },
  { href: "/shop/inventory/reorder", label: "Reorder" },
] as const;

/** The stock room's screens, one row of links above every one of them. */
export function InventoryTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Stock room" className="mb-6 flex flex-wrap gap-1 border-b border-border pb-3">
      {TABS.map((tab) => {
        const active = tab.href === "/shop/inventory" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-brand-muted text-brand" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

type Meta = { label: string; tone: BadgeProps["tone"]; icon: LucideIcon };

const ORDER_META: Record<ShopOrderStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: FileEdit },
  issued: { label: "Issued", tone: "brand", icon: Send },
  partially_received: { label: "Partly received", tone: "warning", icon: PackagePlus },
  received: { label: "Received", tone: "ok", icon: PackageCheck },
  cancelled: { label: "Cancelled", tone: "outline", icon: XCircle },
};

export function ShopOrderStatusBadge({ status }: { status: ShopOrderStatus }) {
  const meta = ORDER_META[status];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

const MOVE_META: Record<MoveType, Meta> = {
  opening: { label: "Opening", tone: "neutral", icon: CircleDashed },
  receipt: { label: "Receipt", tone: "ok", icon: ArrowDownToLine },
  issue: { label: "Issue", tone: "warning", icon: PackageMinus },
  return: { label: "Return", tone: "neutral", icon: Undo2 },
  adjustment: { label: "Adjustment", tone: "brand", icon: ClipboardCheck },
  transfer_out: { label: "Transfer out", tone: "neutral", icon: ArrowUpFromLine },
  transfer_in: { label: "Transfer in", tone: "neutral", icon: ArrowLeftRight },
  consumption: { label: "Consumed", tone: "warning", icon: PackageMinus },
};

export function MoveTypeBadge({ type }: { type: MoveType }) {
  const meta = MOVE_META[type];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon />
      {meta.label}
    </Badge>
  );
}

const REORDER_META: Record<ReorderReason, Meta> = {
  stockout: { label: "Out of stock", tone: "critical", icon: AlertTriangle },
  below_reorder_point: { label: "Below reorder point", tone: "warning", icon: AlertTriangle },
  forecast_shortfall: { label: "Forecast shortfall", tone: "warning", icon: Truck },
  ok: { label: "Covered", tone: "ok", icon: CheckCircle2 },
};

export function ReorderReasonBadge({ reason }: { reason: ReorderReason }) {
  const meta = REORDER_META[reason];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <Icon />
      {meta.label}
    </Badge>
  );
}
