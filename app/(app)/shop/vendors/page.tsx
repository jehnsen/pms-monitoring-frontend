"use client";

import { Building2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DeniedAction } from "@/components/auth/denied-action";
import { VendorFormDialog } from "@/components/settings/vendor-form-dialog";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";

/**
 * The provider's approved vendor list. Shop-wide like the technician roster
 * and the PMS interval catalogue — a fleet client's work order can name a
 * vendor but not add to this list; see `settings:manage` and
 * `pms_vendors`' RLS policies.
 */
export default function ShopVendorsPage() {
  const { ready, vendors } = useFleet();
  const { deleteVendor } = useFleetActions();
  const { can, reason } = useCan();

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Vendors"
          description="Approved repair vendors, shared across every fleet client."
        />
        <Skeleton className="h-64" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Approved repair vendors, shared across every fleet client this provider serves."
        actions={<VendorFormDialog />}
      />

      {vendors.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Building2}
            title="No vendors yet"
            description="Add a repair vendor so it can be selected on a work order."
            action={<VendorFormDialog />}
          />
        </div>
      ) : (
        <section className="card-raised">
          <div className="divide-y divide-border">
            {vendors.map((vendor) => (
              <div
                key={vendor.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium">{vendor.name}</span>
                  {!vendor.active ? <Badge tone="outline">Inactive</Badge> : null}
                </span>
                <span className="inline-flex items-center gap-1">
                  <VendorFormDialog vendor={vendor} />
                  {can("settings:manage") ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${vendor.name}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove "${vendor.name}" from the vendor list? Past work orders keep their record of who did the job.`
                          )
                        ) {
                          deleteVendor(vendor.id);
                        }
                      }}
                    >
                      <Trash2 className="text-critical" />
                    </Button>
                  ) : (
                    <DeniedAction reason={reason("settings:manage")}>
                      <Button variant="ghost" size="sm" aria-label={`Remove ${vendor.name}`}>
                        <Trash2 />
                      </Button>
                    </DeniedAction>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
