import { describe, expect, it } from "vitest";
import { toBalanceSheet, toChecklist, toDailySales, toProfitAndLoss, toTrialBalance } from "@/lib/api/ledger";

const scope = { branches: [{ id: "b1", name: "Repair" }], all_branches: true };

describe("the books' mappers", () => {
  it("shows centavos as pesos and keeps the API's totals as they are", () => {
    const trial = toTrialBalance({
      as_of: "2026-10-08",
      scope,
      accounts: [{ account_id: "a1", code: "1100", name: "Accounts Receivable", type: "asset", debit_cents: 131_331_2, credit_cents: 0 }],
      total_debit_cents: 131_331_2,
      total_credit_cents: 131_331_2,
      difference_cents: 0,
      balanced: true,
    });

    expect(trial.accounts[0].debit).toBe(13133.12);
    expect(trial.totalDebit).toBe(trial.totalCredit);
    expect(trial.balanced).toBe(true);
    expect(trial.scope.allBranches).toBe(true);
  });

  it("maps a check that compares two figures, and one that does not", () => {
    const list = toChecklist({
      period_key: "2026-09",
      label: "September 2026",
      starts_on: "2026-09-01",
      ends_on: "2026-09-30",
      status: "open",
      ended: true,
      checklist: [
        { key: "unposted_sources", label: "Every invoice, payment and stock move is posted", passed: true, expected_cents: null, actual_cents: null, difference_cents: null, detail: "Nothing is waiting to be posted." },
        { key: "receivables", label: "Receivables subledger equals Accounts Receivable", passed: false, expected_cents: 100_00, actual_cents: 90_50, difference_cents: -9_50, detail: "off" },
      ],
      can_close: false,
      blocked_by: "The checklist has failures.",
    });

    expect(list.checks[0]).toMatchObject({ expected: null, actual: null, difference: null, passed: true });
    expect(list.checks[1]).toMatchObject({ expected: 100, actual: 90.5, difference: -9.5, passed: false });
    expect(list.canClose).toBe(false);
  });

  it("keeps a profit-and-loss column per branch", () => {
    const pl = toProfitAndLoss({
      from: "2026-10-01",
      to: "2026-10-31",
      scope,
      branches: [
        { id: "b1", name: "Repair" },
        { id: "b2", name: "Detailing" },
      ],
      revenue: [{ account_id: "r", code: "4010", name: "Sales – Parts", by_branch: { b1: 114_600_0, b2: 0 }, total_cents: 114_600_0 }],
      cost_of_sales: [],
      gross_profit: { by_branch: { b1: 114_600_0, b2: 0 }, total_cents: 114_600_0 },
      expenses: [],
      net_profit: { by_branch: { b1: 114_600_0, b2: 0 }, total_cents: 114_600_0 },
    });

    expect(pl.revenue[0].byBranch).toEqual({ b1: 11460, b2: 0 });
    expect(pl.netProfit.total).toBe(11460);
  });

  it("maps a balance sheet and a day's sales", () => {
    const sheet = toBalanceSheet({
      as_of: "2026-10-08",
      scope,
      assets: [{ account_id: "a", code: "1200", name: "Inventory", amount_cents: 8_166_003 }],
      liabilities: [],
      equity: [],
      current_earnings_cents: 1_464_003,
      total_assets_cents: 8_166_003,
      total_liabilities_cents: 0,
      total_equity_cents: 8_166_003,
      balanced: true,
    });
    expect(sheet.assets[0].amount).toBe(81660.03);
    expect(sheet.currentEarnings).toBe(14640.03);

    const sales = toDailySales({
      from: "2026-09-01",
      to: "2026-09-30",
      scope,
      days: [{ date: "2026-09-08", branch_id: "b1", branch_name: "Repair", net_sales_cents: 0, vat_cents: 0, invoiced_cents: 0, received_cents: 384_608, receipts: [{ method: "bank_transfer", received_cents: 384_608 }] }],
      totals: { net_sales_cents: 0, vat_cents: 0, invoiced_cents: 0, received_cents: 384_608 },
    });
    expect(sales.days[0].receipts[0]).toEqual({ method: "bank_transfer", received: 3846.08 });
  });
});
