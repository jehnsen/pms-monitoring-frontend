"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DeniedAction } from "@/components/auth/denied-action";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError } from "@/components/ui/query-error";
import { useDemandForecast, useFleetActions, useFleetClients } from "@/lib/store";
import { useCan } from "@/lib/rbac";
import { formatCurrency } from "@/lib/utils";

const HORIZONS = [
  { value: "4", label: "4 weeks" },
  { value: "6", label: "6 weeks" },
  { value: "12", label: "12 weeks" },
];

export default function DemandForecastPage() {
  const { generatePurchaseOrders } = useFleetActions();
  const { can, reason, side } = useCan();
  const [horizon, setHorizon] = useState("6");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [justGenerated, setJustGenerated] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Stock is each customer account's own, so a forecast is for one account:
  // staff pick it; a portal user's is their own.
  const staff = side === "staff";
  const { fleetClients } = useFleetClients({ enabled: staff });
  const [accountId, setAccountId] = useState<string>("");
  useEffect(() => {
    if (staff && !accountId && fleetClients.length > 0) setAccountId(fleetClients[0].id);
  }, [staff, accountId, fleetClients]);

  // The demand, the plain-English summary and which rows may be ordered are
  // the API's (`GET /demand-forecast`).
  const { data, error, refetch } = useDemandForecast(
    { customer_account_id: staff ? accountId : undefined, horizon_weeks: Number(horizon) },
    { enabled: !staff || Boolean(accountId) }
  );
  const rows = data?.rows ?? [];

  useEffect(() => {
    setSelected(new Set());
  }, [accountId, horizon]);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  if (!data) {
    return (
      <>
        <PageHeader
          title="Demand forecast"
          description="What the PMS schedule says the fleet will need, and whether stock covers it."
        />
        <Skeleton className="h-96" />
      </>
    );
  }

  const summary = data.summary;
  const selectableIds = rows.filter((row) => row.selectable).map((row) => row.part.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleRow(partId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(partId);
      else next.delete(partId);
      return next;
    });
    setJustGenerated(false);
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(selectableIds) : new Set());
    setJustGenerated(false);
  }

  /** The server recomputes the forecast and orders each chosen part's shortfall. */
  async function generate() {
    setPending(true);
    setGenerateError(null);
    const result = await generatePurchaseOrders({
      partIds: [...selected],
      horizonWeeks: Number(horizon),
      customerAccountId: staff ? accountId : undefined,
    });
    setPending(false);
    if (!result.ok) {
      setGenerateError(result.fields?.part_ids?.[0] ?? result.error);
      return;
    }
    setSelected(new Set());
    setJustGenerated(true);
  }

  return (
    <>
      <PageHeader
        title="Demand forecast"
        description="What the PMS schedule says the fleet will need, and whether stock covers it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
          {staff ? (
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-[220px]" aria-label="Customer account">
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {fleetClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select value={horizon} onValueChange={setHorizon}>
            <SelectTrigger className="w-[160px]" aria-label="Forecast horizon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        }
      />

      <div className="card-raised px-5 py-4">
        <p className="text-sm leading-relaxed">{summary}</p>
      </div>

      {generateError ? (
        <p role="alert" className="mt-4 rounded-lg border border-critical/25 bg-critical/[0.06] px-4 py-3 text-xs text-critical">
          {generateError}
        </p>
      ) : null}

      {justGenerated ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-ok/25 bg-ok/10 px-4 py-3">
          <p className="text-xs text-foreground">
            Purchase request generated — grouped by vendor.
          </p>
          <Link
            href="/purchase-orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            View purchase orders
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : null}

      <section className="card-raised mt-5">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Projected parts demand
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Only rows with a shortfall can be requested. Items already covered
              by a live work order or an open purchase order are excluded.
            </p>
          </div>
          {can("po:issue") ? (
            <Button variant="primary" size="sm" disabled={selected.size === 0 || pending || !data.canRaise} onClick={() => void generate()}>
              Generate purchase request
            </Button>
          ) : (
            <DeniedAction reason={reason("po:issue")}>
              <Button variant="primary" size="sm" disabled>
                Generate purchase request
              </Button>
            </DeniedAction>
          )}
        </header>

        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState
              icon={PackageSearch}
              title="Nothing projected"
              description="No tracked interval falls due inside this horizon that isn't already covered."
              className="py-10"
            />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-brand"
                      checked={allSelected}
                      disabled={selectableIds.length === 0}
                      onChange={(event) => toggleAll(event.target.checked)}
                      aria-label="Select all parts with a shortfall"
                    />
                  </th>
                  {[
                    "Part",
                    "Category",
                    "Qty required",
                    "Current stock",
                    "Shortfall",
                    "Est. cost",
                    "Preferred vendor",
                    "",
                  ].map((heading, index) => (
                    <th
                      key={heading || index}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground ${
                        index >= 2 && index <= 5 ? "text-right" : ""
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.part.id}
                    className={
                      row.leadTimeRisk
                        ? "bg-critical/[0.04] transition-colors hover:bg-critical/[0.07]"
                        : "transition-colors hover:bg-surface-2/50"
                    }
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-brand"
                        checked={selected.has(row.part.id)}
                        disabled={!row.selectable}
                        onChange={(event) => toggleRow(row.part.id, event.target.checked)}
                        aria-label={`Select ${row.part.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium">{row.part.name}</p>
                      <p className="tabular text-2xs text-subtle-foreground">{row.part.sku}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs capitalize text-muted-foreground">
                      {row.part.category}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs">
                      {row.quantityRequired} {row.part.unit}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                      {row.part.currentStock} {row.part.unit}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                      {row.shortfall > 0 ? `${row.shortfall} ${row.part.unit}` : "—"}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right text-xs font-medium">
                      {formatCurrency(row.estimatedCost)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {row.part.preferredVendor}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.leadTimeRisk ? (
                        <Badge tone="critical">
                          <AlertTriangle />
                          Lead time risk
                        </Badge>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
