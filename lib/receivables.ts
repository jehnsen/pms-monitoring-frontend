"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiBlob, apiData, apiPage, newIdempotencyKey, saveBlob, type Page } from "@/lib/api/client";
import {
  BILLING_ROOTS,
  toAging,
  toBalance,
  toInvoice,
  toPayment,
  toRevenue,
  toStatement,
  type RawAging,
  type RawBalance,
  type RawInvoice,
  type RawPayment,
  type RawRevenue,
  type RawStatement,
} from "@/lib/api/billing";
import { pesosToCents, toWorkOrder, type RawWorkOrder } from "@/lib/mappers";
import { run, useApiQuery, type ActionResult, type Params } from "@/lib/store";
import type { WorkOrder } from "@/types";
import type { AccountBalance, AgingReport, Invoice, Payment, PaymentMethod, RevenueReport, Statement } from "@/types/billing";
import type { TaxClass } from "@/types/inventory";

/**
 * Order-to-cash data, in the same shape as `lib/store.ts`: one hook per
 * endpoint (keyed by the user and the selected branch), and
 * `useBillingActions()` for the writes, which resolve to `{ ok }` or the
 * API's error and refetch what they changed. Nothing is optimistic and
 * nothing is computed here: totals, VAT, balances and buckets are the API's.
 */

/* ----------------------------------------------------------------- reads */

export interface InvoiceQuery extends Params {
  page?: number;
  per_page?: number;
  status?: string;
  customer_account_id?: string;
  q?: string;
}

export function useInvoicePage(params: InvoiceQuery, options: { enabled?: boolean } = {}) {
  return useApiQuery<Page<Invoice>>(
    ["invoices", params],
    async () => {
      const page = await apiPage<RawInvoice>("/invoices", { query: params });
      return { ...page, data: page.data.map(toInvoice) };
    },
    { keepPrevious: true, ...options }
  );
}

export function useInvoice(id: string | undefined) {
  return useApiQuery<Invoice>(["invoice", id], async () => toInvoice(await apiData<RawInvoice>(`/invoices/${id}`)), { enabled: Boolean(id) });
}

export function usePaymentPage(params: Params, options: { enabled?: boolean } = {}) {
  return useApiQuery<Page<Payment>>(
    ["payments", params],
    async () => {
      const page = await apiPage<RawPayment>("/payments", { query: params });
      return { ...page, data: page.data.map(toPayment) };
    },
    { keepPrevious: true, ...options }
  );
}

/** Closed jobs not yet invoiced (staff). */
export function useBillingQueue(params: Params, options: { enabled?: boolean } = {}) {
  return useApiQuery<Page<WorkOrder>>(
    ["billing-queue", params],
    async () => {
      const page = await apiPage<RawWorkOrder>("/billing/queue", { query: params });
      return { ...page, data: page.data.map(toWorkOrder) };
    },
    { keepPrevious: true, ...options }
  );
}

export function useAccountBalance(accountId: string | null | undefined) {
  return useApiQuery<AccountBalance>(
    ["account-balance", accountId],
    async () => toBalance(await apiData<RawBalance>(`/customer-accounts/${accountId}/balance`)),
    { enabled: Boolean(accountId) }
  );
}

export function useStatement(accountId: string | null | undefined, range: { from: string; to: string }) {
  return useApiQuery<Statement>(
    ["account-statement", accountId, range],
    async () => toStatement(await apiData<RawStatement>(`/customer-accounts/${accountId}/statement`, { query: range })),
    { enabled: Boolean(accountId) && range.from !== "" && range.to !== "" }
  );
}

export function useAging(asOf: string | null) {
  return useApiQuery<AgingReport>(["receivables", "aging", asOf], async () =>
    toAging(await apiData<RawAging>("/receivables/aging", { query: asOf ? { as_of: asOf } : {} }))
  );
}

export function useRevenue(range: { from: string; to: string }) {
  return useApiQuery<RevenueReport>(["receivables", "revenue", range], async () => toRevenue(await apiData<RawRevenue>("/receivables/revenue", { query: range })));
}

/* ---------------------------------------------------------------- writes */

export interface ManualInvoiceLine {
  description: string;
  quantity: number;
  /** Pesos, as typed. */
  unitPrice: number;
  /** Pesos, as typed. */
  discount?: number;
  taxClass?: TaxClass;
}

export interface PaymentDraft {
  customerAccountId: string;
  method: PaymentMethod;
  referenceNo?: string;
  /** Pesos, as typed. */
  amount: number;
  receivedOn?: string;
  notes?: string;
  /** Pesos per invoice; omit to let the API apply it oldest due first. */
  allocations?: { invoiceId: string; amount: number }[];
}

export function useBillingActions() {
  const queryClient = useQueryClient();

  const refresh = useCallback(
    () =>
      queryClient.invalidateQueries({
        predicate: (query) => typeof query.queryKey[0] === "string" && (BILLING_ROOTS as readonly string[]).includes(query.queryKey[0] as string),
      }),
    [queryClient]
  );

  const write = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<ActionResult<T>> => {
      const result = await run(fn);
      if (result.ok) await refresh();
      return result;
    },
    [refresh]
  );

  const invoice = (raw: RawInvoice) => toInvoice(raw);

  return useMemo(
    () => ({
      /** A draft for closed jobs of one account (the queue's selection). */
      invoiceJobs: (workOrderIds: string[]) =>
        write(async () => invoice(await apiData<RawInvoice>("/invoices", { method: "POST", idempotencyKey: newIdempotencyKey(), body: { work_order_ids: workOrderIds } }))),

      createManualInvoice: (customerAccountId: string, lines: ManualInvoiceLine[], notes?: string) =>
        write(async () =>
          invoice(
            await apiData<RawInvoice>("/invoices", {
              method: "POST",
              idempotencyKey: newIdempotencyKey(),
              body: {
                customer_account_id: customerAccountId,
                lines: lines.map(manualLineToApi),
                ...(notes ? { notes } : {}),
              },
            })
          )
        ),

      /** A line's discount on a draft (pesos). */
      setDiscount: (invoiceId: string, lineId: string, discount: number) =>
        write(async () =>
          invoice(await apiData<RawInvoice>(`/invoices/${invoiceId}`, { method: "PATCH", body: { discounts: [{ line_id: lineId, discount_cents: pesosToCents(discount) }] } }))
        ),

      setNotes: (invoiceId: string, notes: string) =>
        write(async () => invoice(await apiData<RawInvoice>(`/invoices/${invoiceId}`, { method: "PATCH", body: { notes } }))),

      discardInvoice: (invoiceId: string) => write(async () => api(`/invoices/${invoiceId}`, { method: "DELETE" })),

      /** `key`: the dialog's own, kept across retries, so a retry replays the first answer. */
      issueInvoice: (invoiceId: string, key: string, issueDate?: string) =>
        write(async () =>
          invoice(await apiData<RawInvoice>(`/invoices/${invoiceId}/issue`, { method: "POST", idempotencyKey: key, body: issueDate ? { issue_date: issueDate } : {} }))
        ),

      voidInvoice: (invoiceId: string, reason: string) =>
        write(async () => invoice(await apiData<RawInvoice>(`/invoices/${invoiceId}/void`, { method: "POST", body: { reason } }))),

      /** `key`: the dialog's own, kept across retries (a retried payment is never taken twice). */
      recordPayment: (draft: PaymentDraft, key: string) =>
        write(async () =>
          toPayment(
            await apiData<RawPayment>("/payments", {
              method: "POST",
              idempotencyKey: key,
              body: {
                customer_account_id: draft.customerAccountId,
                method: draft.method,
                amount_cents: pesosToCents(draft.amount),
                ...(draft.referenceNo ? { reference_no: draft.referenceNo } : {}),
                ...(draft.receivedOn ? { received_on: draft.receivedOn } : {}),
                ...(draft.notes ? { notes: draft.notes } : {}),
                ...(draft.allocations
                  ? { allocations: draft.allocations.map((a) => ({ invoice_id: a.invoiceId, amount_cents: pesosToCents(a.amount) })) }
                  : {}),
              },
            })
          )
        ),

      /** Apply a payment's remaining credit, oldest due first. */
      applyCredit: (paymentId: string) =>
        write(async () => toPayment(await apiData<RawPayment>(`/payments/${paymentId}/allocations`, { method: "POST", idempotencyKey: newIdempotencyKey(), body: {} }))),

      voidPayment: (paymentId: string, reason: string) =>
        write(async () => toPayment(await apiData<RawPayment>(`/payments/${paymentId}/void`, { method: "POST", body: { reason } }))),

      /* ------------------------------------------------------- documents */
      downloadInvoicePdf: (invoiceId: string, fallbackName: string) => run(async () => savePdf(`/invoices/${invoiceId}/pdf`, fallbackName)),
      downloadPaymentPdf: (paymentId: string, fallbackName: string) => run(async () => savePdf(`/payments/${paymentId}/pdf`, fallbackName)),
      downloadStatementPdf: (accountId: string, range: { from: string; to: string }) =>
        run(async () => savePdf(`/customer-accounts/${accountId}/statement/pdf`, `statement-${range.from}-${range.to}.pdf`, range)),
    }),
    [write]
  );
}

function manualLineToApi(line: ManualInvoiceLine) {
  return {
    description: line.description,
    quantity: String(line.quantity),
    unit_price_cents: pesosToCents(line.unitPrice),
    ...(line.discount ? { discount_cents: pesosToCents(line.discount) } : {}),
    ...(line.taxClass ? { tax_class: line.taxClass } : {}),
  };
}

async function savePdf(path: string, fallbackName: string, query?: Params): Promise<void> {
  const { blob, filename } = await apiBlob(path, query ? { query } : {});
  saveBlob(blob, filename ?? fallbackName);
}
