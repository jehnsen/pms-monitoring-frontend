"use client";

import Link from "next/link";
import { startOfMonth } from "date-fns";
import { Building2, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ClientFormDialog } from "@/components/shop/client-form-dialog";
import { useFleet } from "@/lib/store";
import { rollupClients } from "@/lib/shop";
import { formatCurrency } from "@/lib/utils";

const HEADINGS = [
  "Client",
  "Vehicles",
  "Open jobs",
  "Approval turnaround",
  "Spend this month",
  "Outstanding",
  "Terms",
  "",
];

export default function ShopClientsPage() {
  const { ready, fleetClients, vehicles, workOrders } = useFleet();

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Clients"
          description="Every fleet this shop looks after."
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  const now = new Date();
  const rollups = rollupClients(
    fleetClients,
    vehicles,
    workOrders,
    startOfMonth(now),
    now
  ).sort((a, b) => b.spendThisPeriod - a.spendThisPeriod);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Every fleet this shop looks after, and what each is worth."
        actions={<ClientFormDialog />}
      />

      {rollups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Building2}
            title="No clients yet"
            description="Onboard a fleet to start booking work against it."
            action={<ClientFormDialog />}
          />
        </div>
      ) : (
        <div className="card-raised">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {HEADINGS.map((heading, index) => (
                    <th
                      key={heading || index}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground ${
                        heading === "Spend this month" || heading === "Outstanding"
                          ? "text-right"
                          : ""
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rollups.map((row) => (
                  <tr
                    key={row.client.id}
                    className="group transition-colors hover:bg-surface-2/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/shop/clients/${row.client.id}`}
                        className="block rounded"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium group-hover:text-brand">
                          {row.client.name}
                          {row.client.status === "suspended" ? (
                            <Badge tone="critical">Suspended</Badge>
                          ) : null}
                          {row.client.approvalThresholdOverrides ? (
                            <Badge tone="neutral">Custom bands</Badge>
                          ) : null}
                        </span>
                        <span className="block truncate text-2xs text-subtle-foreground">
                          {row.client.contactName || "No contact on file"}
                        </span>
                      </Link>
                    </td>
                    <td className="tabular px-4 py-3 text-xs text-muted-foreground">
                      {row.vehicleCount}
                    </td>
                    <td className="tabular px-4 py-3 text-xs text-muted-foreground">
                      {row.openWorkOrders}
                    </td>
                    <td className="tabular px-4 py-3 text-xs text-muted-foreground">
                      {row.avgApprovalHours === null
                        ? "—"
                        : `${row.avgApprovalHours}h`}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                      {formatCurrency(row.spendThisPeriod)}
                    </td>
                    <td
                      className={`tabular whitespace-nowrap px-4 py-3 text-right text-xs ${
                        row.outstanding > 0
                          ? "font-medium text-foreground"
                          : "text-subtle-foreground"
                      }`}
                    >
                      {formatCurrency(row.outstanding)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-2xs text-subtle-foreground">
                      {row.client.paymentTermsDays} days
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Link
                        href={`/shop/clients/${row.client.id}`}
                        aria-label={`Open ${row.client.name}`}
                        className="inline-flex size-7 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 text-2xs leading-relaxed text-subtle-foreground">
        Outstanding is delivered work that has not been collected. There is no
        billing model in this build, so it is not an invoice ledger.
      </p>
    </>
  );
}
