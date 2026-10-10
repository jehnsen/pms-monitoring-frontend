"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEquipmentActions, useEquipmentOptions, type EquipmentDraft } from "@/lib/equipment";
import type { Equipment } from "@/types/equipment";

const blank: EquipmentDraft = {
  name: "",
  category: "other",
  brand: "",
  model: "",
  serialNumber: "",
  conditionRating: "good",
  meterType: "hours",
  purchaseDate: "",
  purchaseCost: "",
  baselineHours: "",
  baselineCycles: "",
  serviceIntervalHours: "",
  serviceIntervalCycles: "",
  serviceIntervalDays: "",
  expectedLifeHours: "",
  maintenanceTask: "",
  notes: "",
};

const fromTool = (tool: Equipment): EquipmentDraft => ({
  name: tool.name,
  category: tool.category,
  brand: tool.brand,
  model: tool.model,
  serialNumber: tool.serialNumber,
  conditionRating: tool.conditionRating,
  meterType: tool.meterType,
  purchaseDate: tool.purchaseDate ?? "",
  purchaseCost: tool.purchaseCost ? String(tool.purchaseCost) : "",
  baselineHours: Number(tool.baselineHours) ? String(Number(tool.baselineHours)) : "",
  baselineCycles: tool.baselineCycles ? String(tool.baselineCycles) : "",
  serviceIntervalHours: tool.serviceIntervalHours ? String(Number(tool.serviceIntervalHours)) : "",
  serviceIntervalCycles: tool.serviceIntervalCycles ? String(tool.serviceIntervalCycles) : "",
  serviceIntervalDays: tool.serviceIntervalDays ? String(tool.serviceIntervalDays) : "",
  expectedLifeHours: tool.expectedLifeHours ? String(Number(tool.expectedLifeHours)) : "",
  maintenanceTask: tool.maintenanceTask,
  notes: tool.notes,
});

/**
 * Register or edit a tool. Choosing a category on a NEW tool fills the
 * metering fields with that category's starting values (the API's presets);
 * everything stays editable. Set any of the three service intervals: the first
 * to trip is the one the monitor plans around.
 */
export function EquipmentFormDialog({ tool, onClose }: { tool: Equipment | null; onClose: () => void }) {
  const options = useEquipmentOptions();
  const actions = useEquipmentActions();
  const [draft, setDraft] = React.useState<EquipmentDraft>(() => (tool ? fromTool(tool) : blank));
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const set = (key: keyof EquipmentDraft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  function chooseCategory(category: string) {
    const preset = options.data?.categoryPresets[category];
    setDraft((current) => {
      if (tool || !preset) return { ...current, category };
      const text = (key: string) => (preset[key] === undefined ? "" : String(preset[key]));
      return {
        ...current,
        category,
        meterType: text("meter_type") || "hours",
        serviceIntervalHours: text("service_interval_hours"),
        serviceIntervalCycles: text("service_interval_cycles"),
        serviceIntervalDays: text("service_interval_days"),
        expectedLifeHours: text("expected_life_hours"),
        maintenanceTask: text("maintenance_task"),
      };
    });
  }

  async function save() {
    setBusy(true);
    setFailure(null);
    const result = await actions.saveTool(draft, tool?.id);
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }

  const choice = (id: string, label: string, value: string, items: { value: string; label: string }[] | undefined, onChange: (value: string) => void) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(items ?? []).map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const field = (key: keyof EquipmentDraft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`eq-${key}`}>{label}</Label>
      <Input id={`eq-${key}`} value={draft[key]} onChange={set(key)} {...props} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tool ? `Edit ${tool.name}` : "Register a tool"}</DialogTitle>
          <DialogDescription>Runtime is not typed in here: it comes from completed jobs of the packages the tool is mapped to, and from its usage log.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", "Name")}
            {choice("eq-category", "Category", draft.category, options.data?.categories, chooseCategory)}
            {field("brand", "Brand")}
            {field("model", "Model")}
            {field("serialNumber", "Serial number")}
            {choice("eq-condition", "Condition", draft.conditionRating, options.data?.conditions, (conditionRating) => setDraft((c) => ({ ...c, conditionRating })))}
            {field("purchaseDate", "Purchase date", { type: "date" })}
            {field("purchaseCost", "Purchase cost (₱)", { type: "number", min: 0, step: "0.01" })}
          </div>

          <fieldset className="space-y-3 rounded-md border border-border p-4">
            <legend className="px-1 text-xs font-medium">Metering and preventive maintenance</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              {choice("eq-meter", "Mainly metered by", draft.meterType, options.data?.meterTypes, (meterType) => setDraft((c) => ({ ...c, meterType })))}
              {field("baselineHours", "Hours already on it", { type: "number", min: 0, step: "0.1" })}
              {field("baselineCycles", "Jobs already on it", { type: "number", min: 0, step: "1" })}
              {field("serviceIntervalHours", "Service every (hours)", { type: "number", min: 0, step: "0.1" })}
              {field("serviceIntervalCycles", "Service every (jobs)", { type: "number", min: 0, step: "1" })}
              {field("serviceIntervalDays", "Service every (days)", { type: "number", min: 0, step: "1" })}
              {field("expectedLifeHours", "Rated life (hours)", { type: "number", min: 0, step: "1" })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-task">What the service is</Label>
              <Input id="eq-task" value={draft.maintenanceTask} onChange={set("maintenanceTask")} />
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="eq-notes">Notes</Label>
            <Textarea id="eq-notes" rows={2} value={draft.notes} onChange={set("notes")} />
          </div>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || draft.name.trim() === ""} onClick={() => void save()}>
            {busy ? "Saving…" : tool ? "Save changes" : "Register tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
