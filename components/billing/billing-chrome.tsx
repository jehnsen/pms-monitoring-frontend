"use client";

import { CheckCircle2, CircleDollarSign, FileEdit, Send, XCircle, type LucideIcon } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/types/billing";

type Meta = { label: string; tone: BadgeProps["tone"]; icon: LucideIcon };

const INVOICE_META: Record<InvoiceStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: FileEdit },
  issued: { label: "Issued", tone: "brand", icon: Send },
  partially_paid: { label: "Partially paid", tone: "warning", icon: CircleDollarSign },
  paid: { label: "Paid", tone: "ok", icon: CheckCircle2 },
  void: { label: "Void", tone: "outline", icon: XCircle },
};

/** An invoice's status chip: icon and label, always together. */
export function InvoiceStatusBadge({ status, overdueDays = 0 }: { status: InvoiceStatus; overdueDays?: number }) {
  const meta = INVOICE_META[status];
  const Icon = meta.icon;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={meta.tone}>
        <Icon />
        {meta.label}
      </Badge>
      {overdueDays > 0 ? (
        <Badge tone="critical">
          <XCircle />
          {overdueDays} {overdueDays === 1 ? "day" : "days"} overdue
        </Badge>
      ) : null}
    </span>
  );
}

/** A label and an amount on one line, for totals blocks. */
export function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t border-border pt-2 text-sm font-semibold" : "flex justify-between gap-4 text-xs text-muted-foreground"}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
