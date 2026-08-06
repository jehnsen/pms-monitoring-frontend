"use client";

import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function VendorsPage() {
  return (
    <>
      <PageHeader
        title="Vendors"
        description="Approved service providers the fleet buys from."
      />
      <div className="card">
        <EmptyState
          icon={Building2}
          title="Coming soon"
          description="A vendor directory — contact details, categories, and standing — will live here. Until then, each work order records its service provider directly."
          className="py-16"
        />
      </div>
    </>
  );
}
