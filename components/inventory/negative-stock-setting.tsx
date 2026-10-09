"use client";

import * as React from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useBranchStockPolicies, useInventoryActions } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";
import type { NegativeStockPolicy } from "@/types/inventory";

const POLICY_LABEL: Record<NegativeStockPolicy, string> = {
  allow_and_flag: "Allow and flag — the move goes through and is marked",
  block: "Block — refuse a move that would take stock below zero",
};

/** What each branch does when a move would leave a balance below zero (a branch setting; `organization:manage`). */
export function NegativeStockSetting() {
  const { branches } = useBranchStockPolicies();
  const { setNegativeStockPolicy } = useInventoryActions();
  const { can, reason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);

  async function change(branchId: string, policy: NegativeStockPolicy) {
    setSaving(branchId);
    setError(null);
    const result = await setNegativeStockPolicy(branchId, policy);
    setSaving(null);
    if (!result.ok) setError(result.error);
  }

  const trigger = (
    <Button variant="secondary" size="sm">
      <Scale />
      Negative stock
    </Button>
  );

  if (!can("organization:manage")) {
    return <DeniedAction reason={reason("organization:manage")}>{trigger}</DeniedAction>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>When stock would go below zero</DialogTitle>
          <DialogDescription>
            Each branch decides. A branch that allows it flags the move so it can be reconciled; a branch that blocks it refuses the receipt, issue or transfer
            outright.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {branches.map((branch) => (
            <div key={branch.id} className="space-y-1.5">
              <Label htmlFor={`neg-${branch.id}`}>{branch.name}</Label>
              <Select value={branch.policy} disabled={saving === branch.id} onValueChange={(value) => void change(branch.id, value as NegativeStockPolicy)}>
                <SelectTrigger id={`neg-${branch.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(POLICY_LABEL) as [NegativeStockPolicy, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {error ? (
            <p role="alert" className="text-xs text-critical">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
