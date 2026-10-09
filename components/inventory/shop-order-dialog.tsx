"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeniedAction } from "@/components/auth/denied-action";
import { BranchField, useDefaultBranch } from "@/components/inventory/branch-field";
import { useInventoryActions, useItemOptions } from "@/lib/inventory";
import { useVendors } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import type { ShopOrder } from "@/types/inventory";

interface Row {
  key: number;
  itemId: string;
  /** In the purchase unit. */
  quantity: string;
  /** Pesos per purchase unit. */
  unitCost: string;
  description: string;
  workOrderLineId: string | null;
}

let seq = 0;
const blankRow = (): Row => ({ key: ++seq, itemId: "", quantity: "", unitCost: "", description: "", workOrderLineId: null });

export interface ShopOrderPrefill {
  branchId?: string;
  vendorId?: string | null;
  lines: { itemId: string; quantity: number; unitCost?: number | null }[];
}

/**
 * Raises (or edits a draft of) a purchase order the shop sends to a vendor.
 * Lines are in the item's purchase unit; the server prices them and numbers
 * the order. Opened from Reorder with a suggestion already filled in.
 */
export function ShopOrderDialog({
  order,
  prefill,
  trigger,
}: {
  order?: ShopOrder;
  prefill?: ShopOrderPrefill;
  trigger?: React.ReactNode;
}) {
  const isEdit = Boolean(order);
  const { createShopOrder, updateShopOrder } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const defaultBranch = useDefaultBranch();
  const [open, setOpen] = React.useState(false);
  const { vendors } = useVendors({ enabled: open });
  const { items } = useItemOptions({ enabled: open });
  const stocked = React.useMemo(() => items.filter((item) => item.isStocked), [items]);

  const [branchId, setBranchId] = React.useState(order?.branchId ?? prefill?.branchId ?? defaultBranch);
  const [vendorId, setVendorId] = React.useState(order?.vendorId ?? prefill?.vendorId ?? "");
  const [notes, setNotes] = React.useState(order?.notes ?? "");
  const [expectedOn, setExpectedOn] = React.useState(order?.expectedOn ?? "");
  const [rows, setRows] = React.useState<Row[]>([blankRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);

  // The latest props, read when the dialog opens (a re-render must not reset what is being typed).
  const latest = React.useRef({ order, prefill, defaultBranch });
  latest.current = { order, prefill, defaultBranch };

  React.useEffect(() => {
    if (!open) return;
    const { order, prefill, defaultBranch } = latest.current;
    setBranchId(order?.branchId ?? prefill?.branchId ?? defaultBranch);
    setVendorId(order?.vendorId ?? prefill?.vendorId ?? "");
    setNotes(order?.notes ?? "");
    setExpectedOn(order?.expectedOn ?? "");
    setRows(
      order
        ? order.lines.map((line) => ({
            key: ++seq,
            itemId: line.item?.id ?? "",
            quantity: String(line.quantity),
            unitCost: String(line.unitCost),
            description: line.description,
            workOrderLineId: line.workOrderLineId,
          }))
        : prefill?.lines.length
          ? prefill.lines.map((line) => ({
              key: ++seq,
              itemId: line.itemId,
              quantity: String(line.quantity),
              unitCost: line.unitCost == null ? "" : String(line.unitCost),
              description: "",
              workOrderLineId: null,
            }))
          : [blankRow()]
    );
    setError(null);
    setFields({});
  }, [open]);

  const patch = (key: number, changes: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const usable = rows.filter((row) => (row.itemId || row.workOrderLineId) && Number(row.quantity) > 0);
  const canSubmit = Boolean(vendorId && branchId) && usable.length > 0 && !pending;

  async function submit() {
    setPending(true);
    setError(null);
    setFields({});
    const draft = {
      branchId: isEdit ? undefined : branchId,
      vendorId,
      notes,
      expectedOn: expectedOn || null,
      lines: usable.map((row) => ({
        itemId: row.itemId || null,
        workOrderLineId: row.workOrderLineId,
        description: row.description || undefined,
        quantity: Number(row.quantity),
        unitCost: Math.max(0, Number(row.unitCost) || 0),
      })),
    };
    const result = isEdit && order ? await updateShopOrder(order.id, draft) : await createShopOrder(draft);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? {});
      return;
    }
    setOpen(false);
  }

  const defaultTrigger = isEdit ? (
    <Button variant="ghost" size="sm" aria-label={`Edit ${order?.reference}`}>
      <Pencil />
    </Button>
  ) : (
    <Button variant="primary" size="sm">
      <Plus />
      New purchase order
    </Button>
  );

  if (!canAsStaff("inventory:manage")) {
    return <DeniedAction reason={staffReason("inventory:manage")}>{trigger ?? defaultTrigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${order?.reference}` : "Raise a purchase order"}</DialogTitle>
          <DialogDescription>
            Goods the shop buys for a branch&apos;s shelf. It is numbered when saved and frozen once issued; goods are taken in later, in whole or in part.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {isEdit ? null : <BranchField id="po-branch" value={branchId} onChange={setBranchId} label="For branch" />}
            <div className="space-y-1.5">
              <Label htmlFor="po-vendor">Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger id="po-vendor">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors
                    .filter((vendor) => vendor.active || vendor.id === vendorId)
                    .map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {fields["vendor_id"]?.[0] ? <p className="text-2xs text-critical">{fields["vendor_id"][0]}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-expected">Expected on</Label>
              <Input id="po-expected" type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lines</Label>
            {rows.map((row) => {
              const item = stocked.find((candidate) => candidate.id === row.itemId);
              const unit = item ? (item.purchaseUom ?? item.uom) : "unit";
              return (
                <div key={row.key} className="grid grid-cols-[1fr_6rem_7rem_auto] items-center gap-2">
                  {row.workOrderLineId ? (
                    <p className="truncate text-xs">{row.description || "Bought for a job"}</p>
                  ) : (
                    <Select value={row.itemId} onValueChange={(value) => patch(row.key, { itemId: value })}>
                      <SelectTrigger aria-label="Item" className="text-xs">
                        <SelectValue placeholder="Item" />
                      </SelectTrigger>
                      <SelectContent>
                        {stocked.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.sku} — {candidate.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    aria-label={`Quantity in ${unit}`}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={unit}
                    value={row.quantity}
                    className="tabular text-xs"
                    onChange={(e) => patch(row.key, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label={`Unit cost per ${unit} (₱)`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={`₱ per ${unit}`}
                    value={row.unitCost}
                    className="tabular text-xs"
                    onChange={(e) => patch(row.key, { unitCost: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows((current) => [...current, blankRow()])}>
              <Plus />
              Add line
            </Button>
            {Object.keys(fields).some((name) => name.startsWith("lines")) ? (
              <p className="text-2xs text-critical">{Object.entries(fields).find(([name]) => name.startsWith("lines"))?.[1][0]}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-critical">
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {isEdit ? "Save draft" : "Save as draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
