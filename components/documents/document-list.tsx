"use client";

import * as React from "react";
import Link from "next/link";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Download, FileX2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAllVehicles, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { DOCUMENT_KIND_ICON } from "@/lib/documents";
import { formatBytes, formatDate, formatDayDelta } from "@/lib/utils";
import type { ComplianceStatus, FleetDocument } from "@/types";

/** The API decides the status (`expiry_status`); the countdown is wording only. */
function ExpiryChip({ expiresOn, status }: { expiresOn: string; status: ComplianceStatus }) {
  const days = differenceInCalendarDays(parseISO(expiresOn), new Date());
  if (status === "ok") {
    return (
      <span className="tabular text-2xs text-subtle-foreground">
        Valid to {formatDate(expiresOn)}
      </span>
    );
  }
  return (
    <Badge tone={status === "expired" ? "critical" : "warning"}>
      {status === "expired" ? "Expired" : "Expires"} {formatDayDelta(days)}
    </Badge>
  );
}

export function DocumentList({
  documents,
  emptyTitle = "No documents",
  emptyDescription,
  showVehicle = false,
}: {
  documents: FleetDocument[];
  emptyTitle?: string;
  emptyDescription?: string;
  showVehicle?: boolean;
}) {
  const { vehiclesById } = useAllVehicles();
  const { deleteDocument, downloadDocument } = useFleetActions();
  const { can, reason } = useCan();
  const [error, setError] = React.useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const result = await action();
    if (!result.ok) setError(result.error ?? "That didn't work.");
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileX2}
        title={emptyTitle}
        description={emptyDescription}
        className="py-10"
      />
    );
  }

  return (
    <>
    {error ? <p role="alert" className="border-b border-border bg-critical/[0.06] px-5 py-2 text-xs text-critical">{error}</p> : null}
    <ul className="divide-y divide-border">
      {documents.map((doc) => {
        const Icon = DOCUMENT_KIND_ICON[doc.kind];
        const vehicle = doc.vehicleId ? vehiclesById.get(doc.vehicleId) : null;

        return (
          <li
            key={doc.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-surface-2/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
              <Icon className="size-4 text-subtle-foreground" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{doc.name}</p>
              <p className="mt-0.5 truncate text-2xs text-subtle-foreground">
                {doc.kindLabel} · {formatBytes(doc.sizeBytes)} ·
                filed {formatDate(doc.uploadedOn)} by {doc.uploadedBy}
                {showVehicle && vehicle ? (
                  <>
                    {" · "}
                    <Link
                      href={`/vehicles/${vehicle.id}`}
                      className="transition-colors hover:text-brand"
                    >
                      {vehicle.plateNumber}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>

            {doc.expiresOn ? <ExpiryChip expiresOn={doc.expiresOn} status={doc.expiryStatus} /> : null}

            <div className="flex items-center gap-1">
              {/* Seeded records are metadata only — there is no file behind them. */}
              {doc.hasFile ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download ${doc.name}`}
                  onClick={() => void run(() => downloadDocument(doc.id))}
                >
                  <Download />
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex opacity-40">
                      <Button variant="ghost" size="icon-sm" disabled>
                        <Download />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Reference record — the file itself lives outside this demo.
                  </TooltipContent>
                </Tooltip>
              )}

              {can("document:delete") ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${doc.name}`}
                  onClick={() => void run(() => deleteDocument(doc.id))}
                  className="text-subtle-foreground hover:text-critical"
                >
                  <Trash2 />
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex opacity-40">
                      <Button variant="ghost" size="icon-sm" disabled>
                        <Trash2 />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{reason("document:delete")}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}
