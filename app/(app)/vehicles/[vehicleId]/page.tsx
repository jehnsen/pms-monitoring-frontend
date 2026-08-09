"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Car, Clock, Gauge, HeartPulse, ShieldAlert, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Meter } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PmsStatusBadge, VehicleStatusBadge } from "@/components/status";
import { PmsSchedule } from "@/components/vehicles/pms-schedule";
import { OdometerDialog } from "@/components/vehicles/odometer-dialog";
import { VehicleFormDialog } from "@/components/vehicles/vehicle-form-dialog";
import { NewWorkOrderDialog } from "@/components/work-orders/new-work-order-dialog";
import { WorkOrderTable } from "@/components/work-orders/work-order-table";
import { DocumentList } from "@/components/documents/document-list";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { SuccessDialog } from "@/components/ui/success-dialog";
import { useFleet } from "@/lib/store";
import { isOdometerStale, odometerAgeDays, workOrderCost } from "@/lib/pms";
import { plateEndingRenewalMonth, vehicleComplianceStatus } from "@/lib/compliance";
import {
  formatCurrency,
  formatDate,
  formatDayDelta,
  formatKm,
  formatRelative,
  titleCase,
} from "@/lib/utils";

export default function VehicleDetailPage({
  params,
}: {
  params: { vehicleId: string };
}) {
  return (
    <React.Suspense fallback={<VehicleDetailSkeleton />}>
      <VehicleDetailView params={params} />
    </React.Suspense>
  );
}

/**
 * `useSearchParams` (below, for `?created=1`) opts this subtree out of static
 * rendering, so it needs its own boundary — matching the pattern in
 * `vehicles/page.tsx` and `schedule/page.tsx` rather than pulling the whole
 * page into the client-only path.
 */
function VehicleDetailSkeleton() {
  return (
    <>
      <Skeleton className="h-8 w-64" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="mt-5 h-96" />
    </>
  );
}

function VehicleDetailView({ params }: { params: { vehicleId: string } }) {
  const { ready, healthById, workOrders, vehicles, documents } = useFleet();
  const router = useRouter();
  const searchParams = useSearchParams();

  // `?created=1` is set by VehicleFormDialog after a create-then-navigate —
  // its own dialog state doesn't survive the route change, so the
  // confirmation is deferred to here. Stripped from the URL immediately so a
  // refresh or share of the link doesn't replay it.
  const [showCreated, setShowCreated] = React.useState(false);
  React.useEffect(() => {
    if (searchParams.get("created") === "1") {
      setShowCreated(true);
      router.replace(`/vehicles/${params.vehicleId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/params.vehicleId are stable; keying on searchParams alone avoids re-running this on every render.
  }, [searchParams]);

  if (!ready) {
    return <VehicleDetailSkeleton />;
  }

  const entry = healthById.get(params.vehicleId);

  if (!entry) {
    return (
      <div className="card">
        <EmptyState
          icon={Car}
          title="Vehicle not found"
          description="This unit is no longer in the fleet, or the link is out of date."
          action={
            <Button asChild variant="secondary">
              <Link href="/vehicles">Back to vehicles</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { vehicle, items, nextItem } = entry;
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const staleReading = isOdometerStale(vehicle);
  const compliance = vehicleComplianceStatus(vehicle, documents);
  const renewalMonth = plateEndingRenewalMonth(vehicle.plateNumber);

  const orders = workOrders
    .filter((order) => order.vehicleId === vehicle.id)
    .sort((a, b) =>
      (b.completedOn ?? b.scheduledFor).localeCompare(a.completedOn ?? a.scheduledFor)
    );

  const vehicleDocuments = documents.filter(
    (doc) => doc.vehicleId === vehicle.id
  );

  const lifetimeSpend = orders
    .filter((order) => order.status === "closed")
    .reduce((total, order) => total + workOrderCost(order), 0);

  const openOrders = orders.filter(
    (order) => order.status !== "closed" && order.status !== "cancelled"
  );

  // The shop's liability record: every safety-critical line purchasing has
  // declined for this vehicle, permanent and always visible — never tucked
  // away in a tab.
  const declinedSafetyCritical = orders.flatMap((order) =>
    order.lines
      .filter((line) => line.urgency === "safety_critical" && line.approvalStatus === "declined")
      .map((line) => ({ order, line }))
  );

  const specs: { label: string; value: string }[] = [
    { label: "VIN", value: vehicle.vin },
    { label: "Class", value: titleCase(vehicle.vehicleClass) },
    { label: "Fuel", value: titleCase(vehicle.fuelType) },
    { label: "Colour", value: vehicle.color },
    { label: "Model year", value: String(vehicle.year) },
    { label: "Acquired", value: formatDate(vehicle.acquiredOn) },
    { label: "Assigned to", value: vehicle.assignedTo },
    { label: "Department", value: vehicle.department },
    { label: "Home site", value: vehicle.location },
    { label: "Average use", value: `${vehicle.avgDailyKm} km / day` },
    {
      label: "Registration expires",
      value: `${formatDate(vehicle.registrationExpiry)}${
        renewalMonth ? ` · renews every ${renewalMonth} (plate-ending schedule)` : ""
      }`,
    },
    { label: "Insurance expires", value: formatDate(vehicle.insuranceExpiry) },
    {
      label: "Driver licence expires",
      value: vehicle.driverLicenceExpiry ? formatDate(vehicle.driverLicenceExpiry) : "Not on file",
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Vehicles", href: "/vehicles" },
          { label: vehicle.plateNumber },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{vehicle.plateNumber}</span>
            <PmsStatusBadge status={entry.status} size="md" />
            {compliance !== "ok" ? (
              <Badge tone={compliance === "expired" ? "critical" : "warning"} size="md">
                <ShieldAlert />
                {compliance === "expired" ? "Compliance expired" : "Compliance expiring"}
              </Badge>
            ) : null}
          </span>
        }
        description={`${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.department} · ${vehicle.location}`}
        actions={
          <>
            <OdometerDialog vehicle={vehicle} />
            <NewWorkOrderDialog vehicleId={vehicle.id} />
          </>
        }
      />

      <SuccessDialog
        open={showCreated}
        onOpenChange={setShowCreated}
        title="Vehicle added"
        description={`${vehicle.plateNumber} — ${vehicle.year} ${vehicle.make} ${vehicle.model} — has been added to the fleet.`}
      />

      {declinedSafetyCritical.length > 0 ? (
        <div className="mb-5 rounded-lg border border-critical/25 bg-critical/[0.06] px-4 py-3.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-critical">
            <ShieldAlert className="size-4 shrink-0" />
            Safety-critical work declined — {declinedSafetyCritical.length}{" "}
            {declinedSafetyCritical.length === 1 ? "line" : "lines"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {declinedSafetyCritical.map(({ order, line }) => (
              <li key={line.id} className="text-xs leading-relaxed text-muted-foreground">
                <Link
                  href={`/work-orders/${order.id}`}
                  className="font-medium text-foreground transition-colors hover:text-brand"
                >
                  {line.description}
                </Link>
                {line.approvedAt ? ` · declined ${formatDate(line.approvedAt)}` : ""}
                {line.declineReason ? ` — ${line.declineReason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              PMS health score
            </p>
            <HeartPulse className="size-4 text-subtle-foreground" />
          </div>
          <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight">
            {entry.healthScore}
            <span className="ml-1 text-sm font-normal text-subtle-foreground">
              / 100
            </span>
          </p>
          <Meter
            className="mt-4"
            value={entry.healthScore / 100}
            tone={
              entry.healthScore >= 85
                ? "ok"
                : entry.healthScore >= 60
                  ? "warning"
                  : "critical"
            }
            label="PMS health score"
          />
          <p className="mt-2 text-2xs text-subtle-foreground">
            {entry.overdueCount} overdue · {entry.dueSoonCount} due soon
          </p>
        </div>

        <div className="card-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">Odometer</p>
            <Gauge className="size-4 text-subtle-foreground" />
          </div>
          <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight">
            {vehicle.odometer.toLocaleString("en-US")}
            <span className="ml-1 text-sm font-normal text-subtle-foreground">km</span>
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-2xs text-subtle-foreground">
            <span>
              Averaging {vehicle.avgDailyKm} km per day · read{" "}
              {formatRelative(vehicle.odometerReadAt)}
            </span>
            {staleReading ? (
              <Badge tone="warning">
                <Clock />
                Stale reading
              </Badge>
            ) : null}
          </p>
        </div>

        <div className="card-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Next service due
            </p>
            <VehicleStatusBadge status={vehicle.status} />
          </div>
          {nextItem ? (
            <>
              <p className="mt-3 truncate text-sm font-semibold tracking-tight">
                {nextItem.task.name}
              </p>
              {staleReading ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="tabular mt-1 text-xs text-subtle-foreground">
                      {formatDate(nextItem.dueDate)} ·{" "}
                      {formatDayDelta(nextItem.daysRemaining)}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    Projection based on a reading {odometerAgeDays(vehicle)} days
                    old.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="tabular mt-1 text-xs text-muted-foreground">
                  {formatDate(nextItem.dueDate)} · {formatDayDelta(nextItem.daysRemaining)}
                </p>
              )}
              <Meter
                className="mt-3"
                value={nextItem.progress}
                tone={
                  nextItem.status === "overdue"
                    ? "critical"
                    : nextItem.status === "due_soon"
                      ? "warning"
                      : "ok"
                }
                label="Next service interval progress"
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-subtle-foreground">
              No tracked intervals.
            </p>
          )}
        </div>

        <div className="card-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Lifetime maintenance
            </p>
            <Wallet className="size-4 text-subtle-foreground" />
          </div>
          <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight">
            {formatCurrency(lifetimeSpend)}
          </p>
          <p className="mt-4 text-2xs text-subtle-foreground">
            {orders.filter((o) => o.status === "closed").length} closed orders ·{" "}
            {openOrders.length} open
          </p>
        </div>
      </div>

      <Tabs defaultValue="schedule" className="mt-6">
        <TabsList>
          <TabsTrigger value="schedule">
            PMS schedule
            <span className="tabular ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">
              {items.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history">
            Service history
            <span className="tabular ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">
              {orders.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents
            <span className="tabular ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[10px]">
              {vehicleDocuments.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="details">Vehicle details</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <section className="card-raised">
            <header className="px-5 pb-3 pt-4">
              <h3 className="text-sm font-semibold tracking-tight">
                Tracked intervals
              </h3>
              <p className="mt-0.5 text-xs text-subtle-foreground">
                Ordered most urgent first. Each item is due on whichever limit —
                distance or time — arrives first.
              </p>
            </header>
            <div className="border-t border-border">
              <PmsSchedule vehicle={vehicle} items={items} isStale={staleReading} />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="history">
          <section className="card-raised">
            <header className="px-5 pb-3 pt-4">
              <h3 className="text-sm font-semibold tracking-tight">
                Work orders for {vehicle.plateNumber}
              </h3>
              <p className="mt-0.5 text-xs text-subtle-foreground">
                Every job raised against this unit, newest first.
              </p>
            </header>
            <div className="border-t border-border">
              <WorkOrderTable
                orders={orders}
                vehiclesById={vehiclesById}
                showVehicle={false}
                emptyTitle="No service history yet"
                emptyDescription="Nothing has been raised against this vehicle."
              />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="documents">
          <section className="card-raised">
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">
                  Documents for {vehicle.plateNumber}
                </h3>
                <p className="mt-0.5 text-xs text-subtle-foreground">
                  Registration, insurance, invoices, and service reports filed
                  against this unit.
                </p>
              </div>
              <UploadDocumentDialog vehicleId={vehicle.id} size="sm" />
            </header>
            <div className="border-t border-border">
              <DocumentList
                documents={vehicleDocuments}
                emptyTitle="No documents on file"
                emptyDescription="Upload the registration, policy, or a service report to start the record."
              />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="details">
          <section className="card-raised">
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
              <h3 className="text-sm font-semibold tracking-tight">
                Specification & assignment
              </h3>
              <VehicleFormDialog vehicle={vehicle} />
            </header>
            <dl className="grid gap-x-6 gap-y-4 border-t border-border px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
              {specs.map((spec) => (
                <div key={spec.label}>
                  <dt className="text-2xs uppercase tracking-wider text-subtle-foreground">
                    {spec.label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </TabsContent>
      </Tabs>
    </>
  );
}
