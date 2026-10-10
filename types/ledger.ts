/**
 * The books (Phase 8): the chart of accounts, posting rules, the journal,
 * accounting periods and the reports. Money is pesos for display only
 * (`centsToPesos`); every figure is the API's.
 */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface LedgerScope {
  branches: { id: string; name: string }[];
  /** True when no branch is picked and the caller is not limited to some: a report is then the consolidated one. */
  allBranches: boolean;
}

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normalSide: "debit" | "credit";
  isActive: boolean;
  isSystem: boolean;
  description: string;
  /** On the account's own side, through the chosen date. */
  balance: number;
  ruleKeys: string[];
  /** Once posted to, the code, type and side are fixed. */
  hasPostings: boolean;
}

export interface PostingRule {
  key: string;
  label: string;
  group: string;
  accountType: AccountType;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  defaultCode: string;
}

export type AccountingTarget = "none" | "xero" | "quickbooks";

export interface ExportMapping {
  accountId: string;
  target: "xero" | "quickbooks";
  externalCode: string | null;
  externalName: string | null;
}

export interface LedgerSettings {
  accountingTarget: AccountingTarget;
  mappings: ExportMapping[];
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  branchId: string;
  debit: number;
  credit: number;
  memo: string;
}

export interface JournalEntry {
  id: string;
  number: string;
  entryDate: string;
  period: string;
  periodClosed: boolean;
  event: string;
  eventLabel: string;
  isReversal: boolean;
  sourceType: string;
  sourceId: string;
  reference: string;
  memo: string;
  paymentMethod: string | null;
  branchId: string;
  branchName: string;
  counterBranchId: string | null;
  reversalOfId: string | null;
  total: number;
  postedByName: string;
  postedAt: string;
  lines: JournalLine[];
}

export interface PeriodRow {
  periodKey: string;
  label: string;
  startsOn: string;
  endsOn: string;
  status: "open" | "closed";
  closedAt: string | null;
  closedByName: string | null;
}

export interface CloseCheck {
  key: string;
  label: string;
  passed: boolean;
  expected: number | null;
  actual: number | null;
  difference: number | null;
  detail: string;
}

export interface PeriodChecklist {
  periodKey: string;
  label: string;
  startsOn: string;
  endsOn: string;
  status: "open" | "closed";
  ended: boolean;
  checks: CloseCheck[];
  canClose: boolean;
  blockedBy: string | null;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  asOf: string;
  scope: LedgerScope;
  accounts: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
}

export interface GeneralLedgerLine {
  id: string;
  entryId: string;
  number: string;
  entryDate: string;
  event: string;
  eventLabel: string;
  reference: string;
  memo: string;
  branchName: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface GeneralLedger {
  account: { id: string; code: string; name: string; type: AccountType; normalSide: "debit" | "credit" };
  from: string;
  to: string;
  scope: LedgerScope;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  lines: GeneralLedgerLine[];
  total: number;
}

export interface ProfitLossLine {
  accountId: string;
  code: string;
  name: string;
  byBranch: Record<string, number>;
  total: number;
}

export interface ProfitLossSubtotal {
  byBranch: Record<string, number>;
  total: number;
}

export interface ProfitAndLoss {
  from: string;
  to: string;
  scope: LedgerScope;
  branches: { id: string; name: string }[];
  revenue: ProfitLossLine[];
  costOfSales: ProfitLossLine[];
  grossProfit: ProfitLossSubtotal;
  expenses: ProfitLossLine[];
  netProfit: ProfitLossSubtotal;
}

export interface BalanceSheetRow {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface BalanceSheet {
  asOf: string;
  scope: LedgerScope;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  currentEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
}

export interface DailySalesRow {
  date: string;
  branchId: string;
  branchName: string;
  netSales: number;
  vat: number;
  invoiced: number;
  received: number;
  receipts: { method: string; received: number }[];
}

export interface DailySales {
  from: string;
  to: string;
  scope: LedgerScope;
  days: DailySalesRow[];
  totals: { netSales: number; vat: number; invoiced: number; received: number };
}
