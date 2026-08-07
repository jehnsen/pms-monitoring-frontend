"use client";

import Link from "next/link";
import { startOfMonth } from "date-fns";
import { Building2, Car, Hourglass, Wallet, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Skeleton, StatSkeletonRow } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VehicleTable } from "@/components/vehicles/vehicle-table";
import { WorkOrderTable } from "@/components/work-orders/work-order-table";
import { ClientFormDialog } from "@/components/shop/client-form-dialog";
import { useFleet } from "@/lib/store";
import { rollupClients } from "@/lib/shop";
import { approvalSettingsForClient } from "@/lib/tenancy";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function ShopClientDetailPage({
  params,
}: {
  params: { clientId: string };
}) {
  const {
    ready,
    fleetClients,
    vehicles,
    workOrders,
    health,
    approvalSettings,
    providers,
  } = useFleet();

  if (!ready) {
    return (
      <>
        <Skeleton className="h-8 w-64" />
        <div className="mt-6">
          <StatSkeletonRow />
        </div>
        <Skeleton className="mt-5 h-96" />
      </>
    );
  }

  const client = fleetClients.find((entry) => entry.id === params.clientId);

  if (!client) {
    return (
      <div className="card">
        <EmptyState
          icon={Building2}
          title="Client not found"
          description="This fleet is no longer under this provider, or the link is out of date."
          action={
            <Button asChild variant="secondary">
              <Link href="/shop/clients">Back to clients</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const now = new Date();
  const [rollup] = rollupClients(
    [client],
    vehicles,
    workOrders,
    startOfMonth(now),
    now
  );

  const ownVehicles = vehicles.filter((v) => v.fleetClientId === client.id);
  const ownVehicleIds = new Set(ownVehicles.map((v) => v.id));
  const ownHealth = health.filter((entry) => ownVehicleIds.has(entry.vehicle.id));
  const ownOrders = workOrders
    .filter((order) => ownVehicleIds.has(order.vehicleId))
    .sort((a, b) =>
      (b.completedOn ?? b.scheduledFor).localeCompare(a.completedOn ?? a.scheduledFor)
    );

  const vehiclesById = new Map(ownVehicles.map((v) => [v.id, v]));

  // What this client's bands actually resolve to, overrides folded in.
  const effective = approvalSettingsForClient(client, approvalSettings);

  const overrides = client.approvalThresholdOverrides ?? {};

  const terms: { label: string; value: string; overridden?: boolean }[] = [
    { label: "Contract", value: client.contractTerms || "—" },
    { label: "Payment terms", value: `${client.paymentTermsDays} days` },
    { label: "Contact", value: client.contactName || "—" },
    { label: "Email", value: client.contactEmail || "—" },
    { label: "Client since", value: formatDate(client.createdAt) },
    {
      label: "Auto-approve under",
      value: formatCurrency(effective.autoApproveUnder),
      overridden: overrides.autoApproveUnder !== undefined,
    },
    {
      label: "Operations may approve up to",
      value: formatCurrency(effective.opsApprovalUnder),
      overridden: overrides.opsApprovalUnder !== undefined,
    },
    {
      label: "Approval SLA",
      value: `${effective.slaHours} working hours`,
      overridden: overrides.slaHours !== undefined,
    },
    {
      label: "Variance threshold",
      value: `${effective.varianceThresholdPct}%`,
      overridden: overrides.varianceThresholdPct !== undefined,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Clients", href: "/shop/clients" },
          { label: client.name },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {client.name}
            {client.status === "suspended" ? (
              <Badge tone="critical" size="md">
                Suspended
              </Badge>
            ) : null}
          </span>
        }
        description={client.contractTerms || "No contract terms recorded."}
        actions={<ClientFormDialog client={client} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Vehicles"
          value={`${rollup.vehicleCount}`}
          hint={`${ownHealth.filter((h) => h.status === "overdue").length} overdue on PMS`}
          icon={Car}
          tone="brand"
        />
        <StatTile
          label="Open jobs"
          value={`${rollup.openWorkOrders}`}
          hint="Active on the floor or awaiting approval"
          icon={Wrench}
          tone={rollup.openWorkOrders > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Approval turnaround"
          value={rollup.avgApprovalHours === null ? "—" : `${rollup.avgApprovalHours}h`}
          hint="Mean business hours from quote to decision"
          icon={Hourglass}
          tone="brand"
        />
        <StatTile
          label="Spend this month"
          value={formatCurrency(rollup.spendThisPeriod)}
          hint={`${formatCurrency(rollup.outstanding)} uncollected`}
          icon={Wallet}
          tone="brand"
        />
      </div>

      <Tabs defaultValue="vehicles" className="mt-6">
        <TabsList>
          <TabsTrigger value="vehicles">
            Vehicles
            <span className="tabular ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">
              {ownVehicles.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history">
            Work orders
            <span className="tabular ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">
              {ownOrders.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="terms">Contract & bands</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <section className="card-raised">
            {ownHealth.length === 0 ? (
              <EmptyState
                icon={Car}
                title="No vehicles on this account"
                description="Nothing has been added to this client's fleet yet."
                className="py-12"
              />
            ) : (
              <VehicleTable entries={ownHealth} />
            )}
          </section>
        </TabsContent>

        <TabsContent value="history">
          <section className="card-raised">
            <WorkOrderTable
              orders={ownOrders}
              vehiclesById={vehiclesById}
              emptyTitle="No work orders yet"
              emptyDescription="Nothing has been raised against this client's vehicles."
            />
          </section>
        </TabsContent>

        <TabsContent value="terms">
          <section className="card-raised">
            <header className="px-5 pb-3 pt-4">
              <h3 className="text-sm font-semibold tracking-tight">
                Contract and approval bands
              </h3>
              <p className="mt-0.5 text-xs text-subtle-foreground">
                Bands marked as negotiated override the provider&apos;s defaults;
                everything else inherits them.
              </p>
            </header>
            <dl className="grid gap-x-6 gap-y-4 border-t border-border px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
              {terms.map((entry) => (
                <div key={entry.label}>
                  <dt className="text-2xs uppercase tracking-wider text-subtle-foreground">
                    {entry.label}
                  </dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
                    {entry.value}
                    {entry.overridden ? (
                      <Badge tone="brand">Negotiated</Badge>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </TabsContent>
      </Tabs>
    </>
  );
}
