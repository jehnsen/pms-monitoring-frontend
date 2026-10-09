"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFleetActions } from "@/lib/store";
import type { WorkOrder } from "@/types";

/**
 * Cancelling a work order (`POST /work-orders/{id}/cancel`). The API asks
 * for a reason — it goes into the order's history — and decides whether the
 * order can still be cancelled at all.
 */
export function CancelWorkOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Pick<WorkOrder, "id" | "displayReference" | "title">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { cancelWorkOrder } = useFleetActions();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function onConfirm() {
    if (!reason.trim()) {
      setError("Say why it is being cancelled.");
      return;
    }
    setPending(true);
    const result = await cancelWorkOrder(order.id, reason.trim());
    setPending(false);
    if (!result.ok) {
      setError(result.fields?.reason?.[0] ?? result.error);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {order.displayReference}</DialogTitle>
          <DialogDescription>{order.title}. A cancelled order stays on record and cannot be reopened.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Customer withdrew the request…"
            />
          </div>
          {error ? <p className="mt-3 text-xs text-critical">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void onConfirm()}>
            Cancel work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
