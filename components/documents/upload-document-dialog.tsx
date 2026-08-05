"use client";

import * as React from "react";
import { AlertCircle, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeniedAction } from "@/components/auth/denied-action";
import { MAX_DOCUMENT_BYTES, useFleet, useFleetActions } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { useSession } from "@/lib/auth";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  EXPIRING_KINDS,
} from "@/lib/documents";
import { formatBytes } from "@/lib/utils";
import type { DocumentKind } from "@/types";

/**
 * Files are read into a data URL and kept in localStorage alongside the fleet,
 * which is why the size cap exists — a couple of large PDFs would exhaust the
 * origin's quota and take the rest of the app's state down with them. A real
 * deployment would post to object storage and keep only the key.
 */
export function UploadDocumentDialog({
  vehicleId,
  workOrderId,
  size = "md",
}: {
  vehicleId?: string;
  workOrderId?: string;
  size?: "sm" | "md";
}) {
  const { vehicles } = useFleet();
  const { addDocument } = useFleetActions();
  const { can, reason } = useCan();
  const { session } = useSession();

  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState<DocumentKind>("invoice");
  const [linkedVehicle, setLinkedVehicle] = React.useState(vehicleId ?? "none");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setNotes("");
    setExpiresOn("");
    setLinkedVehicle(vehicleId ?? "none");
  }, [open, vehicleId]);

  const trigger = (
    <Button variant={size === "sm" ? "secondary" : "primary"} size={size}>
      {size === "sm" ? <Paperclip /> : <Upload />}
      {size === "sm" ? "Attach" : "Upload document"}
    </Button>
  );

  if (!can("document:upload")) {
    return <DeniedAction reason={reason("document:upload")}>{trigger}</DeniedAction>;
  }

  const oversized = file ? file.size > MAX_DOCUMENT_BYTES : false;
  const canSubmit = Boolean(file) && !oversized && !busy;

  function readAsDataUrl(source: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("The file could not be read."));
      reader.readAsDataURL(source);
    });
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);

    try {
      const dataUrl = await readAsDataUrl(file);
      const result = addDocument({
        name: file.name,
        kind,
        vehicleId: linkedVehicle === "none" ? null : linkedVehicle,
        workOrderId: workOrderId ?? null,
        uploadedBy: session?.name ?? "Unknown",
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        dataUrl,
        expiresOn: EXPIRING_KINDS.includes(kind) && expiresOn ? expiresOn : null,
        notes: notes.trim(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The file could not be read."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            Invoices, service reports, policies, and inspection certificates —
            filed against a vehicle so they surface with its history.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.csv,.xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
              className="h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs file:font-medium"
            />
            <p
              className={
                oversized ? "text-xs text-critical" : "text-xs text-subtle-foreground"
              }
            >
              {file
                ? `${file.name} · ${formatBytes(file.size)}`
                : `Up to ${formatBytes(MAX_DOCUMENT_BYTES)} in this demo build.`}
              {oversized ? " — too large to store in the browser." : ""}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-kind">Document type</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as DocumentKind)}
              >
                <SelectTrigger id="doc-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_KINDS.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {DOCUMENT_KIND_LABEL[entry]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-vehicle">Vehicle</Label>
              <Select value={linkedVehicle} onValueChange={setLinkedVehicle}>
                <SelectTrigger id="doc-vehicle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not vehicle-specific</SelectItem>
                  {vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.plateNumber} — {vehicle.make} {vehicle.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Only shown for kinds that actually renew — an expiry on an invoice
              would be noise, and would raise meaningless alerts. */}
          {EXPIRING_KINDS.includes(kind) ? (
            <div className="space-y-1.5">
              <Label htmlFor="doc-expiry">Expires on</Label>
              <Input
                id="doc-expiry"
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
              />
              <p className="text-xs text-subtle-foreground">
                An alert is raised inside 45 days of this date.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="doc-notes">Notes</Label>
            <Textarea
              id="doc-notes"
              value={notes}
              placeholder="Anything that helps someone find this later."
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-critical/25 bg-critical/[0.07] px-3 py-2 text-xs text-critical"
            >
              <AlertCircle className="mt-px size-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            {busy ? "Filing…" : "File document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
