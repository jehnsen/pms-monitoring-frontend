/**
 * The books (`/ledger/*`): the API's raw resources, and the seam that turns
 * them into `types/ledger.ts` (snake_case → camelCase, centavos → pesos for
 * display). Nothing is derived here: balances, subtotals, running balances,
 * the trial balance's totals and every close check are the API's.
 */
import { centsToPesos } from "@/lib/mappers";
import type {
  AccountType,
  AccountingTarget,
  BalanceSheet,
  BalanceSheetRow,
  CloseCheck,
  DailySales,
  ExportMapping,
  GeneralLedger,
  JournalEntry,
  LedgerAccount,
  LedgerScope,
  LedgerSettings,
  PeriodChecklist,
  PeriodRow,
  PostingRule,
  ProfitAndLoss,
  ProfitLossLine,
  ProfitLossSubtotal,
  TrialBalance,
} from "@/types/ledger";

/** Query-key root of every books hook: a money or stock write refreshes them all. */
export const LEDGER_ROOT = "ledger";

const pesos = (cents: number | null | undefined): number => (typeof cents === "number" ? centsToPesos(cents) : 0);
const pesosOrNull = (cents: number | null | undefined): number | null => (typeof cents === "number" ? centsToPesos(cents) : null);

function branchMap(byBranch: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(byBranch).map(([id, cents]) => [id, pesos(cents)]));
}

/* ----------------------------------------------------------------- scope */

export interface RawScope {
  branches: { id: string; name: string }[];
  all_branches: boolean;
}

function toScope(raw: RawScope): LedgerScope {
  return { branches: raw.branches, allBranches: raw.all_branches };
}

/* -------------------------------------------------------- chart and rules */

export interface RawAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_side: "debit" | "credit";
  is_active: boolean;
  is_system: boolean;
  description: string;
  balance_cents: number;
  rule_keys: string[];
  has_postings: boolean;
}

export function toLedgerAccount(raw: RawAccount): LedgerAccount {
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    type: raw.type,
    normalSide: raw.normal_side,
    isActive: raw.is_active,
    isSystem: raw.is_system,
    description: raw.description ?? "",
    balance: pesos(raw.balance_cents),
    ruleKeys: raw.rule_keys ?? [],
    hasPostings: raw.has_postings ?? false,
  };
}

export interface RawPostingRule {
  key: string;
  label: string;
  group: string;
  account_type: AccountType;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  default_code: string;
}

export function toPostingRule(raw: RawPostingRule): PostingRule {
  return {
    key: raw.key,
    label: raw.label,
    group: raw.group,
    accountType: raw.account_type,
    accountId: raw.account_id,
    accountCode: raw.account_code,
    accountName: raw.account_name,
    defaultCode: raw.default_code,
  };
}

export interface RawLedgerSettings {
  accounting_target: AccountingTarget;
  mappings: { account_id: string; target: "xero" | "quickbooks"; external_code: string | null; external_name: string | null }[];
}

export function toLedgerSettings(raw: RawLedgerSettings): LedgerSettings {
  return {
    accountingTarget: raw.accounting_target,
    mappings: raw.mappings.map(
      (m): ExportMapping => ({ accountId: m.account_id, target: m.target, externalCode: m.external_code, externalName: m.external_name })
    ),
  };
}

/* ---------------------------------------------------------------- journal */

export interface RawJournalEntry {
  id: string;
  number: string;
  entry_date: string;
  period: string;
  period_closed: boolean;
  event: string;
  event_label: string;
  is_reversal: boolean;
  source_type: string;
  source_id: string;
  reference: string;
  memo: string;
  payment_method: string | null;
  branch_id: string;
  branch_name: string;
  counter_branch_id: string | null;
  reversal_of_id: string | null;
  total_cents: number;
  posted_by_name: string;
  posted_at: string;
  lines: {
    id: string;
    account_id: string;
    account_code: string;
    account_name: string;
    branch_id: string;
    debit_cents: number;
    credit_cents: number;
    memo: string;
  }[];
}

export function toJournalEntry(raw: RawJournalEntry): JournalEntry {
  return {
    id: raw.id,
    number: raw.number,
    entryDate: raw.entry_date,
    period: raw.period,
    periodClosed: raw.period_closed,
    event: raw.event,
    eventLabel: raw.event_label,
    isReversal: raw.is_reversal,
    sourceType: raw.source_type,
    sourceId: raw.source_id,
    reference: raw.reference,
    memo: raw.memo,
    paymentMethod: raw.payment_method,
    branchId: raw.branch_id,
    branchName: raw.branch_name,
    counterBranchId: raw.counter_branch_id,
    reversalOfId: raw.reversal_of_id,
    total: pesos(raw.total_cents),
    postedByName: raw.posted_by_name,
    postedAt: raw.posted_at,
    lines: raw.lines.map((line) => ({
      id: line.id,
      accountId: line.account_id,
      accountCode: line.account_code,
      accountName: line.account_name,
      branchId: line.branch_id,
      debit: pesos(line.debit_cents),
      credit: pesos(line.credit_cents),
      memo: line.memo,
    })),
  };
}

/* ---------------------------------------------------------------- periods */

export interface RawPeriod {
  period_key: string;
  label: string;
  starts_on: string;
  ends_on: string;
  status: "open" | "closed";
  closed_at: string | null;
  closed_by_name: string | null;
}

export function toPeriod(raw: RawPeriod): PeriodRow {
  return {
    periodKey: raw.period_key,
    label: raw.label,
    startsOn: raw.starts_on,
    endsOn: raw.ends_on,
    status: raw.status,
    closedAt: raw.closed_at,
    closedByName: raw.closed_by_name,
  };
}

export interface RawChecklist {
  period_key: string;
  label: string;
  starts_on: string;
  ends_on: string;
  status: "open" | "closed";
  ended: boolean;
  checklist: {
    key: string;
    label: string;
    passed: boolean;
    expected_cents: number | null;
    actual_cents: number | null;
    difference_cents: number | null;
    detail: string;
  }[];
  can_close: boolean;
  blocked_by: string | null;
}

export function toChecklist(raw: RawChecklist): PeriodChecklist {
  return {
    periodKey: raw.period_key,
    label: raw.label,
    startsOn: raw.starts_on,
    endsOn: raw.ends_on,
    status: raw.status,
    ended: raw.ended,
    checks: raw.checklist.map(
      (c): CloseCheck => ({
        key: c.key,
        label: c.label,
        passed: c.passed,
        expected: pesosOrNull(c.expected_cents),
        actual: pesosOrNull(c.actual_cents),
        difference: pesosOrNull(c.difference_cents),
        detail: c.detail,
      })
    ),
    canClose: raw.can_close,
    blockedBy: raw.blocked_by,
  };
}

/* ---------------------------------------------------------------- reports */

export interface RawTrialBalance {
  as_of: string;
  scope: RawScope;
  accounts: { account_id: string; code: string; name: string; type: AccountType; debit_cents: number; credit_cents: number }[];
  total_debit_cents: number;
  total_credit_cents: number;
  difference_cents: number;
  balanced: boolean;
}

export function toTrialBalance(raw: RawTrialBalance): TrialBalance {
  return {
    asOf: raw.as_of,
    scope: toScope(raw.scope),
    accounts: raw.accounts.map((a) => ({ accountId: a.account_id, code: a.code, name: a.name, type: a.type, debit: pesos(a.debit_cents), credit: pesos(a.credit_cents) })),
    totalDebit: pesos(raw.total_debit_cents),
    totalCredit: pesos(raw.total_credit_cents),
    difference: pesos(raw.difference_cents),
    balanced: raw.balanced,
  };
}

export interface RawGeneralLedger {
  account: { id: string; code: string; name: string; type: AccountType; normal_side: "debit" | "credit" };
  from: string;
  to: string;
  scope: RawScope;
  opening_balance_cents: number;
  total_debit_cents: number;
  total_credit_cents: number;
  closing_balance_cents: number;
  lines: {
    id: string;
    entry_id: string;
    number: string;
    entry_date: string;
    event: string;
    event_label: string;
    reference: string;
    memo: string;
    branch_name: string;
    debit_cents: number;
    credit_cents: number;
    balance_cents: number;
  }[];
  meta: { page: number; per_page: number; total: number };
}

export function toGeneralLedger(raw: RawGeneralLedger): GeneralLedger {
  return {
    account: { id: raw.account.id, code: raw.account.code, name: raw.account.name, type: raw.account.type, normalSide: raw.account.normal_side },
    from: raw.from,
    to: raw.to,
    scope: toScope(raw.scope),
    openingBalance: pesos(raw.opening_balance_cents),
    totalDebit: pesos(raw.total_debit_cents),
    totalCredit: pesos(raw.total_credit_cents),
    closingBalance: pesos(raw.closing_balance_cents),
    lines: raw.lines.map((l) => ({
      id: l.id,
      entryId: l.entry_id,
      number: l.number,
      entryDate: l.entry_date,
      event: l.event,
      eventLabel: l.event_label,
      reference: l.reference,
      memo: l.memo,
      branchName: l.branch_name,
      debit: pesos(l.debit_cents),
      credit: pesos(l.credit_cents),
      balance: pesos(l.balance_cents),
    })),
    total: raw.meta.total,
  };
}

interface RawPlLine {
  account_id: string;
  code: string;
  name: string;
  by_branch: Record<string, number>;
  total_cents: number;
}

interface RawSubtotal {
  by_branch: Record<string, number>;
  total_cents: number;
}

export interface RawProfitAndLoss {
  from: string;
  to: string;
  scope: RawScope;
  branches: { id: string; name: string }[];
  revenue: RawPlLine[];
  cost_of_sales: RawPlLine[];
  gross_profit: RawSubtotal;
  expenses: RawPlLine[];
  net_profit: RawSubtotal;
}

const toPlLine = (l: RawPlLine): ProfitLossLine => ({ accountId: l.account_id, code: l.code, name: l.name, byBranch: branchMap(l.by_branch), total: pesos(l.total_cents) });
const toSubtotal = (s: RawSubtotal): ProfitLossSubtotal => ({ byBranch: branchMap(s.by_branch), total: pesos(s.total_cents) });

export function toProfitAndLoss(raw: RawProfitAndLoss): ProfitAndLoss {
  return {
    from: raw.from,
    to: raw.to,
    scope: toScope(raw.scope),
    branches: raw.branches,
    revenue: raw.revenue.map(toPlLine),
    costOfSales: raw.cost_of_sales.map(toPlLine),
    grossProfit: toSubtotal(raw.gross_profit),
    expenses: raw.expenses.map(toPlLine),
    netProfit: toSubtotal(raw.net_profit),
  };
}

interface RawSheetRow {
  account_id: string;
  code: string;
  name: string;
  amount_cents: number;
}

export interface RawBalanceSheet {
  as_of: string;
  scope: RawScope;
  assets: RawSheetRow[];
  liabilities: RawSheetRow[];
  equity: RawSheetRow[];
  current_earnings_cents: number;
  total_assets_cents: number;
  total_liabilities_cents: number;
  total_equity_cents: number;
  balanced: boolean;
}

const toSheetRow = (r: RawSheetRow): BalanceSheetRow => ({ accountId: r.account_id, code: r.code, name: r.name, amount: pesos(r.amount_cents) });

export function toBalanceSheet(raw: RawBalanceSheet): BalanceSheet {
  return {
    asOf: raw.as_of,
    scope: toScope(raw.scope),
    assets: raw.assets.map(toSheetRow),
    liabilities: raw.liabilities.map(toSheetRow),
    equity: raw.equity.map(toSheetRow),
    currentEarnings: pesos(raw.current_earnings_cents),
    totalAssets: pesos(raw.total_assets_cents),
    totalLiabilities: pesos(raw.total_liabilities_cents),
    totalEquity: pesos(raw.total_equity_cents),
    balanced: raw.balanced,
  };
}

export interface RawDailySales {
  from: string;
  to: string;
  scope: RawScope;
  days: {
    date: string;
    branch_id: string;
    branch_name: string;
    net_sales_cents: number;
    vat_cents: number;
    invoiced_cents: number;
    received_cents: number;
    receipts: { method: string; received_cents: number }[];
  }[];
  totals: { net_sales_cents: number; vat_cents: number; invoiced_cents: number; received_cents: number };
}

export function toDailySales(raw: RawDailySales): DailySales {
  return {
    from: raw.from,
    to: raw.to,
    scope: toScope(raw.scope),
    days: raw.days.map((d) => ({
      date: d.date,
      branchId: d.branch_id,
      branchName: d.branch_name,
      netSales: pesos(d.net_sales_cents),
      vat: pesos(d.vat_cents),
      invoiced: pesos(d.invoiced_cents),
      received: pesos(d.received_cents),
      receipts: d.receipts.map((r) => ({ method: r.method, received: pesos(r.received_cents) })),
    })),
    totals: {
      netSales: pesos(raw.totals.net_sales_cents),
      vat: pesos(raw.totals.vat_cents),
      invoiced: pesos(raw.totals.invoiced_cents),
      received: pesos(raw.totals.received_cents),
    },
  };
}

/** Every journal event, for the journal browser's filter (labels are the API's `LedgerEvent::label()`). */
export const EVENT_GROUPS: { value: string; label: string }[] = [
  { value: "invoice_issued", label: "Invoice issued" },
  { value: "invoice_voided", label: "Invoice voided" },
  { value: "payment_received", label: "Payment received" },
  { value: "payment_voided", label: "Payment voided" },
  { value: "credit_applied", label: "Credit applied to an invoice" },
  { value: "credit_reversed", label: "Credit application reversed" },
  { value: "stock_opening", label: "Opening stock" },
  { value: "stock_receipt", label: "Goods received" },
  { value: "stock_receipt_return", label: "Goods receipt voided" },
  { value: "stock_issue", label: "Parts issued to a job" },
  { value: "stock_return", label: "Parts returned from a job" },
  { value: "stock_consumption", label: "Stock consumed" },
  { value: "stock_adjustment", label: "Stock adjustment" },
  { value: "stock_transfer", label: "Stock transfer" },
];

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];
