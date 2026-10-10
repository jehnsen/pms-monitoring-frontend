"use client";

import * as React from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDetailingActions, useDetailingCatalogue, useDurationReading, type PackageDraft } from "@/lib/detailing";
import { useItemOptions } from "@/lib/inventory";
import { useCan } from "@/lib/rbac";
import { formatPesos } from "@/lib/utils";
import type { DetailingAddon, DetailingCatalogue, DetailingPackage, SizeClass } from "@/types/detailing";

const SIZES: { value: SizeClass; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xl", label: "XL" },
];

type Editing = { kind: "package"; row: DetailingPackage | null } | { kind: "addon"; row: DetailingAddon | null } | null;

/**
 * Packages & pricing: the branch's detailing menu. A package is one row with
 * a price per vehicle size (a size left blank is not offered), a duration the
 * API reads back in plain words, the steps of its checklist, and the
 * materials a medium vehicle uses (scaled by size when the job completes).
 */
export default function DetailingPackagesPage() {
  const { data, error, isSuccess, refetch } = useDetailingCatalogue({ includeInactive: true });
  const { can, reason } = useCan();
  const manages = can("detailing:manage");
  const [editing, setEditing] = React.useState<Editing>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  const add = (kind: "package" | "addon", label: string) => {
    const button = (
      <Button variant={kind === "package" ? "primary" : "secondary"} onClick={() => setEditing({ kind, row: null })}>
        <Plus />
        {label}
      </Button>
    );
    return manages ? button : <DeniedAction reason={reason("detailing:manage")}>{button}</DeniedAction>;
  };

  return (
    <>
      <PageHeader title="Packages & pricing" description="The detailing menu of this branch. Each package and extra has a price per vehicle size; a size with no price is not offered." actions={add("package", "Add package")} />

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-8">
          {data.packages.length === 0 ? (
            <div className="card">
              <EmptyState icon={Sparkles} title="No packages yet" description="Add the first package to start taking bookings." />
            </div>
          ) : (
            <PriceTable
              caption="Packages"
              rows={data.packages.map((pkg) => ({
                id: pkg.id,
                name: pkg.name,
                detail: `${pkg.category?.name ?? "No category"} · ${pkg.duration.interpreted} · needs ${pkg.minDetailers}`,
                isActive: pkg.isActive,
                isPopular: pkg.isPopular,
                extra: pkg.materials.length > 0 ? `${pkg.materials.length} material${pkg.materials.length === 1 ? "" : "s"}` : "No materials",
                prices: pkg.prices,
                onEdit: manages ? () => setEditing({ kind: "package", row: pkg }) : undefined,
              }))}
            />
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Extras</h2>
              {add("addon", "Add extra")}
            </div>
            {data.addons.length === 0 ? (
              <p className="card p-5 text-xs text-muted-foreground">No extras yet.</p>
            ) : (
              <PriceTable
                caption="Extras"
                rows={data.addons.map((addon) => ({
                  id: addon.id,
                  name: addon.name,
                  detail: "",
                  isActive: addon.isActive,
                  isPopular: false,
                  extra: "",
                  prices: addon.prices,
                  onEdit: manages ? () => setEditing({ kind: "addon", row: addon }) : undefined,
                }))}
              />
            )}
          </section>
        </div>
      )}

      {editing?.kind === "package" && isSuccess ? <PackageDialog catalogue={data} row={editing.row} onClose={() => setEditing(null)} /> : null}
      {editing?.kind === "addon" ? <AddonDialog row={editing.row} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function PriceTable({
  caption,
  rows,
}: {
  caption: string;
  rows: { id: string; name: string; detail: string; extra: string; isActive: boolean; isPopular: boolean; prices: { sizeClass: SizeClass; price: number }[]; onEdit?: () => void }[];
}) {
  return (
    <section className="card-raised overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">{caption}, priced per vehicle size</caption>
        <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">
              {caption}
            </th>
            {SIZES.map((size) => (
              <th key={size.value} scope="col" className="px-3 py-3 text-right font-medium">
                {size.label}
              </th>
            ))}
            <th scope="col" className="px-5 py-3 text-right font-medium">
              <span className="sr-only">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className={row.isActive ? "" : "opacity-60"}>
              <td className="px-5 py-3">
                <span className="font-medium">{row.name}</span>
                {row.isPopular ? (
                  <Badge tone="brand" className="ml-2">
                    Popular
                  </Badge>
                ) : null}
                {!row.isActive ? (
                  <Badge tone="outline" className="ml-2">
                    Switched off
                  </Badge>
                ) : null}
                {row.detail || row.extra ? <p className="text-2xs text-subtle-foreground">{[row.detail, row.extra].filter(Boolean).join(" · ")}</p> : null}
              </td>
              {SIZES.map((size) => {
                const price = row.prices.find((p) => p.sizeClass === size.value);
                return (
                  <td key={size.value} className="tabular px-3 py-3 text-right">
                    {price ? formatPesos(price.price) : <span className="text-subtle-foreground">—</span>}
                  </td>
                );
              })}
              <td className="px-5 py-3 text-right">
                {row.onEdit ? (
                  <Button size="sm" variant="ghost" onClick={row.onEdit}>
                    Edit
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SizePrices({ prices, onChange }: { prices: Record<SizeClass, string>; onChange: (prices: Record<SizeClass, string>) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium">Price per vehicle size (₱)</legend>
      <div className="grid grid-cols-4 gap-2">
        {SIZES.map((size) => (
          <div key={size.value} className="space-y-1">
            <Label htmlFor={`price-${size.value}`} className="text-2xs text-subtle-foreground">
              {size.label}
            </Label>
            <Input id={`price-${size.value}`} type="number" min={0} step="0.01" value={prices[size.value]} onChange={(event) => onChange({ ...prices, [size.value]: event.target.value })} placeholder="Not offered" />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

const pricesOf = (rows: { sizeClass: SizeClass; price: number }[]): Record<SizeClass, string> => ({
  small: String(rows.find((r) => r.sizeClass === "small")?.price ?? ""),
  medium: String(rows.find((r) => r.sizeClass === "medium")?.price ?? ""),
  large: String(rows.find((r) => r.sizeClass === "large")?.price ?? ""),
  xl: String(rows.find((r) => r.sizeClass === "xl")?.price ?? ""),
});

const priceList = (prices: Record<SizeClass, string>) =>
  SIZES.filter((size) => prices[size.value].trim() !== "" && Number.isFinite(Number(prices[size.value]))).map((size) => ({ sizeClass: size.value, price: Number(prices[size.value]) }));

function PackageDialog({ catalogue, row, onClose }: { catalogue: DetailingCatalogue; row: DetailingPackage | null; onClose: () => void }) {
  const actions = useDetailingActions();
  const items = useItemOptions();
  const [name, setName] = React.useState(row?.name ?? "");
  const [description, setDescription] = React.useState(row?.description ?? "");
  const [categoryId, setCategoryId] = React.useState(row?.category?.id ?? "");
  const [durationText, setDurationText] = React.useState(row?.durationText ?? "");
  const [inclusions, setInclusions] = React.useState((row?.inclusions ?? []).join("\n"));
  const [minDetailers, setMinDetailers] = React.useState(String(row?.minDetailers ?? 1));
  const [isPopular, setIsPopular] = React.useState(row?.isPopular ?? false);
  const [isActive, setIsActive] = React.useState(row?.isActive ?? true);
  const [prices, setPrices] = React.useState(() => pricesOf(row?.prices ?? []));
  const [materials, setMaterials] = React.useState(() => (row?.materials ?? []).map((m) => ({ itemId: m.itemId, quantity: m.quantity, scalesWithSize: m.scalesWithSize })));
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const reading = useDurationReading(React.useDeferredValue(durationText));

  async function save() {
    setBusy(true);
    setFailure(null);
    const draft: PackageDraft = {
      name,
      description,
      categoryId: categoryId || undefined,
      durationText,
      inclusions: inclusions.split("\n"),
      isPopular,
      minDetailers: Math.max(1, Number(minDetailers) || 1),
      recommendedDetailers: Math.max(Number(minDetailers) || 1, row?.recommendedDetailers ?? 1),
      isActive,
      prices: priceList(prices),
      materials: materials.filter((line) => line.itemId !== ""),
    };
    const result = await actions.savePackage(draft, row?.id);
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }

  return (
    <Dialog open onOpenChange={(openNow) => !openNow && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${row.name}` : "Add package"}</DialogTitle>
          <DialogDescription>Bookings already made keep the price and duration they were booked at.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[65vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-name">Name</Label>
              <Input id="pkg-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="pkg-category">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  {catalogue.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-duration">Duration</Label>
              <Input id="pkg-duration" value={durationText} onChange={(event) => setDurationText(event.target.value)} placeholder="e.g. 45 min, 2–3 hrs, 1–2 days" />
              <p className="text-2xs text-subtle-foreground" aria-live="polite">
                {reading.data ? `Interpreted as ${reading.data.interpreted} (${reading.data.slotBudget} half-hour slots).` : "Type how long it takes."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-min">Detailers needed</Label>
              <Input id="pkg-min" type="number" min={1} value={minDetailers} onChange={(event) => setMinDetailers(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pkg-description">Description</Label>
            <Textarea id="pkg-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <SizePrices prices={prices} onChange={setPrices} />
          <div className="space-y-1.5">
            <Label htmlFor="pkg-inclusions">What it includes (one per line: this is the job card&apos;s checklist)</Label>
            <Textarea id="pkg-inclusions" rows={4} value={inclusions} onChange={(event) => setInclusions(event.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">Materials a medium vehicle uses</legend>
            {materials.map((line, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Select value={line.itemId} onValueChange={(itemId) => setMaterials((rows) => rows.map((r, i) => (i === index ? { ...r, itemId } : r)))}>
                  <SelectTrigger className="h-9 min-w-52 flex-1" aria-label={`Material ${index + 1}`}>
                    <SelectValue placeholder="Choose a stocked item" />
                  </SelectTrigger>
                  <SelectContent>
                    {(items.data ?? []).filter((item) => item.isStocked).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.uom})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-9 w-24"
                  type="number"
                  min={0}
                  step="0.001"
                  aria-label={`Quantity of material ${index + 1}`}
                  value={line.quantity}
                  onChange={(event) => setMaterials((rows) => rows.map((r, i) => (i === index ? { ...r, quantity: event.target.value } : r)))}
                />
                <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={line.scalesWithSize}
                    onChange={(event) => setMaterials((rows) => rows.map((r, i) => (i === index ? { ...r, scalesWithSize: event.target.checked } : r)))}
                    className="size-3.5 accent-[hsl(var(--brand))]"
                  />
                  Scales with size
                </label>
                <button type="button" aria-label={`Remove material ${index + 1}`} onClick={() => setMaterials((rows) => rows.filter((_, i) => i !== index))} className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-critical">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button size="sm" onClick={() => setMaterials((rows) => [...rows, { itemId: "", quantity: "1", scalesWithSize: true }])}>
              <Plus />
              Add material
            </Button>
            <p className="text-2xs text-subtle-foreground">Taken from this branch&apos;s stock when the job completes.</p>
          </fieldset>

          <div className="flex gap-6 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isPopular} onChange={(event) => setIsPopular(event.target.checked)} className="size-4 accent-[hsl(var(--brand))]" />
              Mark as popular
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-[hsl(var(--brand))]" />
              Offered
            </label>
          </div>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddonDialog({ row, onClose }: { row: DetailingAddon | null; onClose: () => void }) {
  const actions = useDetailingActions();
  const [name, setName] = React.useState(row?.name ?? "");
  const [isActive, setIsActive] = React.useState(row?.isActive ?? true);
  const [prices, setPrices] = React.useState(() => pricesOf(row?.prices ?? []));
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setFailure(null);
    const result = await actions.saveAddon({ name, isActive, prices: priceList(prices) }, row?.id);
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error);
  }

  return (
    <Dialog open onOpenChange={(openNow) => !openNow && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${row.name}` : "Add extra"}</DialogTitle>
          <DialogDescription>An extra is added to a booking at the price for that vehicle&apos;s size.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="addon-name">Name</Label>
            <Input id="addon-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <SizePrices prices={prices} onChange={setPrices} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-[hsl(var(--brand))]" />
            Offered
          </label>
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save extra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
