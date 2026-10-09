"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useInventoryActions, type ItemDraft } from "@/lib/inventory";
import { useVendors } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import type { Item, ItemType, TaxClass } from "@/types/inventory";

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  part: "Part",
  consumable: "Consumable",
  retail: "Retail",
  ingredient: "Ingredient",
  service_fee: "Service fee",
};

const TAX_LABEL: Record<TaxClass, string> = { vatable: "VATable", vat_exempt: "VAT exempt", zero_rated: "Zero rated" };

const NO_VENDOR = "__none__";

function blank(): ItemDraft {
  return {
    sku: "",
    barcode: "",
    name: "",
    itemType: "part",
    category: "",
    uom: "pc",
    purchaseUom: "",
    purchaseUomFactor: 1,
    taxClass: "vatable",
    defaultPrice: 0,
    isStocked: true,
    isActive: true,
    preferredVendorId: null,
  };
}

function fromItem(item: Item): ItemDraft {
  return {
    sku: item.sku,
    barcode: item.barcode ?? "",
    name: item.name,
    itemType: item.itemType,
    category: item.category,
    uom: item.uom,
    purchaseUom: item.purchaseUom ?? "",
    purchaseUomFactor: item.purchaseUomFactor,
    taxClass: item.taxClass,
    defaultPrice: item.defaultPrice,
    isStocked: item.isStocked,
    isActive: item.isActive,
    preferredVendorId: item.preferredVendorId,
  };
}

/** Adds or edits one item of the shop's inventory (`inventory:manage`). */
export function ItemFormDialog({ item }: { item?: Item }) {
  const isEdit = Boolean(item);
  const { createItem, updateItem } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<ItemDraft>(item ? fromItem(item) : blank());
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const { vendors } = useVendors({ enabled: open });

  React.useEffect(() => {
    if (open) {
      setForm(item ? fromItem(item) : blank());
      setError(null);
      setFields({});
    }
  }, [open, item]);

  const patch = (changes: Partial<ItemDraft>) => setForm((current) => ({ ...current, ...changes }));
  const fee = form.itemType === "service_fee";
  const canSubmit = form.sku.trim() !== "" && form.name.trim() !== "" && form.uom.trim() !== "" && !pending;
  const fieldError = (name: string) => fields[name]?.[0];

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setFields({});
    const draft: ItemDraft = { ...form, isStocked: fee ? false : form.isStocked };
    const result = isEdit && item ? await updateItem(item.id, draft) : await createItem(draft);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? {});
      return;
    }
    setOpen(false);
  }

  const trigger = isEdit ? (
    <Button variant="ghost" size="sm" aria-label={`Edit ${item?.name}`}>
      <Pencil />
    </Button>
  ) : (
    <Button variant="primary" size="sm">
      <Plus />
      Add item
    </Button>
  );

  if (!canAsStaff("inventory:manage")) {
    return <DeniedAction reason={staffReason("inventory:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${item?.name}` : "Add an item"}</DialogTitle>
          <DialogDescription>
            What the shop keeps, uses and sells. The SKU is unique across the organization; reorder points, bins and branch prices are set per branch
            afterwards.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-sku">SKU</Label>
              <Input id="item-sku" value={form.sku} placeholder="e.g. 90915-YZZD4" onChange={(e) => patch({ sku: e.target.value })} />
              {fieldError("sku") ? <p className="text-2xs text-critical">{fieldError("sku")}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-barcode">Barcode</Label>
              <Input id="item-barcode" value={form.barcode} placeholder="Optional" onChange={(e) => patch({ barcode: e.target.value })} />
              {fieldError("barcode") ? <p className="text-2xs text-critical">{fieldError("barcode")}</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" value={form.name} placeholder="e.g. Engine oil filter" onChange={(e) => patch({ name: e.target.value })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-type">Type</Label>
              <Select value={form.itemType} onValueChange={(value) => patch({ itemType: value })}>
                <SelectTrigger id="item-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ITEM_TYPE_LABEL) as [ItemType, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-category">Category</Label>
              <Input id="item-category" value={form.category} placeholder="e.g. engine" onChange={(e) => patch({ category: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-tax">Tax</Label>
              <Select value={form.taxClass} onValueChange={(value) => patch({ taxClass: value })}>
                <SelectTrigger id="item-tax">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TAX_LABEL) as [TaxClass, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-uom">Kept in</Label>
              <Input id="item-uom" value={form.uom} placeholder="pc, L, set…" onChange={(e) => patch({ uom: e.target.value })} />
              {fieldError("uom") ? <p className="text-2xs text-critical">{fieldError("uom")}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-puom">Bought in</Label>
              <Input id="item-puom" value={form.purchaseUom} placeholder="Same as kept" onChange={(e) => patch({ purchaseUom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-factor">Kept units per bought unit</Label>
              <Input
                id="item-factor"
                type="number"
                min={0.001}
                step="any"
                value={form.purchaseUomFactor}
                disabled={form.purchaseUom.trim() === ""}
                className="tabular"
                onChange={(e) => patch({ purchaseUomFactor: Number(e.target.value) || 1 })}
              />
              {fieldError("purchase_uom_factor") ? <p className="text-2xs text-critical">{fieldError("purchase_uom_factor")}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-price">Selling price (₱ per {form.uom || "unit"})</Label>
              <Input
                id="item-price"
                type="number"
                min={0}
                step="0.01"
                value={form.defaultPrice}
                className="tabular"
                onChange={(e) => patch({ defaultPrice: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-vendor">Preferred vendor</Label>
              <Select value={form.preferredVendorId ?? NO_VENDOR} onValueChange={(value) => patch({ preferredVendorId: value === NO_VENDOR ? null : value })}>
                <SelectTrigger id="item-vendor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VENDOR}>None</SelectItem>
                  {vendors
                    .filter((vendor) => vendor.active || vendor.id === form.preferredVendorId)
                    .map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-stocked">Stock</Label>
              <Select value={fee || !form.isStocked ? "no" : "yes"} onValueChange={(value) => patch({ isStocked: value === "yes" })} disabled={fee}>
                <SelectTrigger id="item-stocked">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Stocked — counted and issued</SelectItem>
                  <SelectItem value="no">Not stocked{fee ? " (a service fee never is)" : ""}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-active">Status</Label>
              <Select value={form.isActive ? "active" : "inactive"} onValueChange={(value) => patch({ isActive: value === "active" })}>
                <SelectTrigger id="item-active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive — off the lists, history kept</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* A refused field is named beside the field; anything else is said here. */}
          {error && Object.keys(fields).length === 0 ? (
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
            {isEdit ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
