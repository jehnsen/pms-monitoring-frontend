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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBays, useFleetActions, useTechnicians } from "@/lib/store";
import type { WorkOrder } from "@/types";

const NO_TECHNICIAN = "__none__";

/**
 * The step between purchasing signing off and a technician touching the
 * vehicle: booking a bay, a date and a time (`POST /work-orders/{id}/schedule`,
 * staff only — bays belong to the shop). Re-booking is allowed. Nothing stops
 * two jobs sharing a bay; the floor view just reads over 100%.
 */
export function ScheduleDialog({ order }: { order: WorkOrder }) {
  const { scheduleWorkOrder } = useFleetActions();
  const [open, setOpen] = React.useState(false);
  const { bays } = useBays({ enabled: open });
  const { technicians } = useTechnicians({ enabled: open });
  const [date, setDate] = React.useState(order.scheduledFor ?? formatISO(addDays(new Date(), 1), { representation: "date" }));
  const [time, setTime] = React.useState(order.scheduledTime ?? "09:00");
  const [bayId, setBayId] = React.useState(order.bayId ?? "");
  const [technicianId, setTechnicianId] = React.useState(order.technicianId ?? NO_TECHNICIAN);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Bays and technicians of the order's own branch (all, for a request not yet taken in).
  const branchBays = bays.filter((bay) => bay.status === "active" && (!order.branchId || bay.branchId === order.branchId));
  const branchTechnicians = technicians.filter((tech) => tech.active && (!order.branchId || tech.branchId === order.branchId));

  async function confirm() {
    setPending(true);
    setError(null);
    const result = await scheduleWorkOrder(order.id, {
      scheduledFor: date,
      scheduledTime: time,
      bayId,
      technicianId: technicianId === NO_TECHNICIAN ? null : technicianId,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.fields ? Object.values(result.fields)[0]?.[0] ?? result.error : result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <CalendarClock />
          {order.status === "scheduled" ? "Re-book" : "Schedule"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule {order.displayReference}</DialogTitle>
          <DialogDescription>Books a bay slot for the approved lines on this order.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-date">Date</Label>
              <Input id="schedule-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-time">Time</Label>
              <Input id="schedule-time" type="time" step={900} value={time} onChange={(event) => setTime(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-bay">Bay</Label>
            <Select value={bayId} onValueChange={setBayId}>
              <SelectTrigger id="schedule-bay">
                <SelectValue placeholder="Choose a bay" />
              </SelectTrigger>
              <SelectContent>
                {branchBays.map((bay) => (
                  <SelectItem key={bay.id} value={bay.id}>
                    {bay.name}
                    {bay.focus ? ` · ${bay.focus}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-tech">Technician</Label>
            <Select value={technicianId} onValueChange={setTechnicianId}>
              <SelectTrigger id="schedule-tech">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TECHNICIAN}>Assign at start</SelectItem>
                {branchTechnicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-xs text-critical">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!date || !time || !bayId || pending} onClick={() => void confirm()}>
            {pending ? "Booking…" : "Confirm slot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
