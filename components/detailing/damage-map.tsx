"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DamagePoint } from "@/types/detailing";

const KINDS: DamagePoint["kind"][] = ["scratch", "dent", "chip", "crack", "stain", "other"];

/**
 * The damage map: a top-down outline of the vehicle. A click (or Enter on the
 * outline, which marks the middle) adds a numbered point; each point carries a
 * kind and a note. Positions are thousandths of the outline's width and
 * length, which is how the API stores them.
 */
export function DamageMap({ points, onChange, readOnly = false }: { points: DamagePoint[]; onChange?: (points: DamagePoint[]) => void; readOnly?: boolean }) {
  const add = (x: number, y: number) => onChange?.([...points, { x, y, kind: "scratch", note: "" }]);
  const update = (index: number, change: Partial<DamagePoint>) => onChange?.(points.map((point, i) => (i === index ? { ...point, ...change } : point)));

  function place(event: React.MouseEvent<SVGSVGElement>) {
    if (readOnly) return;
    const box = event.currentTarget.getBoundingClientRect();
    add(Math.round(((event.clientX - box.left) / box.width) * 1000), Math.round(((event.clientY - box.top) / box.height) * 1000));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <svg
        viewBox="0 0 200 400"
        role={readOnly ? "img" : "button"}
        tabIndex={readOnly ? undefined : 0}
        aria-label={readOnly ? `Damage map with ${points.length} marked point${points.length === 1 ? "" : "s"}` : "Damage map: click where the damage is to mark it"}
        onClick={place}
        onKeyDown={(event) => {
          if (!readOnly && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            add(500, 500);
          }
        }}
        className={`h-auto w-full rounded-lg border border-border bg-surface-2 ${readOnly ? "" : "cursor-crosshair"}`}
      >
        {/* Body, cabin, windscreens and wheels: front of the vehicle at the top. */}
        <rect x="45" y="20" width="110" height="360" rx="42" className="fill-surface stroke-border-strong" strokeWidth="2" />
        <rect x="60" y="120" width="80" height="150" rx="14" className="fill-surface-2 stroke-border-strong" strokeWidth="1.5" />
        <path d="M62 118 Q100 92 138 118" className="fill-none stroke-border-strong" strokeWidth="1.5" />
        <path d="M62 272 Q100 292 138 272" className="fill-none stroke-border-strong" strokeWidth="1.5" />
        {[
          [34, 70],
          [152, 70],
          [34, 290],
          [152, 290],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="14" height="44" rx="5" className="fill-border-strong" />
        ))}
        <text x="100" y="14" textAnchor="middle" className="fill-subtle-foreground text-[10px]">
          Front
        </text>
        {points.map((point, index) => (
          <g key={index} transform={`translate(${(point.x / 1000) * 200} ${(point.y / 1000) * 400})`}>
            <circle r="11" className="fill-critical stroke-surface" strokeWidth="2" />
            <text textAnchor="middle" dy="4" className="fill-critical-foreground text-[11px] font-semibold">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>

      <ol className="space-y-2">
        {points.length === 0 ? <li className="text-xs text-muted-foreground">{readOnly ? "No damage was marked." : "Nothing marked yet. Click the outline where the damage is."}</li> : null}
        {points.map((point, index) => (
          <li key={index} className="flex items-start gap-2 text-xs">
            <span className="mt-1.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-critical text-2xs font-semibold text-critical-foreground">{index + 1}</span>
            {readOnly ? (
              <p className="pt-1">
                <span className="font-medium capitalize">{point.kind}</span>: {point.note}
              </p>
            ) : (
              <>
                <Select value={point.kind} onValueChange={(kind) => update(index, { kind: kind as DamagePoint["kind"] })}>
                  <SelectTrigger className="h-8 w-28" aria-label={`Kind of damage at point ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind} className="capitalize">
                        {kind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={point.note}
                  onChange={(event) => update(index, { note: event.target.value })}
                  placeholder="What is there"
                  aria-label={`Note for point ${index + 1}`}
                  className="h-8"
                />
                <button type="button" onClick={() => onChange?.(points.filter((_, i) => i !== index))} aria-label={`Remove point ${index + 1}`} className="mt-1 rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-foreground">
                  <X className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
