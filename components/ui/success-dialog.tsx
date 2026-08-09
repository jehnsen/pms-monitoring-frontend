"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirms a creation succeeded, e.g. "Vehicle added" after `addVehicle`.
 *
 * This app has no toast system — dialogs are the established way of telling
 * the user something happened (see `CompleteWorkOrderDialog`,
 * `AutoScheduleDialog`) — so a success state is one more dialog rather than a
 * new notification pattern. `open`/`onOpenChange` are controlled by the
 * caller, which owns the state that triggers it (typically "did the create
 * call return a record").
 */
export function SuccessDialog({
  open,
  onOpenChange,
  title,
  description,
  primaryAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Optional extra action alongside "Done", e.g. "View vehicle". */
  primaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok">
              <CheckCircle2 className="size-5" />
            </span>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="mt-0">{description}</DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          {primaryAction ? (
            <Button variant="primary" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
