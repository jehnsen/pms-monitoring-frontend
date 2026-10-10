"use client";

import * as React from "react";
import { Camera, ClipboardCheck } from "lucide-react";
import { DeniedAction } from "@/components/auth/denied-action";
import { DamageMap } from "@/components/detailing/damage-map";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDetailingActions } from "@/lib/detailing";
import { useCan } from "@/lib/rbac";
import { MAX_DOCUMENT_BYTES, useFleetActions } from "@/lib/store";
import { formatManilaTime } from "@/lib/utils";
import type { DamagePoint, DetailingBooking, DetailingInspection } from "@/types/detailing";

const CONDITIONS = ["excellent", "good", "fair", "poor"];

/**
 * One stage of the vehicle's inspection: ratings out of ten, condition,
 * mileage (recorded as an odometer reading by the API), notes, the damage map
 * and before/after photos. Saving a stage again replaces it.
 */
export function InspectionPanel({
  booking,
  stage,
  inspection,
}: {
  booking: DetailingBooking;
  stage: "check_in" | "check_out";
  inspection: DetailingInspection | undefined;
}) {
  const { can, reason } = useCan();
  const actions = useDetailingActions();
  const { downloadDocument } = useFleetActions();
  const [editing, setEditing] = React.useState(!inspection);
  const [overall, setOverall] = React.useState(String(inspection?.overallRating ?? ""));
  const [exterior, setExterior] = React.useState(inspection?.exteriorCondition ?? "");
  const [interior, setInterior] = React.useState(inspection?.interiorCondition ?? "");
  const [mileage, setMileage] = React.useState(inspection?.mileage != null ? String(inspection.mileage) : "");
  const [notes, setNotes] = React.useState(inspection?.notes ?? "");
  const [points, setPoints] = React.useState<DamagePoint[]>(inspection?.damagePoints ?? []);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [mileageWarning, setMileageWarning] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const phase = stage === "check_in" ? "before" : "after";
  const title = stage === "check_in" ? "Check-in inspection" : "Hand-back inspection";
  const allowed = can("detailing:work");

  async function save(confirmMileage = false) {
    const rating = Number(overall);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      setFailure("Rate the vehicle overall, from 1 to 10.");
      return;
    }
    if (points.some((point) => point.note.trim() === "")) {
      setFailure("Say what is at each marked point.");
      return;
    }
    setBusy(true);
    setFailure(null);
    const result = await actions.recordInspection(booking.id, {
      stage,
      overallRating: rating,
      exteriorCondition: exterior || undefined,
      interiorCondition: interior || undefined,
      mileage: mileage.trim() === "" ? undefined : Number(mileage),
      confirmMileage,
      notes,
      damagePoints: points,
    });
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      setMileageWarning(null);
      return;
    }
    // An implausible reading: the API asks for confirmation before it records it.
    if (result.fields?.confirm_warning) {
      setMileageWarning(result.fields.value?.[0] ?? result.error);
      return;
    }
    setFailure(result.fields?.mileage?.[0] ?? result.error);
  }

  async function upload(file: File) {
    if (!inspection) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      setFailure("A photo can be 10 MB at most.");
      return;
    }
    setBusy(true);
    setFailure(null);
    const result = await actions.addPhoto(booking.id, inspection.id, file, phase);
    setBusy(false);
    if (!result.ok) setFailure(result.error);
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {inspection ? (
            <p className="text-2xs text-subtle-foreground">
              Recorded by {inspection.recordedByName}, {formatManilaTime(inspection.recordedAt)}
            </p>
          ) : (
            <p className="text-2xs text-subtle-foreground">Not recorded yet.</p>
          )}
        </div>
        {inspection && !editing ? (
          allowed ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : (
            <DeniedAction reason={reason("detailing:work")}>
              <Button size="sm">Edit</Button>
            </DeniedAction>
          )
        ) : null}
      </div>

      {editing ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${stage}-overall`}>Overall (1–10)</Label>
              <Input id={`${stage}-overall`} type="number" min={1} max={10} value={overall} onChange={(event) => setOverall(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${stage}-exterior`}>Exterior</Label>
              <Select value={exterior} onValueChange={setExterior}>
                <SelectTrigger id={`${stage}-exterior`}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((condition) => (
                    <SelectItem key={condition} value={condition} className="capitalize">
                      {condition}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${stage}-interior`}>Interior</Label>
              <Select value={interior} onValueChange={setInterior}>
                <SelectTrigger id={`${stage}-interior`}>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((condition) => (
                    <SelectItem key={condition} value={condition} className="capitalize">
                      {condition}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${stage}-mileage`}>Mileage (km)</Label>
              <Input
                id={`${stage}-mileage`}
                type="number"
                min={0}
                value={mileage}
                onChange={(event) => setMileage(event.target.value)}
                disabled={!booking.vehicleId}
                placeholder={booking.vehicleId ? "" : "Link a vehicle first"}
              />
            </div>
          </div>
          <DamageMap points={points} onChange={setPoints} />
          <div className="space-y-1.5">
            <Label htmlFor={`${stage}-notes`}>Notes</Label>
            <Textarea id={`${stage}-notes`} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {mileageWarning ? (
            <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning/15 p-3 text-xs">
              <p>{mileageWarning}</p>
              <Button size="sm" onClick={() => void save(true)} disabled={busy}>
                The reading is right: save it
              </Button>
            </div>
          ) : null}
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
          <div className="flex gap-2">
            {allowed ? (
              <Button variant="primary" onClick={() => void save()} disabled={busy}>
                <ClipboardCheck />
                {busy ? "Saving…" : "Save inspection"}
              </Button>
            ) : (
              <DeniedAction reason={reason("detailing:work")}>
                <Button variant="primary">Save inspection</Button>
              </DeniedAction>
            )}
            {inspection ? (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </>
      ) : inspection ? (
        <>
          <dl className="grid gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-subtle-foreground">Overall</dt>
              <dd className="font-medium">{inspection.overallRating} / 10</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Exterior</dt>
              <dd className="capitalize">{inspection.exteriorCondition ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Interior</dt>
              <dd className="capitalize">{inspection.interiorCondition ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Mileage</dt>
              <dd className="tabular">{inspection.mileage != null ? `${inspection.mileage.toLocaleString("en-PH")} km` : "—"}</dd>
            </div>
          </dl>
          <DamageMap points={inspection.damagePoints} readOnly />
          {inspection.notes ? <p className="text-xs text-muted-foreground">{inspection.notes}</p> : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{phase === "before" ? "Before" : "After"} photos</p>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                aria-label={`Add a ${phase} photo`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void upload(file);
                }}
              />
              {allowed ? (
                <Button size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
                  <Camera />
                  Add photo
                </Button>
              ) : null}
            </div>
            {inspection.photos.length === 0 ? (
              <p className="text-xs text-subtle-foreground">No photos yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {inspection.photos.map((photo) => (
                  <li key={photo.id} className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-2xs">
                    <button type="button" className="text-brand hover:underline" onClick={() => void downloadDocument(photo.documentId)}>
                      {photo.caption || photo.name}
                    </button>
                    {allowed ? (
                      <button type="button" aria-label={`Remove ${photo.caption || photo.name}`} className="text-subtle-foreground hover:text-critical" onClick={() => void actions.removePhoto(booking.id, inspection.id, photo.id)}>
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {failure ? (
              <p role="alert" className="mt-2 text-xs text-critical">
                {failure}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
