import { expect, test } from "@playwright/test";
import { choose, expectNoLoadError, pageAs, signIn } from "./helpers";

/*
 * The books (Phase 8), driven through their screens against a fresh demo seed
 * (migrate:fresh --seed): the invoices, the part payment and the stock room's
 * opening balances, receipt, transfer and count have all been posted by the
 * API as they happened. Closing a month is final, so the close test expects
 * the seed's earliest month to be open.
 */

test("every screen of the books opens with the seeded activity (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");

  await page.goto("/shop/books");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Chart of accounts" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^Accounts Receivable/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^GR\/IR Clearing/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add account" })).toBeEnabled();

  await page.goto("/shop/books/rules");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Posting rules" })).toBeVisible();
  await expect(page.getByText("Parts sales", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Export to your accountant" })).toBeVisible();

  await page.goto("/shop/books/journal");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();

  await page.goto("/shop/books/periods");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Period close" })).toBeVisible();

  await page.goto("/shop/books/reports");
  await expectNoLoadError(page);
  await expect(page.getByRole("tab", { name: "Trial balance" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("The trial balance balances")).toBeVisible();
});

test("an invoice's entry shows the receivable, the sales and the VAT, balanced", async ({ page }) => {
  await signIn(page, "providerAdmin");
  await page.goto("/shop/books/journal");

  await page.locator("#journal-from").fill("2026-01-01");
  await page.getByLabel("Search the journal").fill("INV-2026-0001");
  const entry = page.getByRole("row", { name: /Invoice issued/ }).first();
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: /^JE-/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Accounts Receivable")).toBeVisible();
  await expect(dialog.getByText("Output VAT")).toBeVisible();
  await expect(dialog.getByText("Sales – Parts")).toBeVisible();
  // Debits and credits add up to the same total.
  const totals = dialog.locator("tfoot td.tabular");
  await expect(totals).toHaveCount(2);
  expect(await totals.nth(0).textContent()).toBe(await totals.nth(1).textContent());
});

test("the journal exports as a CSV", async ({ page }) => {
  await signIn(page, "providerAdmin");
  await page.goto("/shop/books/journal");
  await page.locator("#journal-from").fill("2026-01-01");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^journal-2026-01-01-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("the reports read from the journal: ledger, profit and loss, balance sheet, daily sales", async ({ page }) => {
  await signIn(page, "providerAdmin");
  await page.goto("/shop/books/reports");

  await page.getByRole("tab", { name: "General ledger" }).click();
  await page.locator("#gl-from").fill("2026-01-01");
  await expect(page.getByText("Balance brought forward")).toBeVisible();
  await expect(page.getByText(/1100 · Accounts Receivable — /)).toBeVisible();

  await page.getByRole("tab", { name: "Profit and loss" }).click();
  await page.locator("#pl-from").fill("2026-01-01");
  await expect(page.getByRole("cell", { name: "Gross profit" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Net profit" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Consolidated" })).toBeVisible();

  await page.getByRole("tab", { name: "Balance sheet" }).click();
  await expect(page.getByText("The balance sheet balances")).toBeVisible();
  await expect(page.getByText("Earnings to date")).toBeVisible();

  await page.getByRole("tab", { name: "Daily sales" }).click();
  await page.locator("#ds-from").fill("2026-01-01");
  await expect(page.getByRole("columnheader", { name: "By method" })).toBeVisible();
  await expect(page.getByText(/Bank transfer/).first()).toBeVisible();
});

test("a posting rule is re-pointed and the chart gains an account (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");

  // Accounts are never deleted, so each run adds its own.
  const stamp = Date.now().toString(36).toUpperCase();
  const name = `Sales – Accessories ${stamp}`;
  await page.goto("/shop/books");
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Code").fill(`E2E-${stamp}`);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("cell", { name: new RegExp(`^${name}`) })).toBeVisible();

  await page.goto("/shop/books/rules");
  await choose(page, '[aria-label="Detailing sales"]', new RegExp(`E2E-${stamp} · ${name}`));
  await page.getByRole("button", { name: /Save 1 change/ }).click();
  await expect(page.getByText(/New postings follow these rules/)).toBeVisible();

  // Put it back: the rule, and then the account is free to deactivate.
  await choose(page, '[aria-label="Detailing sales"]', /4020 · Sales – Detailing/);
  await page.getByRole("button", { name: /Save 1 change/ }).click();
  await expect(page.getByText(/New postings follow these rules/)).toBeVisible();
});

test("a rule only offers accounts of the kind it posts to", async ({ page }) => {
  await signIn(page, "providerAdmin");
  await page.goto("/shop/books/rules");

  await page.getByLabel("Detailing sales").click();
  await expect(page.getByRole("option", { name: /Sales – Parts/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Accounts Receivable/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("the close checklist passes on the seeded books, and the oldest month closes for good", async ({ page }) => {
  await signIn(page, "providerAdmin");
  await page.goto("/shop/books/periods");

  // Opens on the oldest open month.
  await expect(page.getByText("Every invoice, payment and stock move is posted")).toBeVisible();
  await expect(page.getByText("Receivables subledger equals Accounts Receivable")).toBeVisible();
  await expect(page.getByText("Stock valuation equals Inventory")).toBeVisible();
  await expect(page.getByText("Unapplied customer credit equals Customer Deposits")).toBeVisible();
  await expect(page.getByText("The trial balance balances")).toBeVisible();
  await expect(page.getByText("(failed)")).toHaveCount(0);

  const heading = await page.locator("section h2").first().textContent();
  const close = page.getByRole("button", { name: `Close ${heading}` });
  await expect(close).toBeEnabled();
  await close.click();
  await page.getByRole("dialog").getByRole("button", { name: `Close ${heading}` }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(page.getByRole("navigation", { name: "Accounting periods" }).getByText("Closed").first()).toBeVisible();
  await expect(page.getByRole("button", { name: `Close ${heading}` })).toHaveCount(0);
});

test("a branch manager reads the books but cannot change or close them", async ({ browser }) => {
  // The demo's only branch manager is pinned to the detailing branch; sign in as them directly.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill("manager.samahuzai@mekanikomore.ph");
  await page.locator("#password").fill("demo1234");
  await page.getByRole("button", { name: /Sign in to workspace/ }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/shop"), { timeout: 60_000 });

  await page.goto("/shop/books");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Chart of accounts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add account" })).toBeVisible();
  await expect(page.locator('[aria-disabled="true"]').filter({ hasText: "Add account" })).toHaveCount(1);

  await page.goto("/shop/books/periods");
  await expect(page.locator('[aria-disabled="true"]').filter({ hasText: /^Close / })).toHaveCount(1);
  await context.close();
});

test("the cashier and the customer are told the books are not theirs", async ({ page, browser }) => {
  await signIn(page, "cashier");
  await page.goto("/shop/books");
  await expect(page.getByText("The books aren't open to this role")).toBeVisible();
  await page.goto("/shop/books/journal");
  await expect(page.getByText("The books aren't open to this role")).toBeVisible();

  // A customer never reaches the shop's books.
  const customer = await pageAs(browser, "fleetManager");
  await customer.goto("/shop/books");
  await expect(customer.getByRole("heading", { name: "Chart of accounts" })).toHaveCount(0);
  await expect(customer.getByRole("button", { name: "Add account" })).toHaveCount(0);
  await customer.context().close();
});
