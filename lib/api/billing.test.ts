import { describe, expect, it } from "vitest";
import { toAging, toBalance, toInvoice, toPayment, toStatement, type RawInvoice } from "@/lib/api/billing";

/**
 * The seam between the API's billing resources and the screens: snake_case
 * to camelCase, centavos to pesos for display, decimal strings to numbers.
 * The mappers compute nothing: every total, status and bucket is the API's.
 */

const invoice: RawInvoice = {
  id: "inv-1",
  number: "INV-2026-0001",
  status: "partially_paid",
  status_label: "Partially paid",
  source: "work_orders",
  branch_id: null,
  customer_account_id: "acc-1",
  customer_name: "Actimed",
  issue_date: "2026-07-26",
  due_date: "2026-08-25",
  payment_terms_days: 30,
  days_overdue: 45,
  buyer: { name: "Actimed", tin: null, address: null },
  seller: { name: "MekanikoMoR", business_style: null, tin: "123-456-789", branch_code: "00002", address: "Biñan, Laguna", vat_registered: true, header: null, footer: "Permit details" },
  prices_include_vat: false,
  vat_rate_pct: "12",
  non_vat_notice: null,
  totals: {
    vatable_sales_cents: 858500,
    vat_exempt_sales_cents: 0,
    zero_rated_sales_cents: 0,
    non_vat_sales_cents: 0,
    net_sales_cents: 858500,
    discount_total_cents: 0,
    vat_amount_cents: 103020,
    total_due_cents: 961520,
  },
  paid_cents: 384608,
  balance_cents: 576912,
  notes: "",
  lines: [{ id: "l-1", kind: "labour", description: "Oil change — labour", work_order_id: "wo-1", quantity: "1.5", unit_price_cents: 65000, discount_cents: 0, tax_class: "vatable", line_total_cents: 97500 }],
  work_orders: [{ id: "wo-1", reference: "WO-2026-0080", title: "Oil change", completed_on: "2025-10-17", released: false }],
  payments: [{ allocation_id: "a-1", payment_id: "p-1", number: "PAY-2026-0001", method: "bank_transfer", reference_no: "BDO-1", amount_cents: 384608, allocated_on: "2026-09-09", counts: true }],
  created_by_name: "Mike Manabat",
  issued_at: "2026-10-08T02:00:00Z",
  issued_by_name: "Mike Manabat",
  voided_at: null,
  voided_by_name: null,
  void_reason: null,
  can_edit: false,
  can_issue: false,
  can_void: false,
  can_record_payment: true,
};

describe("invoice mapper", () => {
  it("reads the API's totals and balances as pesos, untouched", () => {
    const mapped = toInvoice(invoice);

    expect(mapped.totals).toEqual({
      vatableSales: 8585,
      vatExemptSales: 0,
      zeroRatedSales: 0,
      nonVatSales: 0,
      netSales: 8585,
      discountTotal: 0,
      vatAmount: 1030.2,
      totalDue: 9615.2,
    });
    expect(mapped.paid).toBe(3846.08);
    expect(mapped.balance).toBe(5769.12);
    expect(mapped.daysOverdue).toBe(45);
    expect(mapped.seller.branchCode).toBe("00002");
    expect(mapped.lines[0]).toMatchObject({ quantity: 1.5, unitPrice: 650, lineTotal: 975, taxClass: "vatable" });
    expect(mapped.payments[0]).toMatchObject({ number: "PAY-2026-0001", amount: 3846.08, counts: true });
    expect(mapped.canRecordPayment).toBe(true);
    expect(mapped.canVoid).toBe(false);
  });
});

describe("receivables mappers", () => {
  it("reads a payment, a balance, a statement and the aging report", () => {
    const payment = toPayment({
      id: "p-1",
      number: "PAY-2026-0002",
      status: "posted",
      method: "gcash",
      method_label: "GCash",
      reference_no: "GC-1",
      amount_cents: 100000,
      allocated_cents: 60000,
      unallocated_cents: 40000,
      received_on: "2026-10-08",
      received_by_name: "Paolo Reyes",
      customer_account_id: "acc-1",
      customer_name: "Actimed",
      notes: "",
      allocations: [{ id: "a", invoice_id: "inv-1", invoice_number: "INV-2026-0001", amount_cents: 60000, allocated_on: "2026-10-08", allocated_by_name: "Paolo Reyes" }],
      void_reason: null,
      can_allocate: true,
      can_void: false,
    });
    expect(payment).toMatchObject({ amount: 1000, allocated: 600, unallocated: 400, canAllocate: true });

    const balance = toBalance({
      customer_account_id: "acc-2",
      customer_name: "Northwind Logistics",
      payment_terms_days: 45,
      credit_limit_cents: 500000,
      outstanding_cents: 527520,
      overdue_cents: 527520,
      credit_cents: 0,
      net_balance_cents: 527520,
      available_credit_cents: -27520,
      over_limit: true,
      open_invoices: [invoice],
      next_due_date: "2026-10-03",
      uninvoiced_jobs: 14,
    });
    expect(balance).toMatchObject({ creditLimit: 5000, outstanding: 5275.2, availableCredit: -275.2, overLimit: true, uninvoicedJobs: 14 });
    expect(balance.openInvoices[0].number).toBe("INV-2026-0001");

    const statement = toStatement({
      customer_name: "Actimed",
      from: "2026-09-01",
      to: "2026-10-08",
      opening_balance_cents: 961520,
      total_charges_cents: 208880,
      total_credits_cents: 384608,
      closing_balance_cents: 785792,
      entries: [{ date: "2026-09-08", kind: "payment", document_id: "p", reference: "PAY-2026-0001", description: "Payment", charge_cents: 0, credit_cents: 384608, balance_cents: 576912 }],
    });
    expect(statement).toMatchObject({ openingBalance: 9615.2, closingBalance: 7857.92 });
    expect(statement.entries[0]).toMatchObject({ kind: "payment", credit: 3846.08, balance: 5769.12 });

    const aging = toAging({
      as_of: "2026-10-08",
      accounts: [{ customer_account_id: "acc-1", customer_name: "Actimed", current: 208880, days_1_30: 0, days_31_60: 576912, days_61_90: 0, over_90: 0, total: 785792, credit_cents: 0 }],
      totals: { current: 208880, days_1_30: 0, days_31_60: 576912, days_61_90: 0, over_90: 0, total: 785792 },
    });
    expect(aging.accounts[0]).toMatchObject({ customerName: "Actimed", current: 2088.8, days_31_60: 5769.12, total: 7857.92 });
    expect(aging.totals.total).toBe(7857.92);
  });
});
