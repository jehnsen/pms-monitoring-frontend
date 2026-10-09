"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MoveTypeBadge } from "@/components/inventory/inventory-chrome";
import { useItemOptions, useStockMoves } from "@/lib/inventory";
import { formatDate, formatManilaTime, formatPesos, formatQuantity } from "@/lib/utils";
import type { MoveSource, MoveType, StockMoveRow } from "@/types/inventory";

const ALL = "__all__";

const TYPES: { value: MoveType; label: string }[] = [
  { value: "opening", label: "Opening" },
  { value: "receipt", label: "Receipt" },
  { value: "issue", label: "Issue" },
  { value: "return", label: "Return" },
  { value: "adjustment", label: "Adjustment" },
  { value: "transfer_out", label: "Transfer out" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "consumption", label: "Consumption" },
];

/** Where the document behind a move lives. */
function documentHref(move: StockMoveRow): string | null {
  const source: MoveSource = move.sourceType;
  if (!move.sourceDocumentId) return null;
  if (source === "work_order_line") return `/work-orders/${move.sourceDocumentId}`;
  if (source === "goods_receipt") return "/shop/inventory/purchasing";
  if (source === "stock_count") return "/shop/inventory/counts";
  if (source === "stock_transfer") return "/shop/inventory/transfers";
  return null;
}

/**
 * Item movements: the stock ledger, newest first, a cursor at a time. A
 * move is never edited: a correction is another row. Quantity is signed and
 * every value is the API's (|quantity| × the cost the move was recorded at).
 */
export default function MovementsPage() {
  const [item, setItem] = React.useState(ALL);
  const [type, setType] = React.useState(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const { items } = useItemOptions();

  // A link from Stock on hand names the item: read it once, on the client.
  React.useEffect(() => {
    const named = new URLSearchParams(window.location.search).get("item");
    if (named) setItem(named);
  }, []);

  const { moves, error, isSuccess, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } = useStockMoves({
    ...(item !== ALL ? { item_id: item } : {}),
    ...(type !== ALL ? { move_type: type } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader title="Item movements" description="Every receipt, issue, return, adjustment and transfer, as it happened. Nothing here is ever edited; a mistake is put right by a new row." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={item} onValueChange={setItem}>
          <SelectTrigger aria-label="Item" className="w-64">
            <SelectValue placeholder="Every item" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every item</SelectItem>
            {items.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.sku} — {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Move type" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every kind</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input aria-label="From" type="date" value={from} max={to || undefined} className="w-40" onChange={(e) => setFrom(e.target.value)} />
        <Input aria-label="To" type="date" value={to} min={from || undefined} className="w-40" onChange={(e) => setTo(e.target.value)} />
      </div>

      {!isSuccess ? (
        <Skeleton className="h-64" />
      ) : moves.length === 0 ? (
        <div className="card">
          <EmptyState icon={History} title="No movements" description="Nothing has moved that matches. Widen the dates or pick another item." />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Item</th>
                <th className="px-3 py-3 font-medium">Move</th>
                <th className="px-3 py-3 text-right font-medium">Quantity</th>
                <th className="px-3 py-3 text-right font-medium">Unit cost</th>
                <th className="px-3 py-3 text-right font-medium">Value</th>
                <th className="px-3 py-3 font-medium">Document</th>
                <th className="px-5 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {moves.map((move) => {
                const href = documentHref(move);
                return (
                  <tr key={move.id}>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="tabular">{formatDate(move.occurredAt)}</span>
                      <span className="block text-2xs text-subtle-foreground">{formatManilaTime(move.occurredAt)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{move.item.name}</p>
                      <p className="tabular text-2xs text-subtle-foreground">{move.item.sku}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap items-center gap-1">
                        <MoveTypeBadge type={move.moveType} />
                        {move.negative ? (
                          <Badge tone="critical">
                            <AlertTriangle />
                            Left stock negative
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className={`tabular px-3 py-3 text-right font-medium ${move.quantity < 0 ? "text-critical" : "text-ok"}`}>
                      {move.quantity > 0 ? "+" : ""}
                      {formatQuantity(move.quantity)} {move.item.uom}
                    </td>
                    <td className="tabular px-3 py-3 text-right">{formatPesos(move.unitCost)}</td>
                    <td className="tabular px-3 py-3 text-right">{formatPesos(move.value)}</td>
                    <td className="px-3 py-3">
                      {move.sourceReference ? (
                        href ? (
                          <Link href={href} className="tabular font-medium text-brand hover:underline">
                            {move.sourceReference}
                          </Link>
                        ) : (
                          <span className="tabular">{move.sourceReference}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {move.reason ? <p className="max-w-[16rem] truncate text-2xs text-subtle-foreground" title={move.reason}>{move.reason}</p> : null}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{move.actorName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            Load older movements
          </Button>
        </div>
      ) : null}
    </>
  );
}
