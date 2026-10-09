"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, formatISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SuccessDialog } from "@/components/ui/success-dialog";
import { useItemOptions } from "@/lib/inventory";
import { useSelectedBranch } from "@/lib/api/branch";
import { PARTS_SOURCE_HINT, PARTS_SOURCE_LABEL, sourceChoices } from "@/lib/parts-source";
import { CATEGORY_LABEL } from "@/lib/service-tasks";
import {
  useAllVehicles,
  useFleetActions,
  usePreviewSettings,
  useServiceTasks,
  useVendors,
  type NewWorkOrderLine,
} from "@/lib/store";
import { computeTotals, recalcLine } from "@/lib/billing";
import { useCan } from "@/lib/rbac";
import { useSession } from "@/lib/auth";
import { DeniedAction } from "@/components/auth/denied-action";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import type { LineUrgency, PartsSource, Priority, TaskCategory, WorkOrder, WorkOrderType } from "@/types";

const URGENCY_LABEL: Record<LineUrgency, string> = {
  safety_critical: "Safety critical",
  recommended: "Recommended",
  optional: "Optional",
};

const CATEGORY_OPTIONS: { value: TaskCategory | "other"; label: string }[] = [
  ...(Object.entries(CATEGORY_LABEL) as [TaskCategory, string][]).map(([value, label]) => ({ value, label })),
  { value: "other", label: "Other" },
];

/** In-house work carries no vendor (a vendor is a third-party subcontractor). */
const IN_HOUSE = "__in_house__";

let draftLineSeq = 0;
/**
 * @param labourRate the shop rate quoted by default, from the effective settings.
 * @param partsSource the settings' default source for a new line.
 */
function blankDraftLine(labourRate: number, partsSource: PartsSource = "supplier_provided"): NewWorkOrderLine & { key: string } {
  draftLineSeq += 1;
  return {
    key: `draft-${draftLineSeq}`,
    description: "",
    category: "other",
    quantity: 1,
    unitPartRate: 0,
    labourHours: 0,
    labourRate,
    urgency: "recommended",
    partsSource,
  };
}

/**
 * Raising a work order. The API creates it as an unnumbered draft, then the
 * quotation is sent for approval straight away (as ../web raised it): the API
 * numbers it and, inside the auto-approve band, approves it itself. Prices and
 * totals are the API's; the estimate below is a labelled preview.
 */
export function NewWorkOrderDialog({
  vehicleId,
  taskId,
  trigger,
}: {
  vehicleId?: string;
  taskId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { can, reason, side } = useCan();
  const allowed = can("workorder:create");
  const [open, setOpen] = React.useState(false);

  const { vehicles } = useAllVehicles();
  const { serviceTasks } = useServiceTasks();
  const { vendors } = useVendors({ enabled: open && side === "staff" });
  const settings = usePreviewSettings();
  const { createWorkOrder, sendForApproval } = useFleetActions();

  const defaultLabourRate = settings?.defaultLabourRate ?? 0;
  const defaultSource = settings?.defaultPartsSource ?? "supplier_provided";

  // The shop's items, for lines issued from the branch store (staff only; the API refuses the rest).
  const stockAccess = side === "staff" && can("inventory:view");
  const { items: stockItems } = useItemOptions({ enabled: open && stockAccess });
  const selectedBranch = useSelectedBranch();
  const shelfItems = React.useMemo(() => stockItems.filter((item) => item.isStocked && item.isActive), [stockItems]);
  // The branch the order will be raised in: the one picked in the switcher, else the first the user works in.
  const { session } = useSession();
  const orderBranch = selectedBranch && selectedBranch !== "all" ? selectedBranch : (session?.branches[0]?.id ?? null);
  const activeTasks = React.useMemo(() => serviceTasks.filter((task) => task.active), [serviceTasks]);
  const activeVendors = React.useMemo(() => vendors.filter((vendor) => vendor.active), [vendors]);

  const [created, setCreated] = React.useState<WorkOrder | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);

  const [form, setForm] = React.useState({
    vehicleId: vehicleId ?? "",
    type: "preventive" as WorkOrderType,
    taskId: taskId ?? "",
    title: "",
    priority: "medium" as Priority,
    scheduledFor: formatISO(addDays(new Date(), 3), { representation: "date" }),
    vendor: IN_HOUSE,
    notes: "",
  });

  const [correctiveLines, setCorrectiveLines] = React.useState<(NewWorkOrderLine & { key: string })[]>([
    blankDraftLine(defaultLabourRate, defaultSource),
  ]);

  // Reopening with different props (e.g. from another vehicle) should not keep
  // the previous draft around.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setForm((current) => ({
      ...current,
      vehicleId: vehicleId ?? current.vehicleId,
      taskId: taskId ?? (current.taskId || activeTasks[0]?.id || ""),
      type: taskId ? "preventive" : current.type,
    }));
  }, [open, vehicleId, taskId, activeTasks]);

  // A fresh draft starts with one blank line, once per opening: settings and
  // catalogue queries that land later must not wipe what has been typed. A line
  // still untouched just takes the defaults when they arrive.
  const defaultsRef = React.useRef({ defaultLabourRate, defaultSource });
  defaultsRef.current = { defaultLabourRate, defaultSource };
  React.useEffect(() => {
    if (!open) return;
    setCorrectiveLines([blankDraftLine(defaultsRef.current.defaultLabourRate, defaultsRef.current.defaultSource)]);
  }, [open, vehicleId, taskId]);
  React.useEffect(() => {
    setCorrectiveLines((current) =>
      current.map((line) =>
        line.description === "" && !line.itemId ? { ...line, labourRate: defaultLabourRate, partsSource: defaultSource } : line
      )
    );
  }, [defaultLabourRate, defaultSource]);

  const task = activeTasks.find((t) => t.id === form.taskId);
  const isPreventive = form.type !== "corrective";

  // The lines actually being submitted — one line from the catalogue for
  // preventive/inspection work, or whatever is itemised for a repair.
  const lineDrafts: NewWorkOrderLine[] = React.useMemo(() => {
    if (isPreventive) {
      if (!task) return [];
      return [
        {
          serviceTaskId: task.id,
          description: task.name,
          category: task.category,
          quantity: 1,
          unitPartRate: task.estimatedCost,
          labourHours: task.estimatedHours,
          labourRate: defaultLabourRate,
          urgency: task.critical ? "safety_critical" : "recommended",
          partsSource: settings?.defaultPartsSource ?? "supplier_provided",
        },
      ];
    }
    return correctiveLines.filter((line) => line.description.trim().length > 0).map(({ key: _key, ...line }) => line);
  }, [isPreventive, task, correctiveLines, defaultLabourRate, settings?.defaultPartsSource]);

  // PREVIEW: the same arithmetic the API runs (golden-tested), recomputed per
  // keystroke. The saved quote is priced by the API.
  const preview = computeTotals(
    lineDrafts.map((line) => recalcLine({ ...line, partCost: 0, labourCost: 0, approvalStatus: "pending" as const })),
    { vatRatePct: settings?.vatRatePct ?? 0, miscFeeFlat: settings?.miscFeeFlat ?? 0 }
  );

  const title = isPreventive ? (task?.name ?? "") : form.title.trim();
  const correctiveLinesValid = isPreventive || correctiveLines.some((line) => line.description.trim().length > 0);
  // A shop-stock line must say which item comes off the shelf.
  const itemsChosen = isPreventive || correctiveLines.every((line) => line.description.trim().length === 0 || line.partsSource !== "shop_stock" || Boolean(line.itemId));
  const canSubmit = Boolean(form.vehicleId && title && correctiveLinesValid && itemsChosen) && !pending;

  function patchLine(key: string, patch: Partial<NewWorkOrderLine>) {
    setCorrectiveLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    setSendError(null);

    const result = await createWorkOrder({
      vehicleId: form.vehicleId,
      title,
      type: form.type,
      priority: form.priority,
      scheduledFor: form.scheduledFor || null,
      vendor: form.vendor === IN_HOUSE ? "" : form.vendor,
      notes: form.notes,
      taskIds: isPreventive && task ? [task.id] : [],
      lines: lineDrafts,
    });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      setFieldErrors(result.fields ?? {});
      return;
    }

    // Send the quotation: numbered now, auto-approved inside the band.
    const sent = await sendForApproval(result.data.id);
    setPending(false);
    setOpen(false);
    setForm((current) => ({ ...current, title: "", notes: "" }));
    setCorrectiveLines([blankDraftLine(defaultLabourRate, defaultSource)]);
    if (sent.ok) {
      setCreated(sent.data);
    } else {
      setSendError(sent.error);
      setCreated(result.data);
    }
  }

  const defaultTrigger = (
    <Button variant="primary">
      <Plus />
      New work order
    </Button>
  );

  // Gated here rather than at each call site, so no screen can accidentally
  // hand a viewer a working button.
  if (!allowed) {
    return <DeniedAction reason={reason("workorder:create")}>{trigger ?? defaultTrigger}</DeniedAction>;
  }

  const fieldError = (name: string) => fieldErrors[name]?.[0];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>

        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Raise a work order</DialogTitle>
            <DialogDescription>
              Every job is a purchase first — this goes to approval before it can be scheduled, unless it&apos;s cheap
              enough to auto-approve.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wo-vehicle">Vehicle</Label>
              <Select value={form.vehicleId} onValueChange={(value) => setForm((current) => ({ ...current, vehicleId: value }))}>
                <SelectTrigger id="wo-vehicle">
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plateNumber} — {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("vehicle_id") ? <p className="text-2xs text-critical">{fieldError("vehicle_id")}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wo-type">Job type</Label>
                <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value as WorkOrderType }))}>
                  <SelectTrigger id="wo-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventive">Preventive (PMS)</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="corrective">Corrective repair</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wo-priority">Priority</Label>
                <Select value={form.priority} onValueChange={(value) => setForm((current) => ({ ...current, priority: value as Priority }))}>
                  <SelectTrigger id="wo-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isPreventive ? (
              <div className="space-y-1.5">
                <Label htmlFor="wo-task">Service item</Label>
                <Select value={form.taskId} onValueChange={(value) => setForm((current) => ({ ...current, taskId: value }))}>
                  <SelectTrigger id="wo-task">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="wo-title">Fault description</Label>
                  <Input
                    id="wo-title"
                    value={form.title}
                    placeholder="e.g. Aircon compressor not engaging"
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                  {fieldError("title") ? <p className="text-2xs text-critical">{fieldError("title")}</p> : null}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Purchase lines</Label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setCorrectiveLines((current) => [...current, blankDraftLine(defaultLabourRate, defaultSource)])}
                    >
                      <Plus />
                      Add line
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {correctiveLines.map((line) => (
                      <div key={line.key} className="space-y-2 rounded-md border border-border bg-surface-2/40 p-2.5">
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label="Line description"
                            value={line.description}
                            placeholder="What needs doing"
                            onChange={(event) => patchLine(line.key, { description: event.target.value })}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${line.description || "line"}`}
                            disabled={correctiveLines.length === 1}
                            onClick={() => setCorrectiveLines((current) => current.filter((entry) => entry.key !== line.key))}
                          >
                            <Trash2 />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Select value={line.category} onValueChange={(value) => patchLine(line.key, { category: value as TaskCategory | "other" })}>
                            <SelectTrigger aria-label="Category" className="text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORY_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select value={line.urgency} onValueChange={(value) => patchLine(line.key, { urgency: value as LineUrgency })}>
                            <SelectTrigger aria-label="Urgency" className="text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.entries(URGENCY_LABEL) as [LineUrgency, string][]).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={line.partsSource}
                            onValueChange={(value) => {
                              const source = value as PartsSource;
                              patchLine(line.key, {
                                partsSource: source,
                                // The customer's own part is not charged; the item only belongs to a shop-stock line.
                                ...(source === "customer_supplied" ? { unitPartRate: 0, priceFromItem: false } : {}),
                                ...(source !== "shop_stock" ? { itemId: null, priceFromItem: false } : {}),
                              });
                            }}
                          >
                            <SelectTrigger aria-label="Parts source" className="text-xs" title={PARTS_SOURCE_HINT[line.partsSource]}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {sourceChoices(line.partsSource)
                                .filter((value) => value !== "shop_stock" || stockAccess)
                                .map((value) => (
                                  <SelectItem key={value} value={value} title={PARTS_SOURCE_HINT[value]}>
                                    {PARTS_SOURCE_LABEL[value]}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>

                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              aria-label="Part unit rate"
                              type="number"
                              min={0}
                              value={line.unitPartRate}
                              disabled={line.partsSource === "customer_supplied"}
                              title={line.partsSource === "customer_supplied" ? "The customer brings the part: it is not charged." : undefined}
                              className="tabular text-xs"
                              onChange={(event) => patchLine(line.key, { unitPartRate: Math.max(0, Number(event.target.value) || 0), priceFromItem: false })}
                            />
                            <Input
                              aria-label="Labour hours"
                              type="number"
                              min={0}
                              step={0.5}
                              value={line.labourHours}
                              className="tabular text-xs"
                              onChange={(event) => patchLine(line.key, { labourHours: Math.max(0, Number(event.target.value) || 0) })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-[1fr_6rem] gap-2">
                          {line.partsSource === "shop_stock" ? (
                            <Select
                              value={line.itemId ?? ""}
                              onValueChange={(value) => {
                                const item = shelfItems.find((candidate) => candidate.id === value);
                                const here = item?.branches.find((branch) => branch.branchId === orderBranch);
                                patchLine(line.key, {
                                  itemId: value,
                                  // The branch's price, as the API reports it; left to the API to apply unless typed over.
                                  unitPartRate: here?.effectivePrice ?? item?.defaultPrice ?? 0,
                                  priceFromItem: true,
                                  description: line.description.trim() === "" && item ? item.name : line.description,
                                });
                              }}
                            >
                              <SelectTrigger aria-label="Inventory item" className="text-xs">
                                <SelectValue placeholder="Pick the item from the shelf" />
                              </SelectTrigger>
                              <SelectContent>
                                {shelfItems.map((item) => {
                                  const here = item.branches.find((branch) => branch.branchId === orderBranch);
                                  return (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.sku} — {item.name} ({formatQuantity(here?.onHand ?? 0)} {item.uom} on hand)
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="self-center text-2xs text-subtle-foreground">{PARTS_SOURCE_HINT[line.partsSource]}</p>
                          )}
                          <Input
                            aria-label="Quantity"
                            type="number"
                            min={0}
                            step={0.5}
                            value={line.quantity}
                            className="tabular text-xs"
                            onChange={(event) => patchLine(line.key, { quantity: Math.max(0, Number(event.target.value) || 0) })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wo-date">Requested for</Label>
                <Input
                  id="wo-date"
                  type="date"
                  value={form.scheduledFor}
                  onChange={(event) => setForm((current) => ({ ...current, scheduledFor: event.target.value }))}
                />
              </div>

              {side === "staff" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="wo-vendor">Service provider</Label>
                  <Select value={form.vendor} onValueChange={(value) => setForm((current) => ({ ...current, vendor: value }))}>
                    <SelectTrigger id="wo-vendor">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IN_HOUSE}>In-house (our bays)</SelectItem>
                      {activeVendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.name}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wo-notes">Notes</Label>
              <Textarea
                id="wo-notes"
                value={form.notes}
                placeholder="Anything the technician should know before the vehicle arrives."
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>

            {lineDrafts.length > 0 ? (
              <div className="rounded-lg border border-border bg-surface-2/60 px-4 py-3">
                <p className="text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
                  Estimate · preview
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-subtle-foreground">Parts</dt>
                    <dd className="tabular mt-0.5 font-medium">{formatCurrency(preview.partsTotal)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle-foreground">Labour</dt>
                    <dd className="tabular mt-0.5 font-medium">{formatCurrency(preview.labourTotal)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle-foreground">Sub total</dt>
                    <dd className="tabular mt-0.5 font-medium">{formatCurrency(preview.subTotal)}</dd>
                  </div>
                </dl>

                <dl className="mt-2.5 grid grid-cols-3 gap-3 border-t border-border pt-2.5 text-xs">
                  {preview.miscTotal > 0 ? (
                    <div>
                      <dt className="text-subtle-foreground">Misc</dt>
                      <dd className="tabular mt-0.5 font-medium">{formatCurrency(preview.miscTotal)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-subtle-foreground">VAT ({preview.vatRatePct}%)</dt>
                    <dd className="tabular mt-0.5 font-medium">{formatCurrency(preview.taxTotal)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle-foreground">Grand total</dt>
                    <dd className="tabular mt-0.5 font-semibold">{formatCurrency(preview.grandTotal)}</dd>
                  </div>
                </dl>

                <p className="mt-2.5 border-t border-border pt-2.5 text-2xs text-subtle-foreground">
                  A preview while you type. The server prices the quote when it&apos;s saved, and decides who must approve
                  it — under the auto-approve ceiling it approves itself.
                </p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-md border border-critical/25 bg-critical/[0.07] px-3 py-2 text-xs text-critical">
                {error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
              {pending ? "Raising…" : "Create work order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SuccessDialog
        open={created !== null}
        onOpenChange={(next) => {
          if (!next) setCreated(null);
        }}
        title={sendError ? "Saved as a draft" : "Work order created"}
        description={
          created
            ? sendError
              ? `${created.title} was saved as a draft, but sending it for approval failed: ${sendError}`
              : `${created.displayReference} — ${created.title} — has been raised${
                  created.status === "pending_approval"
                    ? " and is now awaiting approval."
                    : created.status === "approved"
                      ? ". It auto-approved and is ready to schedule."
                      : "."
                }`
            : ""
        }
        primaryAction={
          created
            ? {
                label: "View work order",
                onClick: () => router.push(`/work-orders/${created.id}`),
              }
            : undefined
        }
      />
    </>
  );
}
