"use client";

import { Building } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/auth";
import { ALL_BRANCHES, setSelectedBranch, useSelectedBranch } from "@/lib/api/branch";

/**
 * The staff branch switcher. Its value goes out as `X-Branch-Id` on every
 * request (lib/api/client.ts); the API scopes lists, the shop floor and
 * new work to it. Saved per user, so a shared counter PC keeps each
 * person's own choice. Rendered only for staff who work in more than one
 * branch; portal users never see it.
 */
export function BranchSwitcher() {
  const { session } = useSession();
  const selected = useSelectedBranch();

  if (!session || session.side !== "staff" || session.branches.length < 2) return null;

  return (
    <Select value={selected ?? ALL_BRANCHES} onValueChange={(value) => setSelectedBranch(value === ALL_BRANCHES ? ALL_BRANCHES : value)}>
      <SelectTrigger className="h-9 w-[200px] gap-2 text-xs" aria-label="Branch">
        <Building className="size-3.5 shrink-0 text-subtle-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_BRANCHES}>All my branches</SelectItem>
        {session.branches.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
