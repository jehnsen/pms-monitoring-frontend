"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  MoreHorizontal,
  Play,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriorityBadge, WorkOrderStatusBadge } from "@/components/status";
import { CompleteWorkOrderDialog } from "@/components/work-orders/complete-work-order-dialog";
import { useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { workOrderCost } from "@/lib/pms";
import type { Vehicle, WorkOrder } from "@/types";
import { cn, formatCurrency, formatDate, titleCase } from "@/lib/utils";

export function WorkOrderTable({
  orders,
  vehiclesById,
  emptyTitle = "No work orders",
  emptyDescription,
  showVehicle = true,
}: {
  orders: WorkOrder[];
  vehiclesById: Map<string, Vehicle>;
  emptyTitle?: string;
  emptyDescription?: string;
  showVehicle?: boolean;
}) {
  const { updateWorkOrder } = useFleetActions();
  const { can } = useCan();
  const [closing, setClosing] = React.useState<WorkOrder | null>(null);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {[
              "Reference",
              ...(showVehicle ? ["Vehicle"] : []),
              "Job",
              "Priority",
              "Status",
              "Scheduled",
              "Cost",
              "",
            ].map((heading, index) => (
              <th
                key={heading || index}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground",
                  heading === "Cost" && "text-right"
                )}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => {
            const vehicle = vehiclesById.get(order.vehicleId);
            const closed =
              order.status === "closed" || order.status === "cancelled";

            return (
              <tr
                key={order.id}
                className="transition-colors hover:bg-surface-2/50"
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`/work-orders/${order.id}`}
                    className="group/ref inline-flex flex-col rounded"
                  >
                    <span className="tabular text-xs font-medium group-hover/ref:text-brand">
                      {order.reference}
                    </span>
                    <span className="mt-0.5 block text-2xs text-subtle-foreground">
                      {titleCase(order.type)}
                    </span>
                  </Link>
                </td>

                {showVehicle ? (
                  <td className="whitespace-nowrap px-4 py-3">
                    {vehicle ? (
                      <Link
                        href={`/vehicles/${vehicle.id}`}
                        className="group inline-flex flex-col rounded"
                      >
                        <span className="text-xs font-medium group-hover:text-brand">
                          {vehicle.plateNumber}
                        </span>
                        <span className="text-2xs text-subtle-foreground">
                          {vehicle.make} {vehicle.model}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-xs text-subtle-foreground">—</span>
                    )}
                  </td>
                ) : null}

                <td className="max-w-[260px] px-4 py-3">
                  <p className="truncate text-xs font-medium">{order.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-subtle-foreground">
                    <Avatar name={order.technician} size="sm" />
                    <span className="truncate">{order.technician}</span>
                  </p>
                </td>

                <td className="px-4 py-3">
                  <PriorityBadge priority={order.priority} />
                </td>

                <td className="px-4 py-3">
                  <WorkOrderStatusBadge status={order.status} />
                </td>

                <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatDate(order.completedOn ?? order.scheduledFor)}
                </td>

                <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                  {formatCurrency(workOrderCost(order))}
                </td>

                <td className="px-2 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${order.reference}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel>{order.reference}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/work-orders/${order.id}`}>
                          <FileText />
                          Open service record
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={
                          order.status !== "scheduled" || !can("workorder:update")
                        }
                        onSelect={() =>
                          updateWorkOrder(order.id, { status: "in_progress" })
                        }
                      >
                        <Play />
                        Start job
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={
                          order.status !== "in_progress" || !can("workorder:complete")
                        }
                        onSelect={() => setClosing(order)}
                      >
                        <CheckCircle2 />
                        Close &amp; record service…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        disabled={closed || !can("workorder:update")}
                        onSelect={() =>
                          updateWorkOrder(order.id, { status: "cancelled" })
                        }
                      >
                        <XCircle />
                        Cancel work order
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {closing ? (
        <CompleteWorkOrderDialog
          order={closing}
          vehicle={vehiclesById.get(closing.vehicleId)}
          open={Boolean(closing)}
          onOpenChange={(next) => {
            if (!next) setClosing(null);
          }}
        />
      ) : null}
    </>
  );
}
