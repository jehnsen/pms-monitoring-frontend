"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { ArrowDownWideNarrow, FileWarning, FolderOpen, HardDrive, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentList } from "@/components/documents/document-list";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFleet } from "@/lib/store";
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABEL } from "@/lib/documents";
import { DOCUMENT_EXPIRY_WARNING_DAYS } from "@/lib/alerts";
import { documentExpiryStatus, type ComplianceStatus } from "@/lib/compliance";
import { formatBytes } from "@/lib/utils";
import type { DocumentKind } from "@/types";

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  expired: "Expired",
  expiring: "Expiring soon",
  ok: "Valid",
};

export default function DocumentsPage() {
  const { ready, documents, vehicles, vehiclesById } = useFleet();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DocumentKind | "all">("all");
  const [vehicleId, setVehicleId] = useState("all");
  const [status, setStatus] = useState<ComplianceStatus | "all">("all");
  const [sortByExpiry, setSortByExpiry] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return documents
      .filter((doc) => {
        if (kind !== "all" && doc.kind !== kind) return false;
        if (vehicleId !== "all" && doc.vehicleId !== vehicleId) return false;
        if (status !== "all" && documentExpiryStatus(doc) !== status) return false;
        if (!q) return true;
        const plate = doc.vehicleId
          ? (vehiclesById.get(doc.vehicleId)?.plateNumber ?? "")
          : "";
        return `${doc.name} ${doc.notes} ${doc.uploadedBy} ${plate}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        sortByExpiry
          ? (a.expiresOn ?? "9999-99-99").localeCompare(b.expiresOn ?? "9999-99-99")
          : b.uploadedOn.localeCompare(a.uploadedOn)
      );
  }, [documents, query, kind, vehicleId, status, sortByExpiry, vehiclesById]);

  if (!ready) {
    return (
      <>
        <PageHeader
          title="Documents"
          description="Invoices, reports, policies, and logs in one place."
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  const totalBytes = documents.reduce((total, doc) => total + doc.sizeBytes, 0);
  const expiringSoon = documents.filter((doc) => {
    if (!doc.expiresOn) return false;
    return (
      differenceInCalendarDays(parseISO(doc.expiresOn), new Date()) <=
      DOCUMENT_EXPIRY_WARNING_DAYS
    );
  }).length;

  return (
    <>
      <PageHeader
        title="Documents"
        description="Every invoice, service report, policy, and certificate filed against the fleet."
        actions={<UploadDocumentDialog />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Documents on file"
          value={String(documents.length)}
          hint={`Across ${vehicles.length} vehicles`}
          icon={FolderOpen}
        />
        <StatTile
          label="Needing renewal"
          value={String(expiringSoon)}
          hint={`Expiring within ${DOCUMENT_EXPIRY_WARNING_DAYS} days, or already expired`}
          icon={FileWarning}
          tone={expiringSoon > 0 ? "warning" : "ok"}
        />
        <StatTile
          label="Repository size"
          value={formatBytes(totalBytes)}
          hint="Seeded records are metadata only"
          icon={HardDrive}
        />
      </div>

      <div className="mb-5 mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search file name, plate, or notes…"
            className="pl-9"
            aria-label="Search documents"
          />
        </div>

        <Select
          value={kind}
          onValueChange={(value) => setKind(value as DocumentKind | "all")}
        >
          <SelectTrigger className="w-[184px]" aria-label="Filter by document type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All document types</SelectItem>
            {DOCUMENT_KINDS.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {DOCUMENT_KIND_LABEL[entry]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger className="w-[204px]" aria-label="Filter by vehicle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vehicles</SelectItem>
            {vehicles.map((vehicle) => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber} — {vehicle.make} {vehicle.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ComplianceStatus | "all")}
        >
          <SelectTrigger className="w-[160px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="expired">{STATUS_LABEL.expired}</SelectItem>
            <SelectItem value="expiring">{STATUS_LABEL.expiring}</SelectItem>
            <SelectItem value="ok">{STATUS_LABEL.ok}</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="secondary"
          aria-pressed={sortByExpiry}
          onClick={() => setSortByExpiry((current) => !current)}
        >
          <ArrowDownWideNarrow />
          {sortByExpiry ? "Sorted by expiry" : "Sort by expiry"}
        </Button>
      </div>

      <p className="mb-4 text-xs text-subtle-foreground">
        Showing {filtered.length} of {documents.length} documents.
      </p>

      <div className="card-raised">
        <DocumentList
          documents={filtered}
          showVehicle
          emptyTitle="No documents match those filters"
          emptyDescription="Try a different type, vehicle, or clear the search."
        />
      </div>
    </>
  );
}
