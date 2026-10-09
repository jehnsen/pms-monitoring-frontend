/**
 * Order-to-cash, as the screens use it: invoices, payments, receivables.
 * Money is pesos (display only, from the API's centavos). Every figure here
 * is the API's: totals and VAT, status, balances, aging buckets, `can_*`
 * flags. Nothing is derived in the browser.
 */
import type { TaxClass } from "@/types/inventory";

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export type PaymentMethod = "cash" | "gcash" | "maya" | "card" | "bank_transfer" | "check";

export type InvoiceLineKind = "parts" | "labour" | "fee" | "manual";

export interface InvoiceTotals {
  vatableSales: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  nonVatSales: number;
  netSales: number;
  discountTotal: number;
  vatAmount: number;
  totalDue: number;
}

export interface InvoiceLine {
  id: string;
  kind: InvoiceLineKind;
  description: string;
  workOrderId: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxClass: TaxClass;
  lineTotal: number;
}

export interface InvoiceParty {
  name: string;
  tin: string | null;
  address: string | null;
}

export interface InvoiceSeller extends InvoiceParty {
  businessStyle: string | null;
  branchCode: string | null;
  vatRegistered: boolean;
  header: string | null;
  footer: string | null;
}

export interface InvoicePaymentRow {
  allocationId: string;
  paymentId: string;
  number: string;
  method: PaymentMethod;
  referenceNo: string | null;
  amount: number;
  allocatedOn: string;
  /** False once the payment was voided: it no longer counts. */
  counts: boolean;
}

export interface Invoice {
  id: string;
  /** Null while a draft. */
  number: string | null;
  status: InvoiceStatus;
  statusLabel: string;
  source: "work_orders" | "manual";
  branchId: string | null;
  customerAccountId: string;
  customerName: string;
  issueDate: string | null;
  dueDate: string | null;
  paymentTermsDays: number;
  daysOverdue: number;
  buyer: InvoiceParty;
  seller: InvoiceSeller;
  pricesIncludeVat: boolean;
  vatRatePct: string;
  /** The wording a non-VAT branch's invoice must carry; null otherwise. */
  nonVatNotice: string | null;
  totals: InvoiceTotals;
  paid: number;
  balance: number;
  notes: string;
  lines: InvoiceLine[];
  workOrders: { id: string; reference: string; title: string; completedOn: string | null; released: boolean }[];
  payments: InvoicePaymentRow[];
  createdByName: string;
  issuedAt: string | null;
  issuedByName: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  canEdit: boolean;
  canIssue: boolean;
  canVoid: boolean;
  canRecordPayment: boolean;
}

export interface Payment {
  id: string;
  number: string;
  status: "posted" | "void";
  method: PaymentMethod;
  methodLabel: string;
  referenceNo: string | null;
  amount: number;
  allocated: number;
  unallocated: number;
  receivedOn: string;
  receivedByName: string;
  customerAccountId: string;
  customerName: string;
  notes: string;
  allocations: { id: string; invoiceId: string; invoiceNumber: string | null; amount: number; allocatedOn: string; allocatedByName: string }[];
  voidReason: string | null;
  canAllocate: boolean;
  canVoid: boolean;
}

export interface AccountBalance {
  customerAccountId: string;
  customerName: string;
  paymentTermsDays: number;
  creditLimit: number | null;
  outstanding: number;
  overdue: number;
  credit: number;
  netBalance: number;
  availableCredit: number | null;
  overLimit: boolean;
  openInvoices: Invoice[];
  nextDueDate: string | null;
  /** Staff only: closed jobs not yet invoiced. */
  uninvoicedJobs: number | null;
}

export interface StatementEntry {
  date: string;
  kind: "invoice" | "invoice_void" | "payment" | "payment_void";
  documentId: string;
  reference: string;
  description: string;
  charge: number;
  credit: number;
  balance: number;
}

export interface Statement {
  customerName: string;
  from: string;
  to: string;
  openingBalance: number;
  totalCharges: number;
  totalCredits: number;
  closingBalance: number;
  entries: StatementEntry[];
}

export type AgingBucket = "current" | "days_1_30" | "days_31_60" | "days_61_90" | "over_90";

export interface AgingRow extends Record<AgingBucket, number> {
  customerAccountId: string;
  customerName: string;
  total: number;
  credit: number;
}

export interface AgingReport {
  asOf: string;
  accounts: AgingRow[];
  totals: Record<AgingBucket, number> & { total: number };
}

export interface RevenueReport {
  from: string;
  to: string;
  accrual: { invoices: number; netSales: number; vat: number; total: number };
  cash: { payments: number; received: number; byMethod: { method: PaymentMethod; received: number }[] };
}

/** What `POST /work-orders` adds when the account is over its credit limit. */
export interface CreditWarning {
  code: string;
  message: string;
}
