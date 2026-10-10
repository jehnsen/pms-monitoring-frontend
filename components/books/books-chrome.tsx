"use client";

import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useCan } from "@/lib/rbac";
import { formatPesos } from "@/lib/utils";
import type { AccountType, LedgerScope } from "@/types/ledger";

/** The books are the service centre's: staff with `ledger:view`. Anything else gets the reason, not a blank page. */
export function BooksGate({ children }: { children: React.ReactNode }) {
  const { can, reason, side } = useCan();
  if (side !== "staff" || !can("ledger:view")) {
    return (
      <div className="card">
        <EmptyState
          icon={BookOpen}
          title="The books aren't open to this role"
          description={side !== "staff" ? "Only the service centre sees its books." : reason("ledger:view")}
        />
      </div>
    );
  }
  return <>{children}</>;
}

/** What a report covers: every branch (consolidated), or the ones in view. */
export function ScopeNote({ scope }: { scope: LedgerScope }) {
  const names = scope.branches.map((b) => b.name).join(", ");
  return (
    <p className="text-2xs text-subtle-foreground">
      {scope.allBranches ? `Consolidated across every branch (${names}).` : `Branch${scope.branches.length === 1 ? "" : "es"} in view: ${names}.`}
    </p>
  );
}

const TYPE_LABEL: Record<AccountType, string> = { asset: "Asset", liability: "Liability", equity: "Equity", revenue: "Revenue", expense: "Expense" };

export function accountTypeLabel(type: AccountType): string {
  return TYPE_LABEL[type];
}

/** An amount in a debit or credit column: blank when nothing is there. */
export function Amount({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`tabular ${className}`}>{value === 0 ? "—" : formatPesos(value)}</span>;
}
