"use client";

import * as React from "react";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
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
import { useInventoryActions, useItemOptions, useStockLocations } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";

interface Row {
  key: number;
  itemId: string;
  quantity: string;
  unitCost: string;
}

let seq = 0;
const blankRow = (): Row => ({ key: ++seq, itemId: "", quantity: "", unitCost: "" });

/**
 * The first count of items in a location, each at a stated cost. Only for an
 * item with no stock history there; a later correction is a stock count.
 */
export function OpeningStockDialog() {
  const { recordOpening } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const { locations } = useStockLocations({ enabled: open });
  const { items } = useItemOptions({ enabled: open });
  const stocked = React.useMemo(() => items.filter((item) => item.isStocked), [items]);
  const [locationId, setLocationId] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([blankRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setRows([blankRow()]);
      setError(null);
    }
  }, [open]);
  React.useEffect(() => {
    if (open && !locationId && locations[0]) setLocationId(locations[0].id);
  }, [open, locationId, locations]);

  const patch = (key: number, changes: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const filled = rows.filter((row) => row.itemId && Number(row.quantity) > 0);
  const canSubmit = Boolean(locationId) && filled.length > 0 && !pending;

  async function submit() {
    setPending(true);
    setError(null);
    const result = await recordOpening(
      locationId,
      filled.map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity), unitCost: Math.max(0, Number(row.unitCost) || 0) })),
      "Opening balance"
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = (
    <Button variant="secondary" size="sm">
      <PackagePlus />
      Opening balance
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
          <DialogTitle>Opening balance</DialogTitle>
          <DialogDescription>
            What is on the shelf when the ledger begins, at what each unit cost. It is a stock move like any other, and can only be recorded once per item
            and location.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ob-location">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="ob-location">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const item = stocked.find((candidate) => candidate.id === row.itemId);
              return (
                <div key={row.key} className="grid grid-cols-[1fr_5.5rem_6.5rem_auto] items-center gap-2">
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
                  <Input
                    aria-label={`Quantity${item ? ` (${item.uom})` : ""}`}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={item ? item.uom : "Qty"}
                    value={row.quantity}
                    className="tabular text-xs"
                    onChange={(e) => patch(row.key, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label="Unit cost (₱)"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="₱ each"
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
            Record opening balance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
