/**
 * The order-to-cash endpoints (`/invoices`, `/payments`, `/billing/queue`,
 * `/receivables/*`, `/customer-accounts/{id}/balance|statement`): the API's
 * raw resources, and the seam that turns them into `types/billing.ts`
 * (snake_case → camelCase, centavos → pesos for display, decimal strings →
 * numbers). Nothing is derived here: totals, VAT, status, balances and
 * buckets are the API's.
 */
import { centsToPesos } from "@/lib/mappers";
import type {
  AccountBalance,
  AgingBucket,
  AgingReport,
  AgingRow,
  Invoice,
  InvoiceLineKind,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  RevenueReport,
  Statement,
  StatementEntry,
} from "@/types/billing";
import type { TaxClass } from "@/types/inventory";

/** Query-key roots a billing write refreshes (work orders change stage too). */
export const BILLING_ROOTS = [
  "invoices",
  "invoice",
  "payments",
  "billing-queue",
  "receivables",
  "account-balance",
  "account-statement",
  "work-order",
  "work-orders",
  "shop",
] as const;

function pesos(cents: number | null | undefined): number {
  return typeof cents === "number" ? centsToPesos(cents) : 0;
}

function pesosOrNull(cents: number | null | undefined): number | null {
  return typeof cents === "number" ? centsToPesos(cents) : null;
}

/* --------------------------------------------------------------- invoices */

export interface RawInvoiceTotals {
  vatable_sales_cents: number;
  vat_exempt_sales_cents: number;
  zero_rated_sales_cents: number;
  non_vat_sales_cents: number;
  net_sales_cents: number;
  discount_total_cents: number;
  vat_amount_cents: number;
  total_due_cents: number;
}

export interface RawInvoice {
  id: string;
  number: string | null;
  status: string;
  status_label: string;
  source: string;
  branch_id: string | null;
  customer_account_id: string;
  customer_name: string;
  issue_date: string | null;
  due_date: string | null;
  payment_terms_days: number;
  days_overdue: number;
  buyer: { name: string; tin: string | null; address: string | null };
  seller: { name: string; business_style: string | null; tin: string | null; branch_code: string | null; address: string | null; vat_registered: boolean; header: string | null; footer: string | null };
  prices_include_vat: boolean;
  vat_rate_pct: string;
  non_vat_notice: string | null;
  totals: RawInvoiceTotals;
  paid_cents: number;
  balance_cents: number;
  notes: string;
  lines: {
    id: string;
    kind: string;
    description: string;
    work_order_id: string | null;
    quantity: string;
    unit_price_cents: number;
    discount_cents: number;
    tax_class: string;
    line_total_cents: number;
  }[];
  work_orders: { id: string; reference: string; title: string; completed_on: string | null; released: boolean }[];
  payments: { allocation_id: string; payment_id: string; number: string; method: string; reference_no: string | null; amount_cents: number; allocated_on: string; counts: boolean }[];
  created_by_name: string;
  issued_at: string | null;
  issued_by_name: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  can_edit: boolean;
  can_issue: boolean;
  can_void: boolean;
  can_record_payment: boolean;
}

export function toInvoice(raw: RawInvoice): Invoice {
  return {
    id: raw.id,
    number: raw.number,
    status: raw.status as InvoiceStatus,
    statusLabel: raw.status_label,
    source: raw.source === "manual" ? "manual" : "work_orders",
    branchId: raw.branch_id,
    customerAccountId: raw.customer_account_id,
    customerName: raw.customer_name,
    issueDate: raw.issue_date,
    dueDate: raw.due_date,
    paymentTermsDays: raw.payment_terms_days,
    daysOverdue: raw.days_overdue,
    buyer: raw.buyer,
    seller: {
      name: raw.seller.name,
      businessStyle: raw.seller.business_style,
      tin: raw.seller.tin,
      branchCode: raw.seller.branch_code,
      address: raw.seller.address,
      vatRegistered: raw.seller.vat_registered,
      header: raw.seller.header,
      footer: raw.seller.footer,
    },
    pricesIncludeVat: raw.prices_include_vat,
    vatRatePct: raw.vat_rate_pct,
    nonVatNotice: raw.non_vat_notice,
    totals: {
      vatableSales: pesos(raw.totals.vatable_sales_cents),
      vatExemptSales: pesos(raw.totals.vat_exempt_sales_cents),
      zeroRatedSales: pesos(raw.totals.zero_rated_sales_cents),
      nonVatSales: pesos(raw.totals.non_vat_sales_cents),
      netSales: pesos(raw.totals.net_sales_cents),
      discountTotal: pesos(raw.totals.discount_total_cents),
      vatAmount: pesos(raw.totals.vat_amount_cents),
      totalDue: pesos(raw.totals.total_due_cents),
    },
    paid: pesos(raw.paid_cents),
    balance: pesos(raw.balance_cents),
    notes: raw.notes ?? "",
    lines: raw.lines.map((line) => ({
      id: line.id,
      kind: line.kind as InvoiceLineKind,
      description: line.description,
      workOrderId: line.work_order_id,
      quantity: Number(line.quantity),
      unitPrice: pesos(line.unit_price_cents),
      discount: pesos(line.discount_cents),
      taxClass: line.tax_class as TaxClass,
      lineTotal: pesos(line.line_total_cents),
    })),
    workOrders: raw.work_orders.map((w) => ({ id: w.id, reference: w.reference, title: w.title, completedOn: w.completed_on, released: w.released })),
    payments: raw.payments.map((p) => ({
      allocationId: p.allocation_id,
      paymentId: p.payment_id,
      number: p.number,
      method: p.method as PaymentMethod,
      referenceNo: p.reference_no,
      amount: pesos(p.amount_cents),
      allocatedOn: p.allocated_on,
      counts: p.counts,
    })),
    createdByName: raw.created_by_name,
    issuedAt: raw.issued_at,
    issuedByName: raw.issued_by_name,
    voidedAt: raw.voided_at,
    voidedByName: raw.voided_by_name,
    voidReason: raw.void_reason,
    canEdit: raw.can_edit,
    canIssue: raw.can_issue,
    canVoid: raw.can_void,
    canRecordPayment: raw.can_record_payment,
  };
}

/* --------------------------------------------------------------- payments */

export interface RawPayment {
  id: string;
  number: string;
  status: string;
  method: string;
  method_label: string;
  reference_no: string | null;
  amount_cents: number;
  allocated_cents: number;
  unallocated_cents: number;
  received_on: string;
  received_by_name: string;
  customer_account_id: string;
  customer_name: string;
  notes: string;
  allocations: { id: string; invoice_id: string; invoice_number: string | null; amount_cents: number; allocated_on: string; allocated_by_name: string }[];
  void_reason: string | null;
  can_allocate: boolean;
  can_void: boolean;
}

export function toPayment(raw: RawPayment): Payment {
  return {
    id: raw.id,
    number: raw.number,
    status: raw.status === "void" ? "void" : "posted",
    method: raw.method as PaymentMethod,
    methodLabel: raw.method_label,
    referenceNo: raw.reference_no,
    amount: pesos(raw.amount_cents),
    allocated: pesos(raw.allocated_cents),
    unallocated: pesos(raw.unallocated_cents),
    receivedOn: raw.received_on,
    receivedByName: raw.received_by_name,
    customerAccountId: raw.customer_account_id,
    customerName: raw.customer_name,
    notes: raw.notes ?? "",
    allocations: raw.allocations.map((a) => ({
      id: a.id,
      invoiceId: a.invoice_id,
      invoiceNumber: a.invoice_number,
      amount: pesos(a.amount_cents),
      allocatedOn: a.allocated_on,
      allocatedByName: a.allocated_by_name,
    })),
    voidReason: raw.void_reason,
    canAllocate: raw.can_allocate,
    canVoid: raw.can_void,
  };
}

/* ------------------------------------------------------------ receivables */

export interface RawBalance {
  customer_account_id: string;
  customer_name: string;
  payment_terms_days: number;
  credit_limit_cents: number | null;
  outstanding_cents: number;
  overdue_cents: number;
  credit_cents: number;
  net_balance_cents: number;
  available_credit_cents: number | null;
  over_limit: boolean;
  open_invoices: RawInvoice[];
  next_due_date: string | null;
  uninvoiced_jobs: number | null;
}

export function toBalance(raw: RawBalance): AccountBalance {
  return {
    customerAccountId: raw.customer_account_id,
    customerName: raw.customer_name,
    paymentTermsDays: raw.payment_terms_days,
    creditLimit: pesosOrNull(raw.credit_limit_cents),
    outstanding: pesos(raw.outstanding_cents),
    overdue: pesos(raw.overdue_cents),
    credit: pesos(raw.credit_cents),
    netBalance: pesos(raw.net_balance_cents),
    availableCredit: pesosOrNull(raw.available_credit_cents),
    overLimit: raw.over_limit,
    openInvoices: raw.open_invoices.map(toInvoice),
    nextDueDate: raw.next_due_date,
    uninvoicedJobs: raw.uninvoiced_jobs,
  };
}

export interface RawStatement {
  customer_name: string;
  from: string;
  to: string;
  opening_balance_cents: number;
  total_charges_cents: number;
  total_credits_cents: number;
  closing_balance_cents: number;
  entries: { date: string; kind: string; document_id: string; reference: string; description: string; charge_cents: number; credit_cents: number; balance_cents: number }[];
}

export function toStatement(raw: RawStatement): Statement {
  return {
    customerName: raw.customer_name,
    from: raw.from,
    to: raw.to,
    openingBalance: pesos(raw.opening_balance_cents),
    totalCharges: pesos(raw.total_charges_cents),
    totalCredits: pesos(raw.total_credits_cents),
    closingBalance: pesos(raw.closing_balance_cents),
    entries: raw.entries.map(
      (e): StatementEntry => ({
        date: e.date,
        kind: e.kind as StatementEntry["kind"],
        documentId: e.document_id,
        reference: e.reference,
        description: e.description,
        charge: pesos(e.charge_cents),
        credit: pesos(e.credit_cents),
        balance: pesos(e.balance_cents),
      })
    ),
  };
}

export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "days_1_30", label: "1–30 days" },
  { key: "days_31_60", label: "31–60 days" },
  { key: "days_61_90", label: "61–90 days" },
  { key: "over_90", label: "Over 90 days" },
];

type RawBuckets = Record<AgingBucket, number> & { total: number };

export interface RawAging {
  as_of: string;
  accounts: (RawBuckets & { customer_account_id: string; customer_name: string; credit_cents: number })[];
  totals: RawBuckets;
}

function buckets(raw: RawBuckets): Record<AgingBucket, number> & { total: number } {
  return {
    current: pesos(raw.current),
    days_1_30: pesos(raw.days_1_30),
    days_31_60: pesos(raw.days_31_60),
    days_61_90: pesos(raw.days_61_90),
    over_90: pesos(raw.over_90),
    total: pesos(raw.total),
  };
}

export function toAging(raw: RawAging): AgingReport {
  return {
    asOf: raw.as_of,
    accounts: raw.accounts.map(
      (row): AgingRow => ({ customerAccountId: row.customer_account_id, customerName: row.customer_name, credit: pesos(row.credit_cents), ...buckets(row) })
    ),
    totals: buckets(raw.totals),
  };
}

export interface RawRevenue {
  from: string;
  to: string;
  accrual: { invoices: number; net_sales_cents: number; vat_cents: number; total_cents: number };
  cash: { payments: number; received_cents: number; by_method: { method: string; received_cents: number }[] };
}

export function toRevenue(raw: RawRevenue): RevenueReport {
  return {
    from: raw.from,
    to: raw.to,
    accrual: { invoices: raw.accrual.invoices, netSales: pesos(raw.accrual.net_sales_cents), vat: pesos(raw.accrual.vat_cents), total: pesos(raw.accrual.total_cents) },
    cash: {
      payments: raw.cash.payments,
      received: pesos(raw.cash.received_cents),
      byMethod: raw.cash.by_method.map((m) => ({ method: m.method as PaymentMethod, received: pesos(m.received_cents) })),
    },
  };
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "check", label: "Check" },
];
