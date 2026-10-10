"use client";

import * as React from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDetailingCatalogue } from "@/lib/detailing";
import { useEquipmentActions, useEquipmentBoard, useEquipmentProfiles } from "@/lib/equipment";
import { useCan } from "@/lib/rbac";

type Line = { equipmentId: string; hoursPerJob: string };

/**
 * Service profiles: which tools each detailing package puts hours on, and how
 * many per completed job. This is the only way a tool ages from bookings: a
 * tool mapped to no package never does. Saving a package's list replaces it.
 */
export default function EquipmentProfilesPage() {
  const catalogue = useDetailingCatalogue({ includeInactive: true });
  const board = useEquipmentBoard();
  const profiles = useEquipmentProfiles();
  const actions = useEquipmentActions();
  const { can, reason } = useCan();
  const manages = can("equipment:manage");

  const [drafts, setDrafts] = React.useState<Record<string, Line[]>>({});
  const [saving, setSaving] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Record<string, { ok: boolean; text: string }>>({});

  const error = catalogue.error ?? board.error ?? profiles.error;
  if (error) return <QueryError error={error} onRetry={() => void Promise.all([catalogue.refetch(), board.refetch(), profiles.refetch()])} />;
  if (!catalogue.data || !board.data || !profiles.data) return <Skeleton className="h-96" />;

  const saved = (packageId: string): Line[] => profiles.data.filter((line) => line.packageId === packageId).map((line) => ({ equipmentId: line.equipmentId, hoursPerJob: String(Number(line.hoursPerJob)) }));
  const linesOf = (packageId: string) => drafts[packageId] ?? saved(packageId);
  const edit = (packageId: string, lines: Line[]) => setDrafts((current) => ({ ...current, [packageId]: lines }));

  async function save(packageId: string) {
    setSaving(packageId);
    const result = await actions.setProfile(
      packageId,
      linesOf(packageId).filter((line) => line.equipmentId !== "")
    );
    setSaving(null);
    setMessages((current) => ({ ...current, [packageId]: result.ok ? { ok: true, text: "Saved." } : { ok: false, text: Object.values(result.fields ?? {})[0]?.[0] ?? result.error } }));
    if (result.ok) setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== packageId)));
  }

  return (
    <>
      <PageHeader
        title="Service profiles"
        description="Which tools each detailing package runs, and for how many hours per completed job. A tool ages only on the packages it is mapped to."
      />
      <div className="space-y-4">
        {catalogue.data.packages.map((pkg) => {
          const lines = linesOf(pkg.id);
          const dirty = drafts[pkg.id] !== undefined;
          const message = messages[pkg.id];
          const saveButton = (
            <Button size="sm" variant="primary" disabled={!dirty || saving === pkg.id} onClick={() => void save(pkg.id)}>
              <Save />
              {saving === pkg.id ? "Saving…" : "Save"}
            </Button>
          );
          return (
            <section key={pkg.id} className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{pkg.name}</h2>
                  <p className="text-2xs text-subtle-foreground">
                    {pkg.duration.interpreted}
                    {pkg.isActive ? "" : " · switched off"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {message ? (
                    <span role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-ok" : "text-xs text-critical"}>
                      {message.text}
                    </span>
                  ) : null}
                  {manages ? saveButton : <DeniedAction reason={reason("equipment:manage")}>{saveButton}</DeniedAction>}
                </div>
              </div>

              {lines.length === 0 ? <p className="mb-3 text-xs text-muted-foreground">No tool is mapped: jobs of this package put no hours on anything.</p> : null}
              <ul className="space-y-2">
                {lines.map((line, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <Select value={line.equipmentId} onValueChange={(equipmentId) => edit(pkg.id, lines.map((l, i) => (i === index ? { ...l, equipmentId } : l)))} disabled={!manages}>
                      <SelectTrigger className="h-9 min-w-56 flex-1" aria-label={`Tool ${index + 1} of ${pkg.name}`}>
                        <SelectValue placeholder="Choose a tool" />
                      </SelectTrigger>
                      <SelectContent>
                        {board.data.tools.map((tool) => (
                          <SelectItem key={tool.id} value={tool.id} disabled={lines.some((l, i) => i !== index && l.equipmentId === tool.id)}>
                            {tool.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-9 w-24"
                      type="number"
                      min={0}
                      step="0.25"
                      value={line.hoursPerJob}
                      disabled={!manages}
                      aria-label={`Hours per job for tool ${index + 1} of ${pkg.name}`}
                      onChange={(event) => edit(pkg.id, lines.map((l, i) => (i === index ? { ...l, hoursPerJob: event.target.value } : l)))}
                    />
                    <span className="text-2xs text-subtle-foreground">h per job</span>
                    {manages ? (
                      <button type="button" aria-label={`Remove tool ${index + 1} from ${pkg.name}`} onClick={() => edit(pkg.id, lines.filter((_, i) => i !== index))} className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-critical">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {manages ? (
                <Button size="sm" className="mt-3" onClick={() => edit(pkg.id, [...lines, { equipmentId: "", hoursPerJob: "1" }])}>
                  <Plus />
                  Add a tool
                </Button>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
