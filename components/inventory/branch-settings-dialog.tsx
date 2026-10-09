"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
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
import { useInventoryActions } from "@/lib/inventory";
import { useSession } from "@/lib/auth";
import { useCan } from "@/lib/rbac";
import type { Item, ItemBranch } from "@/types/inventory";

/** One branch's way of running an item: reorder point and quantity, bin, and a price of its own. */
export function BranchSettingsDialog({ item }: { item: Item }) {
  const { setBranchSettings } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const { session } = useSession();
  const branches = session?.branches ?? [];
  const [open, setOpen] = React.useState(false);
  const [branchId, setBranchId] = React.useState(item.branches[0]?.branchId ?? branches[0]?.id ?? "");
  const [point, setPoint] = React.useState("");
  const [reorderQty, setReorderQty] = React.useState("");
  const [bin, setBin] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const current: ItemBranch | undefined = item.branches.find((branch) => branch.branchId === branchId);

  React.useEffect(() => {
    if (!open) return;
    setPoint(current?.reorderPoint == null ? "" : String(current.reorderPoint));
    setReorderQty(current?.reorderQty == null ? "" : String(current.reorderQty));
    setBin(current?.bin ?? "");
    setPrice(current?.priceOverride == null ? "" : String(current.priceOverride));
    setError(null);
  }, [open, current]);

  const number = (text: string) => (text.trim() === "" ? null : Number(text));

  async function submit() {
    setPending(true);
    setError(null);
    const result = await setBranchSettings(item.id, branchId, {
      reorderPoint: number(point),
      reorderQty: number(reorderQty),
      bin: bin.trim() === "" ? null : bin.trim(),
      priceOverride: number(price),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = (
    <Button variant="ghost" size="sm" aria-label={`Branch settings for ${item.name}`}>
      <SlidersHorizontal />
    </Button>
  );

  if (!canAsStaff("inventory:manage")) {
    return <DeniedAction reason={staffReason("inventory:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{item.name} by branch</DialogTitle>
          <DialogDescription>
            When to reorder, where it is kept, and a price for this branch if it differs from {item.sku}&apos;s. Quantities are in {item.uom}.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bs-branch">Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="bs-branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bs-point">Reorder point</Label>
              <Input id="bs-point" type="number" min={0} step="any" value={point} placeholder="None" className="tabular" onChange={(e) => setPoint(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bs-qty">Reorder quantity</Label>
              <Input id="bs-qty" type="number" min={0} step="any" value={reorderQty} placeholder="None" className="tabular" onChange={(e) => setReorderQty(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bs-bin">Bin</Label>
              <Input id="bs-bin" value={bin} placeholder="e.g. A-01" onChange={(e) => setBin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bs-price">Price here (₱)</Label>
              <Input
                id="bs-price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                placeholder={`Item price ${item.defaultPrice}`}
                className="tabular"
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
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
          <Button variant="primary" disabled={pending || !branchId} onClick={() => void submit()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
