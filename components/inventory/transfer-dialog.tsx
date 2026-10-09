"use client";

import * as React from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
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
import { formatQuantity } from "@/lib/utils";

interface Row {
  key: number;
  itemId: string;
  quantity: string;
}

let seq = 0;
const blankRow = (): Row => ({ key: ++seq, itemId: "", quantity: "" });

/**
 * One transfer document: goods leave one location and arrive in another, at
 * the source's average cost, in a single step. To undo one, reverse it.
 */
export function TransferDialog() {
  const { transferStock } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const { locations } = useStockLocations({ enabled: open });
  const { items } = useItemOptions({ enabled: open });
  const stocked = React.useMemo(() => items.filter((item) => item.isStocked), [items]);
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([blankRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setRows([blankRow()]);
      setNotes("");
      setError(null);
    }
  }, [open]);
  React.useEffect(() => {
    if (open && !fromId && locations[0]) setFromId(locations[0].id);
  }, [open, fromId, locations]);
  // The destination is never the source: pick another once the source is known, and again if the source is changed onto it.
  React.useEffect(() => {
    if (!open || !fromId) return;
    if (!toId || toId === fromId) setToId(locations.find((location) => location.id !== fromId)?.id ?? "");
  }, [open, toId, fromId, locations]);

  const patch = (key: number, changes: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const usable = rows.filter((row) => row.itemId && Number(row.quantity) > 0);
  const canSubmit = Boolean(fromId && toId && fromId !== toId) && usable.length > 0 && !pending;

  async function submit() {
    setPending(true);
    setError(null);
    const result = await transferStock({
      fromLocationId: fromId,
      toLocationId: toId,
      notes: notes.trim() || undefined,
      lines: usable.map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity) })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = (
    <Button variant="primary" size="sm">
      <ArrowLeftRight />
      New transfer
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
          <DialogTitle>Transfer stock</DialogTitle>
          <DialogDescription>
            Moves goods from one location to another in one document: out of the source at its average cost, into the destination at that same cost.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr-from">From</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger id="tr-from">
                  <SelectValue placeholder="Source" />
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
            <div className="space-y-1.5">
              <Label htmlFor="tr-to">To</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger id="tr-to">
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter((location) => location.id !== fromId)
                    .map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const item = stocked.find((candidate) => candidate.id === row.itemId);
              const here = item?.branches.find((branch) => branch.locationId === fromId);
              return (
                <div key={row.key} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
                  <Select value={row.itemId} onValueChange={(value) => patch(row.key, { itemId: value })}>
                    <SelectTrigger aria-label="Item" className="text-xs">
                      <SelectValue placeholder="Item" />
                    </SelectTrigger>
                    <SelectContent>
                      {stocked.map((candidate) => {
                        const held = candidate.branches.find((branch) => branch.locationId === fromId);
                        return (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.sku} — {candidate.name} ({formatQuantity(held?.onHand ?? 0)} {candidate.uom} there)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`Quantity${item ? ` (${item.uom})` : ""}`}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={item ? item.uom : "Qty"}
                    title={here ? `${formatQuantity(here.onHand)} ${item?.uom} at the source` : undefined}
                    value={row.quantity}
                    className="tabular text-xs"
                    onChange={(e) => patch(row.key, { quantity: e.target.value })}
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

          <div className="space-y-1.5">
            <Label htmlFor="tr-notes">Notes</Label>
            <Input id="tr-notes" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
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
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
