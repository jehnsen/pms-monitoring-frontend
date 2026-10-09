"use client";

import * as React from "react";
import { ClipboardList, Plus } from "lucide-react";
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
import { useInventoryActions, useStockLocations } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";
import { formatPesos, formatQuantity } from "@/lib/utils";
import type { StockCount } from "@/types/inventory";

/** Draws a count sheet for one location from what the books hold. */
export function NewCountDialog() {
  const { openCount } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const { locations } = useStockLocations({ enabled: open });
  const [locationId, setLocationId] = React.useState("");
  const [reason, setReason] = React.useState("Cycle count");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open && !locationId && locations[0]) setLocationId(locations[0].id);
  }, [open, locationId, locations]);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await openCount({ locationId, reason: reason.trim() || undefined });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
  }

  const trigger = (
    <Button variant="primary" size="sm">
      <Plus />
      New count
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
          <DialogTitle>Draw a count sheet</DialogTitle>
          <DialogDescription>
            Lists every item the books hold in the location. Enter what is really on the shelf, then post: each difference becomes an adjustment with the
            reason below.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nc-location">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="nc-location">
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
          <div className="space-y-1.5">
            <Label htmlFor="nc-reason">Reason for any variance</Label>
            <Input id="nc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
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
          <Button variant="primary" disabled={!locationId || pending} onClick={() => void submit()}>
            Draw sheet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One count sheet. While open: the counted quantity per item (a line may have
 * its own reason), saved and then posted. Posted or cancelled: the variances
 * as the API fixed them.
 */
export function CountSheetDialog({ count }: { count: StockCount }) {
  const { enterCount, postCount, cancelCount } = useInventoryActions();
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [entries, setEntries] = React.useState<Record<string, { counted: string; reason: string }>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setEntries(
      Object.fromEntries(
        count.lines.map((line) => [line.item.id, { counted: line.countedQuantity === null ? "" : String(line.countedQuantity), reason: line.reason ?? "" }])
      )
    );
    setError(null);
  }, [open, count]);

  const manage = canAsStaff("inventory:manage");
  const editable = count.canEdit && manage;

  async function save(): Promise<boolean> {
    const result = await enterCount(
      count.id,
      count.lines
        .filter((line) => (entries[line.item.id]?.counted ?? "") !== String(line.countedQuantity ?? "") || (entries[line.item.id]?.reason ?? "") !== (line.reason ?? ""))
        .map((line) => {
          const entry = entries[line.item.id];
          return {
            itemId: line.item.id,
            countedQuantity: entry.counted.trim() === "" ? null : Number(entry.counted),
            reason: entry.reason.trim() === "" ? null : entry.reason.trim(),
          };
        })
    );
    if (!result.ok) setError(result.error);
    return result.ok;
  }

  async function run(action: "save" | "post" | "cancel") {
    setPending(true);
    setError(null);
    let ok = true;
    if (action === "cancel") {
      const result = await cancelCount(count.id);
      ok = result.ok;
      if (!result.ok) setError(result.error);
    } else {
      ok = await save();
      if (ok && action === "post") {
        const result = await postCount(count.id);
        ok = result.ok;
        if (!result.ok) setError(result.error);
      }
    }
    setPending(false);
    if (ok && action !== "save") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <ClipboardList />
          {count.status === "open" ? "Count" : "View"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {count.reference} — {count.status === "open" ? "counting" : count.status}
          </DialogTitle>
          <DialogDescription>
            {count.status === "open"
              ? "Enter what is on the shelf. Items left blank are not counted and are left alone. The variance is measured against what the books hold when you post."
              : count.status === "posted"
                ? `Posted${count.postedAt ? ` ${count.postedAt.slice(0, 10)}` : ""}. Every variance below became an adjustment move.`
                : "This sheet was cancelled; nothing moved."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <table className="w-full text-left text-xs">
            <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="px-2 py-2 text-right font-medium">Books</th>
                <th className="px-2 py-2 text-right font-medium">Counted</th>
                <th className="px-2 py-2 text-right font-medium">Variance</th>
                <th className="py-2 pl-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {count.lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2 pr-3">
                    <p className="font-medium">{line.item.name}</p>
                    <p className="tabular text-2xs text-subtle-foreground">{line.item.sku}</p>
                  </td>
                  <td className="tabular px-2 py-2 text-right">
                    {formatQuantity(line.expectedQuantity)} {line.item.uom}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {editable ? (
                      <Input
                        aria-label={`Counted ${line.item.name}`}
                        type="number"
                        min={0}
                        step="any"
                        value={entries[line.item.id]?.counted ?? ""}
                        className="tabular ml-auto h-8 w-24 text-right text-xs"
                        onChange={(e) => setEntries((current) => ({ ...current, [line.item.id]: { ...current[line.item.id], counted: e.target.value } }))}
                      />
                    ) : (
                      <span className="tabular">{line.countedQuantity === null ? "—" : formatQuantity(line.countedQuantity)}</span>
                    )}
                  </td>
                  <td className="tabular px-2 py-2 text-right">
                    {line.varianceQuantity === null ? (
                      "—"
                    ) : (
                      <span className={line.varianceQuantity === 0 ? "" : line.varianceQuantity < 0 ? "text-critical" : "text-ok"}>
                        {line.varianceQuantity > 0 ? "+" : ""}
                        {formatQuantity(line.varianceQuantity)}
                        {line.varianceValue !== null && line.varianceQuantity !== 0 ? ` (${formatPesos(line.varianceValue)})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-2">
                    {editable ? (
                      <Input
                        aria-label={`Reason for ${line.item.name}`}
                        value={entries[line.item.id]?.reason ?? ""}
                        placeholder={count.reason ?? "Reason"}
                        className="h-8 text-xs"
                        onChange={(e) => setEntries((current) => ({ ...current, [line.item.id]: { ...current[line.item.id], reason: e.target.value } }))}
                      />
                    ) : (
                      <span className="text-muted-foreground">{line.reason ?? ""}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {count.status === "posted" ? (
            <p className="text-xs text-muted-foreground">
              {count.summary.varianceLines} {count.summary.varianceLines === 1 ? "variance" : "variances"}, net {formatPesos(count.summary.netVarianceValue)}.
            </p>
          ) : null}
          {!manage && count.canEdit ? <p className="text-xs text-muted-foreground">{staffReason("inventory:manage")}</p> : null}
          {error ? (
            <p role="alert" className="text-xs text-critical">
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {editable ? (
            <>
              <Button variant="ghost" disabled={pending} onClick={() => void run("cancel")}>
                Cancel this count
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => void run("save")}>
                Save counts
              </Button>
              <Button variant="primary" disabled={pending} onClick={() => void run("post")}>
                Post adjustments
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
