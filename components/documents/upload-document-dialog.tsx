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
import { MAX_DOCUMENT_BYTES, useAllVehicles, useFleetActions, useFleetClients } from "@/lib/store";
import { useSession } from "@/lib/auth";
import { useCan } from "@/lib/rbac";
import {
  COMPLIANCE_DOC_KINDS,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  EXPIRING_KINDS,
} from "@/lib/documents";
import { formatBytes } from "@/lib/utils";
import type { DocumentKind } from "@/types";

/**
 * Uploads go to the API (multipart, `POST /documents`), which files them on
 * its private disk under the vehicle's (or work order's) account. The API caps
 * a file at 10 MB and checks the type; its answer is what's shown.
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
  const { addDocument } = useFleetActions();
  const { can, reason, side } = useCan();
  const { session } = useSession();

  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState<DocumentKind>("invoice");
  const [linkedVehicle, setLinkedVehicle] = React.useState(vehicleId ?? "none");
  // A document on no vehicle is filed against an account: the portal user's
  // own, or the one staff pick.
  const [accountId, setAccountId] = React.useState("");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [referenceNumber, setReferenceNumber] = React.useState("");
  const [issuedOn, setIssuedOn] = React.useState("");
  const [issuingBody, setIssuingBody] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const isCompliance = COMPLIANCE_DOC_KINDS.includes(kind);
  const { vehicles } = useAllVehicles();
  const { fleetClients } = useFleetClients({ enabled: open && side === "staff" });
  const fleetWide = !workOrderId && linkedVehicle === "none";
  const needsAccount = fleetWide && side === "staff";

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setNotes("");
    setExpiresOn("");
    setReferenceNumber("");
    setIssuedOn("");
    setIssuingBody("");
    setLinkedVehicle(vehicleId ?? "none");
    setAccountId("");
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
  const canSubmit = Boolean(file) && !oversized && !busy && (!needsAccount || Boolean(accountId));

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);

    try {
      const result = await addDocument({
        file,
        name: file.name,
        kind,
        // On a work order the API files it under the order's vehicle and account.
        vehicleId: workOrderId ? null : linkedVehicle === "none" ? null : linkedVehicle,
        workOrderId: workOrderId ?? null,
        fleetClientId: fleetWide ? (side === "staff" ? accountId : session?.fleetClientId ?? null) : null,
        expiresOn: EXPIRING_KINDS.includes(kind) && expiresOn ? expiresOn : null,
        referenceNumber: isCompliance && referenceNumber.trim() ? referenceNumber.trim() : null,
        issuedOn: isCompliance && issuedOn ? issuedOn : null,
        issuingBody: isCompliance && issuingBody.trim() ? issuingBody.trim() : null,
        notes: notes.trim(),
      });

      if (!result.ok) {
        setError(result.fields?.file?.[0] ?? result.error);
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
                : `Up to ${formatBytes(MAX_DOCUMENT_BYTES)}.`}
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

          {needsAccount ? (
            <div className="space-y-1.5">
              <Label htmlFor="doc-account">Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="doc-account">
                  <SelectValue placeholder="Whose document is this?" />
                </SelectTrigger>
                <SelectContent>
                  {fleetClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

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

          {/* Reference/issuer detail only matters for the compliance kinds —
              an invoice or photo has no OR/CR number to record. */}
          {isCompliance ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-reference">Reference number</Label>
                <Input
                  id="doc-reference"
                  value={referenceNumber}
                  placeholder="OR/CR, policy, or certificate no."
                  onChange={(event) => setReferenceNumber(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-issued">Issued on</Label>
                <Input
                  id="doc-issued"
                  type="date"
                  value={issuedOn}
                  onChange={(event) => setIssuedOn(event.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="doc-issuer">Issuing body</Label>
                <Input
                  id="doc-issuer"
                  value={issuingBody}
                  placeholder="e.g. LTO Quezon City, or the insurer's name"
                  onChange={(event) => setIssuingBody(event.target.value)}
                />
              </div>
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
