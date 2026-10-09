"use client";

import * as React from "react";
import { Building2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DeniedAction } from "@/components/auth/denied-action";
import { VendorFormDialog } from "@/components/settings/vendor-form-dialog";
import { QueryError } from "@/components/ui/query-error";
import { useFleetActions, useVendors } from "@/lib/store";
import { useCan } from "@/lib/rbac";

/**
 * The provider's approved vendor list. Shop-wide like the technician roster
 * and the PMS interval catalogue — a fleet client's work order can name a
 * vendor but not add to this list (`settings:manage`, staff only).
 */
export default function ShopVendorsPage() {
  const { vendors, isSuccess: ready, error, refetch } = useVendors();
  const { deleteVendor } = useFleetActions();
  const { canAsStaff, staffReason } = useCan();
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

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

      {deleteError ? (
        <p role="alert" className="mb-5 rounded-lg border border-critical/25 bg-critical/[0.06] px-4 py-3 text-xs text-critical">
          {deleteError}
        </p>
      ) : null}

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
                  {canAsStaff("settings:manage") ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${vendor.name}`}
                      onClick={async () => {
                        if (
                          window.confirm(
                            `Remove "${vendor.name}" from the vendor list? Past work orders keep their record of who did the job.`
                          )
                        ) {
                          setDeleteError(null);
                          const result = await deleteVendor(vendor.id);
                          if (!result.ok) setDeleteError(`${vendor.name}: ${result.error}`);
                        }
                      }}
                    >
                      <Trash2 className="text-critical" />
                    </Button>
                  ) : (
                    <DeniedAction reason={staffReason("settings:manage")}>
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
