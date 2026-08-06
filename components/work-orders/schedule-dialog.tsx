"use client";

import * as React from "react";
import { addDays, formatISO } from "date-fns";
import { CalendarClock } from "lucide-react";
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
import { useFleetActions } from "@/lib/store";
import type { WorkOrder } from "@/types";

/**
 * The step between purchasing signing off and a technician touching the
 * vehicle — only reachable once every line is either approved or declined
 * (see `deriveOrderStatus`).
 */
export function ScheduleDialog({ order }: { order: WorkOrder }) {
  const { scheduleWorkOrder } = useFleetActions();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(
    formatISO(addDays(new Date(), 3), { representation: "date" })
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <CalendarClock />
          Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule {order.reference}</DialogTitle>
          <DialogDescription>
            Books a bay slot for the approved lines on this order.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor="schedule-date">Scheduled for</Label>
          <Input
            id="schedule-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              scheduleWorkOrder(order.id, date);
              setOpen(false);
            }}
          >
            Confirm slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
