"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiBlob, apiData, apiPage, saveBlob, type Page } from "@/lib/api/client";
import {
  LEDGER_ROOT,
  toBalanceSheet,
  toChecklist,
  toDailySales,
  toGeneralLedger,
  toJournalEntry,
  toLedgerAccount,
  toLedgerSettings,
  toPeriod,
  toPostingRule,
  toProfitAndLoss,
  toTrialBalance,
  type RawAccount,
  type RawBalanceSheet,
  type RawChecklist,
  type RawDailySales,
  type RawGeneralLedger,
  type RawJournalEntry,
  type RawLedgerSettings,
  type RawPeriod,
  type RawPostingRule,
  type RawProfitAndLoss,
  type RawTrialBalance,
} from "@/lib/api/ledger";
import { run, useApiQuery, type ActionResult, type Params } from "@/lib/store";
import type {
  AccountType,
  AccountingTarget,
  BalanceSheet,
  DailySales,
  GeneralLedger,
  JournalEntry,
  LedgerAccount,
  LedgerSettings,
  PeriodChecklist,
  PeriodRow,
  PostingRule,
  ProfitAndLoss,
  TrialBalance,
} from "@/types/ledger";

/**
 * The books' data, in the same shape as `lib/receivables.ts`: one hook per
 * endpoint (keyed by the user and the selected branch) and
 * `useLedgerActions()` for the writes. Nothing is optimistic and nothing is
 * computed here: balances, subtotals, running balances and every close check
 * are the API's. Every key starts with "ledger", so a billing or stock write
 * refreshes the books (see BILLING_ROOTS / INVENTORY_ROOTS).
 */

export type DateRange = { from: string; to: string };

/* ----------------------------------------------------------------- reads */

export function useLedgerAccounts(asOf: string) {
  return useApiQuery<{ accounts: LedgerAccount[]; asOf: string }>([LEDGER_ROOT, "accounts", asOf], async () => {
    const body = await api<{ data: RawAccount[]; meta: { as_of: string } }>("/ledger/accounts", { query: { as_of: asOf } });
    return { accounts: body.data.map(toLedgerAccount), asOf: body.meta.as_of };
  });
}

export function usePostingRules() {
  return useApiQuery<PostingRule[]>([LEDGER_ROOT, "rules"], async () => (await apiData<RawPostingRule[]>("/ledger/posting-rules")).map(toPostingRule));
}

export function useLedgerSettings() {
  return useApiQuery<LedgerSettings>([LEDGER_ROOT, "settings"], async () => toLedgerSettings(await apiData<RawLedgerSettings>("/ledger/settings")));
}

export interface JournalQuery extends Params {
  page?: number;
  per_page?: number;
  from?: string;
  to?: string;
  account_id?: string;
  event?: string;
  branch_id?: string;
  q?: string;
}

export function useJournalPage(params: JournalQuery) {
  return useApiQuery<Page<JournalEntry>>(
    [LEDGER_ROOT, "journal", params],
    async () => {
      const page = await apiPage<RawJournalEntry>("/ledger/journal", { query: params });
      return { ...page, data: page.data.map(toJournalEntry) };
    },
    { keepPrevious: true }
  );
}

export function useJournalEntry(id: string | null) {
  return useApiQuery<JournalEntry>([LEDGER_ROOT, "entry", id], async () => toJournalEntry(await apiData<RawJournalEntry>(`/ledger/journal/${id}`)), {
    enabled: Boolean(id),
  });
}

export function usePeriods() {
  return useApiQuery<PeriodRow[]>([LEDGER_ROOT, "periods"], async () => (await apiData<RawPeriod[]>("/ledger/periods")).map(toPeriod));
}

export function usePeriodChecklist(period: string | null) {
  return useApiQuery<PeriodChecklist>(
    [LEDGER_ROOT, "checklist", period],
    async () => toChecklist(await apiData<RawChecklist>("/ledger/periods/checklist", { query: { period } })),
    { enabled: Boolean(period) }
  );
}

export function useTrialBalance(asOf: string) {
  return useApiQuery<TrialBalance>([LEDGER_ROOT, "trial-balance", asOf], async () =>
    toTrialBalance(await apiData<RawTrialBalance>("/ledger/reports/trial-balance", { query: { as_of: asOf } }))
  );
}

export function useGeneralLedger(accountId: string | null, range: DateRange, page: number, perPage = 50) {
  return useApiQuery<GeneralLedger>(
    [LEDGER_ROOT, "general-ledger", accountId, range, page, perPage],
    async () => toGeneralLedger(await apiData<RawGeneralLedger>(`/ledger/reports/general-ledger/${accountId}`, { query: { ...range, page, per_page: perPage } })),
    { enabled: Boolean(accountId), keepPrevious: true }
  );
}

export function useProfitAndLoss(range: DateRange) {
  return useApiQuery<ProfitAndLoss>([LEDGER_ROOT, "profit-and-loss", range], async () =>
    toProfitAndLoss(await apiData<RawProfitAndLoss>("/ledger/reports/profit-and-loss", { query: range }))
  );
}

export function useBalanceSheet(asOf: string) {
  return useApiQuery<BalanceSheet>([LEDGER_ROOT, "balance-sheet", asOf], async () =>
    toBalanceSheet(await apiData<RawBalanceSheet>("/ledger/reports/balance-sheet", { query: { as_of: asOf } }))
  );
}

export function useDailySales(range: DateRange) {
  return useApiQuery<DailySales>([LEDGER_ROOT, "daily-sales", range], async () =>
    toDailySales(await apiData<RawDailySales>("/ledger/reports/daily-sales", { query: range }))
  );
}

/* ---------------------------------------------------------------- writes */

export interface AccountDraft {
  code: string;
  name: string;
  type: AccountType;
  description?: string;
}

export function useLedgerActions() {
  const queryClient = useQueryClient();

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === LEDGER_ROOT }),
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

  return useMemo(
    () => ({
      createAccount: (draft: AccountDraft) =>
        write(async () =>
          toLedgerAccount(
            await apiData<RawAccount>("/ledger/accounts", {
              method: "POST",
              body: { code: draft.code, name: draft.name, type: draft.type, ...(draft.description ? { description: draft.description } : {}) },
            })
          )
        ),

      /** Only the fields changed; the API refuses a code, type or side change once the account is posted to. */
      updateAccount: (id: string, changes: Partial<AccountDraft> & { isActive?: boolean }) =>
        write(async () =>
          toLedgerAccount(
            await apiData<RawAccount>(`/ledger/accounts/${id}`, {
              method: "PATCH",
              body: {
                ...(changes.code !== undefined ? { code: changes.code } : {}),
                ...(changes.name !== undefined ? { name: changes.name } : {}),
                ...(changes.description !== undefined ? { description: changes.description } : {}),
                ...(changes.isActive !== undefined ? { is_active: changes.isActive } : {}),
              },
            })
          )
        ),

      updateRules: (changes: { key: string; accountId: string }[]) =>
        write(async () => {
          await api("/ledger/posting-rules", { method: "PUT", body: { rules: changes.map((c) => ({ key: c.key, account_id: c.accountId })) } });
        }),

      setAccountingTarget: (target: AccountingTarget) =>
        write(async () => {
          await apiData("/ledger/settings", { method: "PUT", body: { accounting_target: target } });
        }),

      saveMappings: (mappings: { accountId: string; target: "xero" | "quickbooks"; externalCode?: string; externalName?: string }[]) =>
        write(async () => {
          await api("/ledger/export-mappings", {
            method: "PUT",
            body: {
              mappings: mappings.map((m) => ({
                account_id: m.accountId,
                target: m.target,
                ...(m.externalCode !== undefined ? { external_code: m.externalCode } : {}),
                ...(m.externalName !== undefined ? { external_name: m.externalName } : {}),
              })),
            },
          });
        }),

      closePeriod: (period: string) =>
        write(async () => toChecklist(await apiData<RawChecklist>("/ledger/periods/close", { method: "POST", body: { period } }))),

      /** The journal as a file: `csv`, or the accounting product's import (`xero`, `quickbooks`). */
      downloadJournal: (format: "csv" | "xero" | "quickbooks", range: DateRange) =>
        run(async () => {
          const { blob, filename } = await apiBlob("/ledger/journal/export", { query: { format, ...range } });
          saveBlob(blob, filename ?? `journal-${range.from}-${range.to}.csv`);
        }),
    }),
    [write]
  );
}
