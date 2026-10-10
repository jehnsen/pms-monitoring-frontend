"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Clock, Pencil, Plus, Trash2, Wrench, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { formatDay } from "@/components/detailing/booking-status";
import { HealthScore, LIMIT_LABEL, ServiceBadge, ServiceMeter, ToolStatusBadge, formatHours } from "@/components/equipment/equipment-chips";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEquipmentActions, useEquipmentItem, useEquipmentOptions, type ServiceEntryDraft } from "@/lib/equipment";
import { useItemOptions } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";
import { formatManilaTime, formatPesos } from "@/lib/utils";
import type { Equipment } from "@/types/equipment";

/**
 * One tool: its service plan (each limit, where it falls due, and which trips
 * first), the forecast, its life, its reliability and cost figures, and what
 * has been logged against it. Every number is the API's; logging usage or a
 * service re-reads them. A service entry can take parts from the branch's
 * store; the API moves the stock and books the expense.
 */
export default function EquipmentItemPage() {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const { data: tool, error, refetch } = useEquipmentItem(equipmentId);
  const options = useEquipmentOptions();
  const actions = useEquipmentActions();
  const { can, reason } = useCan();
  const manages = can("equipment:manage");
  const [dialog, setDialog] = React.useState<"edit" | "usage" | "service" | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!tool) return <Skeleton className="h-96" />;

  const { report } = tool;
  const cups = tool.countUnit === "cups";
  const number = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 1 });
  const gate = (node: React.ReactElement) => (manages ? node : <DeniedAction reason={reason("equipment:manage")}>{node}</DeniedAction>);
  const figure = (label: string, value: React.ReactNode, hint?: string) => (
    <div>
      <dt className="text-subtle-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
      {hint ? <dd className="text-2xs text-subtle-foreground">{hint}</dd> : null}
    </div>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {tool.name}
            <ToolStatusBadge tool={tool} />
          </span>
        }
        description={[tool.categoryLabel, tool.brand, tool.model, tool.serialNumber ? `S/N ${tool.serialNumber}` : ""].filter(Boolean).join(" · ")}
        breadcrumb={[{ label: "Health board", href: "/shop/equipment" }, { label: tool.name }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {gate(
              <Button variant="primary" onClick={() => setDialog("service")}>
                <Wrench />
                Log a service
              </Button>
            )}
            {gate(
              <Button onClick={() => setDialog("usage")}>
                <Clock />
                Log usage
              </Button>
            )}
            {gate(
              <Button variant="ghost" onClick={() => setDialog("edit")}>
                <Pencil />
                Edit
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Preventive maintenance</h2>
              <ServiceBadge service={report.service} />
            </div>
            {report.service ? (
              <>
                {tool.maintenanceTask ? <p className="mb-4 text-xs text-muted-foreground">{tool.maintenanceTask}</p> : null}
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Each limit of the service plan, since the last service</caption>
                  <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
                    <tr>
                      <th scope="col" className="py-2 font-medium">Limit</th>
                      <th scope="col" className="py-2 text-right font-medium">Used</th>
                      <th scope="col" className="py-2 text-right font-medium">Interval</th>
                      <th scope="col" className="py-2 text-right font-medium">Left</th>
                      <th scope="col" className="py-2 text-right font-medium">Share</th>
                      <th scope="col" className="py-2 text-right font-medium">Falls due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.service.triggers.map((trigger) => (
                      <tr key={trigger.key}>
                        <th scope="row" className="py-2 font-normal">
                          {LIMIT_LABEL[trigger.key]}
                          {trigger.key === report.service?.binding ? <span className="ml-2 text-2xs text-brand">trips first</span> : null}
                        </th>
                        <td className="tabular py-2 text-right">{number(trigger.used)}</td>
                        <td className="tabular py-2 text-right">{number(trigger.interval)}</td>
                        <td className="tabular py-2 text-right">{number(trigger.remaining)}</td>
                        <td className="tabular py-2 text-right">{Math.round(trigger.ratio * 100)}%</td>
                        <td className="tabular py-2 text-right">{trigger.dueAt !== null ? `at ${number(trigger.dueAt)} ${trigger.unit}` : trigger.dueOn ? formatDay(trigger.dueOn) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4">
                  <ServiceMeter service={report.service} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {tool.lastServiceAt ? `Last serviced ${formatManilaTime(tool.lastServiceAt)}.` : "Never serviced: counted from the beginning."}{" "}
                  {report.forecast
                    ? report.forecast.days <= 0
                      ? "Service is due now."
                      : `At the last 30 days' pace the next service falls on ${formatDay(report.forecast.dueOn)}.`
                    : "The tool has not run in the last 30 days, so there is no forecast."}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No service interval is set, so this tool is not tracked. Edit it to set one by hours, {cups ? "cups" : "jobs"} or days.</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Service history</h2>
            {tool.maintenanceLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {tool.maintenanceLogs.map((log) => (
                  <li key={log.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {log.kindLabel}
                        {!log.resetsService ? <span className="ml-2 text-2xs font-normal text-subtle-foreground">did not reset the interval</span> : null}
                      </p>
                      <p className="text-2xs text-subtle-foreground">
                        {formatManilaTime(log.performedAt)}
                        {log.performedBy ? ` · ${log.performedBy}` : ""} · {formatPesos(log.totalCost)} · {Number(log.downtimeHours)} h down
                        {log.meterHours !== null ? ` · meter ${Number(log.meterHours)} h` : ""}
                      </p>
                      {log.issuedParts.length > 0 ? (
                        <p className="mt-0.5 text-muted-foreground">
                          From stock ({formatPesos(log.partsCost)}): {log.issuedParts.map((part) => `${Number(part.quantity)} ${part.uom} ${part.name}`).join(", ")}
                        </p>
                      ) : null}
                      {log.parts || log.notes ? <p className="mt-0.5 text-muted-foreground">{[log.parts, log.notes].filter(Boolean).join(" — ")}</p> : null}
                    </div>
                    {manages ? (
                      <button
                        type="button"
                        aria-label={`Remove the ${log.kindLabel} entry`}
                        title={log.issuedParts.length > 0 ? "Removing this entry puts its parts back in stock" : undefined}
                        onClick={() => void actions.deleteService(tool.id, log.id)} className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-critical">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-1 text-sm font-semibold">Usage log</h2>
            <p className="mb-3 text-2xs text-subtle-foreground">{cups ? "Cups served, as read off the machine's counter." : "Runtime the booking sheet never saw. Completed jobs are counted by themselves."}</p>
            {tool.usageLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing logged yet.</p>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {tool.usageLogs.map((log) => (
                  <li key={log.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div>
                      <p className="tabular font-medium">
                        {cups
                          ? `${log.cycles.toLocaleString("en-PH")} cup${log.cycles === 1 ? "" : "s"}${Number(log.hours) > 0 ? ` · ${Number(log.hours)} h` : ""}`
                          : `${Number(log.hours)} h${log.cycles ? ` · ${log.cycles} job${log.cycles === 1 ? "" : "s"}` : ""}`}
                      </p>
                      <p className="text-2xs text-subtle-foreground">
                        {formatManilaTime(log.usedAt)} · {log.loggedByName}
                        {log.note ? ` · ${log.note}` : ""}
                      </p>
                    </div>
                    {manages ? (
                      <button type="button" aria-label="Remove this usage entry" onClick={() => void actions.deleteUsage(tool.id, log.id)} className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-critical">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Health</h2>
              <HealthScore health={report.health} />
            </div>
            <dl className="grid grid-cols-2 gap-4 text-xs">
              {cups
                ? figure("Cups served", report.lifetime.cycles.toLocaleString("en-PH"), Number(report.lifetime.hours) > 0 ? formatHours(report.lifetime.hours) : undefined)
                : figure("Runtime", formatHours(report.lifetime.hours), `${report.lifetime.jobs} jobs · ${report.lifetime.cycles} cycles`)}
              {figure("Condition", tool.conditionLabel)}
              {figure("Rated life", report.life ? `${Math.round(report.life.ratio * 100)}% used` : "Not rated", report.life ? report.life.levelLabel : undefined)}
              {figure("Last 30 days", formatHours(report.utilization.hours), `${report.utilization.pct.toFixed(1)}% of open hours`)}
            </dl>
            {manages ? (
              <div className="space-y-1.5">
                <Label htmlFor="tool-status">Status</Label>
                <Select value={tool.status} onValueChange={(status) => void actions.setStatus(tool.id, status)}>
                  <SelectTrigger id="tool-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(options.data?.statuses ?? []).map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Reliability and cost</h2>
            <dl className="grid grid-cols-2 gap-4 text-xs">
              {figure("Repairs", String(report.reliability.repairs), `${report.reliability.services} entries in all`)}
              {figure("Between failures", report.reliability.mtbfHours === null ? "—" : formatHours(report.reliability.mtbfHours))}
              {figure("Availability", `${report.reliability.availabilityPct.toFixed(1)}%`, `${report.reliability.downtimeHours} h down`)}
              {figure("Cost per hour", report.reliability.costPerHour === null ? "—" : formatPesos(report.reliability.costPerHour))}
              {figure("Purchase", formatPesos(tool.purchaseCost), tool.purchaseDate ? formatDay(tool.purchaseDate) : undefined)}
              {figure("Total cost", formatPesos(report.reliability.totalCost), `${formatPesos(report.reliability.maintenanceCost)} maintenance`)}
            </dl>
          </section>
          {tool.notes ? <p className="card p-5 text-xs text-muted-foreground">{tool.notes}</p> : null}
        </aside>
      </div>

      {dialog === "edit" ? <EquipmentFormDialog tool={tool} onClose={() => setDialog(null)} /> : null}
      {dialog === "usage" ? <UsageDialog tool={tool} onClose={() => setDialog(null)} /> : null}
      {dialog === "service" ? <ServiceDialog tool={tool} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

function UsageDialog({ tool, onClose }: { tool: Equipment; onClose: () => void }) {
  const actions = useEquipmentActions();
  const [hours, setHours] = React.useState("");
  const [cycles, setCycles] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    const result = await actions.logUsage(tool.id, { hours, cycles, note });
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log usage</DialogTitle>
          <DialogDescription>
            {tool.countUnit === "cups"
              ? "Cups served since the last entry, as read off the machine's counter."
              : "For runtime the booking sheet never saw: a test run, a side job. A completed booking is already counted; logging it here would count it twice."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="use-hours">Runtime hours</Label>
              <Input id="use-hours" type="number" min={0} step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="use-cycles">{tool.countUnit === "cups" ? "Cups served" : "Job cycles"}</Label>
              <Input id="use-cycles" type="number" min={0} step="1" value={cycles} onChange={(event) => setCycles(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="use-note">Note</Label>
            <Input id="use-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Logging…" : "Log usage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceDialog({ tool, onClose }: { tool: Equipment; onClose: () => void }) {
  const actions = useEquipmentActions();
  const options = useEquipmentOptions();
  // What the stock room keeps: the parts a service can take from the branch's store.
  const stock = useItemOptions();
  const stocked = stock.items.filter((item) => item.isStocked && item.isActive);
  const [entry, setEntry] = React.useState<ServiceEntryDraft>({ kind: "preventive", performedBy: "", cost: "", downtimeHours: "", parts: "", notes: "", resetsService: true, issuedParts: [] });
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const set = (key: "performedBy" | "cost" | "downtimeHours" | "parts" | "notes") => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEntry((current) => ({ ...current, [key]: event.target.value }));
  const setPart = (index: number, change: Partial<ServiceEntryDraft["issuedParts"][number]>) =>
    setEntry((current) => ({ ...current, issuedParts: current.issuedParts.map((part, at) => (at === index ? { ...part, ...change } : part)) }));
  const onHand = (itemId: string) => stock.itemsById.get(itemId)?.branches.find((branch) => branch.branchId === tool.branchId)?.onHand ?? 0;

  async function save() {
    setBusy(true);
    const result = await actions.logService(tool.id, entry);
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Log a service</DialogTitle>
          <DialogDescription>{tool.maintenanceTask || "A service, repair, inspection, calibration or part replacement."} The meter reading at this moment is recorded with the entry.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="svc-kind">Kind</Label>
              <Select value={entry.kind} onValueChange={(kind) => setEntry((current) => ({ ...current, kind, resetsService: kind !== "inspection" }))}>
                <SelectTrigger id="svc-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(options.data?.maintenanceKinds ?? []).map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-by">Done by</Label>
              <Input id="svc-by" value={entry.performedBy} onChange={set("performedBy")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-cost">Cost paid (₱), apart from stock parts</Label>
              <Input id="svc-cost" type="number" min={0} step="0.01" value={entry.cost} onChange={set("cost")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-down">Hours out of service</Label>
              <Input id="svc-down" type="number" min={0} step="0.25" value={entry.downtimeHours} onChange={set("downtimeHours")} />
            </div>
          </div>
          <fieldset className="space-y-3 rounded-md border border-border p-4">
            <legend className="px-1 text-xs font-medium">Parts from stock</legend>
            <p className="text-2xs text-subtle-foreground">Taken from this branch&apos;s store when the entry is saved, at their average cost, and booked to Equipment Repairs &amp; Maintenance.</p>
            {entry.issuedParts.map((part, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={`svc-part-${index}`}>Item</Label>
                  <Select value={part.itemId} onValueChange={(itemId) => setPart(index, { itemId })}>
                    <SelectTrigger id={`svc-part-${index}`}>
                      <SelectValue placeholder="Pick an item" />
                    </SelectTrigger>
                    <SelectContent>
                      {stocked.map((item) => (
                        <SelectItem key={item.id} value={item.id} disabled={entry.issuedParts.some((other, at) => at !== index && other.itemId === item.id)}>
                          {item.name} ({item.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28 space-y-1.5">
                  <Label htmlFor={`svc-qty-${index}`}>Quantity</Label>
                  <Input id={`svc-qty-${index}`} type="number" min={0} step="0.001" value={part.quantity} onChange={(event) => setPart(index, { quantity: event.target.value })} />
                </div>
                <p className="tabular w-24 pb-2 text-2xs text-subtle-foreground">{part.itemId ? `${onHand(part.itemId).toLocaleString("en-PH", { maximumFractionDigits: 3 })} ${stock.itemsById.get(part.itemId)?.uom ?? ""} on hand` : ""}</p>
                <button
                  type="button"
                  aria-label="Remove this part"
                  onClick={() => setEntry((current) => ({ ...current, issuedParts: current.issuedParts.filter((_, at) => at !== index) }))}
                  className="mb-1.5 rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-critical"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" disabled={stock.isLoading || stocked.length === 0} onClick={() => setEntry((current) => ({ ...current, issuedParts: [...current.issuedParts, { itemId: "", quantity: "1" }] }))}>
              <Plus />
              {stock.error ? "The stock room could not be read" : stocked.length === 0 && !stock.isLoading ? "No stocked items" : "Add a part"}
            </Button>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="svc-parts">Other parts, in words</Label>
            <Input id="svc-parts" value={entry.parts} onChange={set("parts")} placeholder="Bought outside, or supplied by the service shop" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-notes">Notes</Label>
            <Textarea id="svc-notes" rows={2} value={entry.notes} onChange={set("notes")} />
          </div>
          <label className="flex items-start gap-3 text-xs">
            <input type="checkbox" checked={entry.resetsService} onChange={(event) => setEntry((current) => ({ ...current, resetsService: event.target.checked }))} className="mt-0.5 size-4 accent-[hsl(var(--brand))]" />
            <span>
              Restart the service interval from now
              <span className="block text-2xs text-subtle-foreground">Leave it off for a clean inspection: the interval keeps running.</span>
            </span>
          </label>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Logging…" : "Log service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
