"use client";

import { Boxes } from "lucide-react";
import { InventoryTabs } from "@/components/inventory/inventory-chrome";
import { EmptyState } from "@/components/ui/empty-state";
import { useCan } from "@/lib/rbac";

/**
 * The shop's stock room: items, what is on the shelf, how it moved, what to
 * buy. Staff only, and `inventory:view` to read (the API enforces both; this
 * only keeps a session that could not read it from a wall of errors).
 */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const { can, reason, side } = useCan();

  if (side === "staff" && !can("inventory:view")) {
    return (
      <div className="card">
        <EmptyState icon={Boxes} title="The stock room isn't open to this role" description={reason("inventory:view")} />
      </div>
    );
  }

  return (
    <>
      <InventoryTabs />
      {children}
    </>
  );
}
