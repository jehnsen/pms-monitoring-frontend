"use client";

import * as React from "react";
import { PackageCheck } from "lucide-react";
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
import { DeniedAction } from "@/components/auth/denied-action";
import { useInventoryActions } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";
import { formatPesos, formatQuantity } from "@/lib/utils";
import type { ShopOrder } from "@/types/inventory";

interface Entry {
  quantity: string;
  unitCost: string;
}

/**
 * Takes goods in against an issued order, in whole or in part. Nothing more
 * than is still outstanding can be received; the invoice's price may differ
 * from the order's and is the cost the stock is held at.
 */
export function ReceiveGoodsDialog({ order }: { order: ShopOrder }) {
  const { receiveGoods } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [entries, setEntries] = React.useState<Record<string, Entry>>({});
  const [supplierRef, setSupplierRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    // Everything still outstanding, at the order's price, until the clerk says otherwise.
    setEntries(
      Object.fromEntries(
        order.lines.map((line) => [line.id, { quantity: line.outstandingQuantity > 0 ? String(line.outstandingQuantity) : "", unitCost: String(line.unitCost) }])
      )
    );
    setSupplierRef("");
    setNotes("");
    setError(null);
  }, [open, order]);

  const patch = (id: string, changes: Partial<Entry>) => setEntries((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  const receiving = order.lines.filter((line) => Number(entries[line.id]?.quantity) > 0);
  const canSubmit = receiving.length > 0 && !pending;

  async function submit() {
    setPending(true);
    setError(null);
    const result = await receiveGoods(order.id, {
      supplierRef: supplierRef.trim() || undefined,
      notes: notes.trim() || undefined,
      lines: receiving.map((line) => {
        const entry = entries[line.id];
        const cost = Number(entry.unitCost);
        return {
          orderLineId: line.id,
          quantity: Number(entry.quantity),
          ...(Number.isFinite(cost) && cost !== line.unitCost ? { unitCost: cost } : {}),
        };
      }),
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
      <PackageCheck />
      Receive
    </Button>
  );

  if (!canAsStaff("inventory:manage")) {
    return <DeniedAction reason={staffReason("inventory:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive {order.reference}</DialogTitle>
          <DialogDescription>
            From {order.vendorName}. Take in what arrived; the rest stays on order. Quantities are in the unit the order was placed in.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            {order.lines.map((line) => {
              const unit = line.purchaseUom ?? line.item?.uom ?? "unit";
              const done = line.outstandingQuantity <= 0;
              return (
                <div key={line.id} className="grid grid-cols-[1fr_7rem_7rem] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{line.description}</p>
                    <p className="text-2xs text-subtle-foreground">
                      {formatQuantity(line.receivedQuantity)} of {formatQuantity(line.quantity)} {unit} in · {formatQuantity(line.outstandingQuantity)} outstanding ·
                      ordered at {formatPesos(line.unitCost)}
                    </p>
                  </div>
                  <Input
                    aria-label={`Receive ${line.description} (${unit})`}
                    type="number"
                    min={0}
                    step="any"
                    disabled={done}
                    placeholder={done ? "Complete" : unit}
                    value={entries[line.id]?.quantity ?? ""}
                    className="tabular text-xs"
                    onChange={(e) => patch(line.id, { quantity: e.target.value })}
                  />
                  <Input
                    aria-label={`Unit cost of ${line.description} (₱)`}
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={done}
                    value={entries[line.id]?.unitCost ?? ""}
                    className="tabular text-xs"
                    onChange={(e) => patch(line.id, { unitCost: e.target.value })}
                  />
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gr-ref">Delivery note / invoice no.</Label>
              <Input id="gr-ref" value={supplierRef} placeholder="Optional" onChange={(e) => setSupplierRef(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gr-notes">Notes</Label>
              <Input id="gr-notes" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
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
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            Receive goods
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
