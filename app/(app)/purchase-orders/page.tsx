"use client";

import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function PurchaseOrdersPage() {
  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Formal POs issued against approved work orders."
      />
      <div className="card">
        <EmptyState
          icon={Receipt}
          title="Coming soon"
          description="Purchase orders will generate here once a line clears approval. For now, approved work stays visible on the Requests queue and each work order's own record."
          className="py-16"
        />
      </div>
    </>
  );
}
