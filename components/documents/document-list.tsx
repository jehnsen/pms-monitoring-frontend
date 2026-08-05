"use client";

import Link from "next/link";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Download, FileX2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { DOCUMENT_KIND_ICON, DOCUMENT_KIND_LABEL } from "@/lib/documents";
import { DOCUMENT_EXPIRY_WARNING_DAYS } from "@/lib/alerts";
import { formatBytes, formatDate, formatDayDelta } from "@/lib/utils";
import type { FleetDocument } from "@/types";

function ExpiryChip({ expiresOn }: { expiresOn: string }) {
  const days = differenceInCalendarDays(parseISO(expiresOn), new Date());
  if (days > DOCUMENT_EXPIRY_WARNING_DAYS) {
    return (
      <span className="tabular text-2xs text-subtle-foreground">
        Valid to {formatDate(expiresOn)}
      </span>
    );
  }
  return (
    <Badge tone={days < 0 ? "critical" : "warning"}>
      {days < 0 ? "Expired" : "Expires"} {formatDayDelta(days).replace("in ", "in ")}
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
  const { vehiclesById } = useFleet();
  const { deleteDocument } = useFleetActions();
  const { can, reason } = useCan();

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
                {DOCUMENT_KIND_LABEL[doc.kind]} · {formatBytes(doc.sizeBytes)} ·
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

            {doc.expiresOn ? <ExpiryChip expiresOn={doc.expiresOn} /> : null}

            <div className="flex items-center gap-1">
              {/* Seeded records are metadata only — there is no file behind them. */}
              {doc.dataUrl ? (
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={doc.dataUrl}
                    download={doc.name}
                    aria-label={`Download ${doc.name}`}
                  >
                    <Download />
                  </a>
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
                  onClick={() => deleteDocument(doc.id)}
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
  );
}
