"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Plus, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { formatDay } from "@/components/detailing/booking-status";
import { ToolStatusBadge } from "@/components/equipment/equipment-chips";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useEquipmentBoard, useEquipmentOptions } from "@/lib/equipment";
import { useCan } from "@/lib/rbac";
import { formatPesos } from "@/lib/utils";
import type { Equipment } from "@/types/equipment";

/**
 * The asset register: what each tool IS (make, serial, where it lives, what
 * it cost, its warranty, how it is metered and its service plan), as against
 * the health board, which says how it is doing. Adding and editing happen
 * here; nothing on this page is a reading.
 */
export default function EquipmentRegisterPage() {
  const { data, error, isSuccess, refetch } = useEquipmentBoard();
  const options = useEquipmentOptions();
  const { can, reason } = useCan();
  const manages = can("equipment:manage");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<Equipment | "new" | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  const gate = (node: React.ReactElement) => (manages ? node : <DeniedAction reason={reason("equipment:manage")}>{node}</DeniedAction>);
  const meterLabel = (value: string) => options.data?.meterTypes.find((option) => option.value === value)?.label ?? value;
  const needle = search.trim().toLowerCase();
  const tools = (data?.tools ?? []).filter((tool) => needle === "" || [tool.name, tool.brand, tool.model, tool.serialNumber, tool.categoryLabel].some((text) => text.toLowerCase().includes(needle)));
  const plan = (tool: Equipment) =>
    [
      tool.serviceIntervalHours ? `${Number(tool.serviceIntervalHours).toLocaleString("en-PH")} h` : null,
      tool.serviceIntervalCycles ? `${tool.serviceIntervalCycles.toLocaleString("en-PH")} ${tool.countUnit === "cups" ? "cups" : "jobs"}` : null,
      tool.serviceIntervalDays ? `${tool.serviceIntervalDays} days` : null,
    ]
      .filter(Boolean)
      .join(" / ");

  return (
    <>
      <PageHeader
        title="Equipment register"
        description="Every tool on the floor: what it is, where it lives, what it cost and how it is serviced. Its condition and readings are on the health board."
        actions={gate(
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus />
            Register a tool
          </Button>
        )}
      />

      <div className="mb-4 max-w-sm">
        <Input type="search" aria-label="Search the register" placeholder="Search by name, make or serial number" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {!isSuccess ? (
        <Skeleton className="h-96" />
      ) : tools.length === 0 ? (
        <div className="card">
          <EmptyState icon={Wrench} title={data.tools.length === 0 ? "No tools registered yet" : "Nothing matches"} description={data.tools.length === 0 ? "Register the floor's first tool to start monitoring it." : "No tool matches that search."} />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Tool</th>
                <th scope="col" className="px-3 py-3 font-medium">Make and serial</th>
                <th scope="col" className="px-3 py-3 font-medium">Bay</th>
                <th scope="col" className="px-3 py-3 font-medium">Purchased</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Cost</th>
                <th scope="col" className="px-3 py-3 font-medium">Metered by</th>
                <th scope="col" className="px-3 py-3 font-medium">Service every</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tools.map((tool) => (
                <tr key={tool.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3">
                    <Link href={`/shop/equipment/${tool.id}`} className="font-medium text-brand hover:underline">
                      {tool.name}
                    </Link>
                    <p className="text-2xs text-subtle-foreground">
                      {tool.categoryLabel} · {tool.conditionLabel}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {[tool.brand, tool.model].filter(Boolean).join(" ") || <span className="text-subtle-foreground">—</span>}
                    {tool.serialNumber ? <p className="tabular text-2xs text-subtle-foreground">S/N {tool.serialNumber}</p> : null}
                  </td>
                  <td className="px-3 py-3">{tool.bay?.name ?? <span className="text-subtle-foreground">—</span>}</td>
                  <td className="px-3 py-3">
                    {tool.purchaseDate ? formatDay(tool.purchaseDate) : <span className="text-subtle-foreground">—</span>}
                    {tool.warrantyUntil ? <p className="text-2xs text-subtle-foreground">Warranty to {formatDay(tool.warrantyUntil)}</p> : null}
                  </td>
                  <td className="tabular px-3 py-3 text-right">{tool.purchaseCost > 0 ? formatPesos(tool.purchaseCost) : <span className="text-subtle-foreground">—</span>}</td>
                  <td className="px-3 py-3">{meterLabel(tool.meterType)}</td>
                  <td className="tabular px-3 py-3">
                    {plan(tool) || <span className="text-subtle-foreground">Not tracked</span>}
                    {tool.maintenanceTask ? <p className="max-w-56 truncate text-2xs text-subtle-foreground" title={tool.maintenanceTask}>{tool.maintenanceTask}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <ToolStatusBadge tool={tool} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {gate(
                      <Button size="sm" variant="ghost" aria-label={`Edit ${tool.name}`} onClick={() => setEditing(tool)}>
                        <Pencil />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {editing ? <EquipmentFormDialog tool={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
