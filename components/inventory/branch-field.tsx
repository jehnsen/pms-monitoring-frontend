"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSelectedBranch } from "@/lib/api/branch";
import { useSession } from "@/lib/auth";

/**
 * The branch a new stock document belongs to. Starts at the branch picked in
 * the switcher (else the first the user works in); the API checks it again.
 */
export function useDefaultBranch(): string {
  const selected = useSelectedBranch();
  const { session } = useSession();
  return selected && selected !== "all" ? selected : (session?.branches[0]?.id ?? "");
}

export function BranchField({
  id,
  value,
  onChange,
  label = "Branch",
}: {
  id: string;
  value: string;
  onChange: (branchId: string) => void;
  label?: string;
}) {
  const { session } = useSession();
  const branches = session?.branches ?? [];

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={branches.length <= 1}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select a branch" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A branch's name by id, from the session's list. */
export function useBranchName(): (id: string | null | undefined) => string {
  const { session } = useSession();
  const branches = session?.branches;
  return React.useCallback((id) => branches?.find((branch) => branch.id === id)?.name ?? "—", [branches]);
}
