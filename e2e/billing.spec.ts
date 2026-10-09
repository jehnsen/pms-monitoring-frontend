import { expect, test, type Page } from "@playwright/test";
import { choose, expectNoLoadError, pageAs, signIn } from "./helpers";

/*
 * Order-to-cash (Phase 7), driven through its screens against the demo seed
 * (Demo\BillingSeed): INV-2026-0001 Actimed, part-paid by PAY-2026-0001;
 * INV-2026-0002 Northwind, past due and over its ₱5,000 credit limit;
 * INV-2026-0003 Actimed; a Sagrada draft; every other closed job waits in the
 * billing queue. Writes are real: the suite runs on a demo database.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** A call with the page's own session: setup and verification only. */
async function apiAs(page: Page, method: string, path: string, data?: unknown) {
  const cookies = await page.context().cookies("http://localhost:8000");
  const xsrf = cookies.find((cookie) => cookie.name === "XSRF-TOKEN")?.value;
  const response = await page.request.fetch(`${API}${path}`, {
    method,
    data,
    headers: {
      Accept: "application/json",
      Origin: "http://localhost:3000",
      Referer: "http://localhost:3000/",
      ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
    },
  });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as { data: Record<string, unknown> & { id: string } };
}

/** A small Actimed job taken from draft through approval and the work to closed, through the API (as the owner). */
async function closedJob(page: Page): Promise<{ id: string; reference: string }> {
  const accounts = (await apiAs(page, "GET", "/customer-accounts?per_page=100")) as unknown as { data: { id: string; display_name: string }[] };
  const actimed = accounts.data.find((a) => a.display_name === "Actimed")!;
  const vehicles = (await apiAs(page, "GET", `/vehicles?customer_account_id=${actimed.id}&per_page=1`)) as unknown as { data: { id: string }[] };
  const bays = (await apiAs(page, "GET", "/bays?per_page=1")) as unknown as { data: { id: string }[] };

  const order = await apiAs(page, "POST", "/work-orders", {
    vehicle_id: vehicles.data[0].id,
    title: "E2E wiper blades",
    type: "corrective",
    lines: [{ description: "Wiper blades", quantity: 1, unit_part_rate_cents: 65000, labour_hours: 0.25, labour_rate_cents: 65000, urgency: "optional" }],
  });
  const id = order.data.id;
  const sent = await apiAs(page, "POST", `/work-orders/${id}/send`);
  expect(sent.data.status).toBe("approved");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  await apiAs(page, "POST", `/work-orders/${id}/schedule`, { scheduled_for: today, scheduled_time: "16:00", bay_id: bays.data[0].id });
  await apiAs(page, "POST", `/work-orders/${id}/start`);
  await apiAs(page, "POST", `/work-orders/${id}/complete`, { findings: "Blades torn; replaced." });
  const closed = await apiAs(page, "POST", `/work-orders/${id}/close`);
  expect(closed.data.lifecycle_stage).toBe("ready_for_billing");

  return { id, reference: String(closed.data.reference) };
}

test("every billing screen opens with the seeded receivables (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");

  await page.goto("/shop/billing");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Billing queue" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Actimed" })).toBeVisible();

  await page.goto("/invoices");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("link", { name: "INV-2026-0001" })).toBeVisible();
  await expect(page.getByRole("link", { name: "INV-2026-0002" })).toBeVisible();

  await page.getByRole("link", { name: "INV-2026-0001" }).click();
  await expectNoLoadError(page);
  await expect(page.getByText("Partially paid").first()).toBeVisible();
  await expect(page.getByText("VATable sales")).toBeVisible();
  await expect(page.getByText("PAY-2026-0001")).toBeVisible();

  await page.goto("/invoices");
  await page.getByRole("tab", { name: "Payments" }).click();
  await expect(page.getByText("PAY-2026-0001")).toBeVisible();

  await page.goto("/shop/receivables");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Receivables" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Northwind Logistics" })).toBeVisible();
  await expect(page.getByText("Invoiced (accrual)")).toBeVisible();
  await expect(page.getByText("Received (cash)")).toBeVisible();

  // The customer balance tab, from the aging row.
  await page.getByRole("link", { name: "Northwind Logistics" }).click();
  await expect(page.getByRole("tab", { name: "Balance" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("over its credit limit")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Statement of account" })).toBeVisible();
  await expect(page.getByText("INV-2026-0002").first()).toBeVisible();
});

test("a job goes from closed to invoiced to paid, with its PDFs (owner, then cashier)", async ({ page, browser }) => {
  await signIn(page, "providerAdmin");
  const job = await closedJob(page);

  // Invoiced from the billing queue: a draft opens.
  await page.goto("/shop/billing");
  // Oldest finished first: narrow to the account to find today's job.
  await choose(page, '[aria-label="Account"]', "Actimed");
  await page.getByRole("checkbox", { name: `Select ${job.reference}` }).check();
  await page.getByRole("button", { name: "Invoice 1 job" }).click();
  await page.waitForURL(/\/invoices\/[0-9a-z]{26}$/);
  await expect(page.getByText("Draft invoice").first()).toBeVisible();
  await expect(page.getByText("Wiper blades — parts")).toBeVisible();
  const invoicePath = new URL(page.url()).pathname;

  // Issued: numbered, due on the account's terms.
  await page.getByRole("button", { name: "Issue", exact: true }).click();
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(page.getByRole("heading", { name: /INV-2026-\d{4}/ })).toBeVisible();
  const number = (await page.getByRole("heading", { name: /INV-2026-\d{4}/ }).textContent())!.match(/INV-2026-\d{4}/)![0];
  await expect(page.getByText("Issued").first()).toBeVisible();

  // The job now reads invoiced.
  await page.goto(`/work-orders/${job.id}`);
  await expect(page.getByText("Invoiced").first()).toBeVisible();
  await expect(page.getByRole("link", { name: number })).toBeVisible();

  // Paid at the counter by the cashier: the amount defaults to the balance.
  const cashier = await pageAs(browser, "cashier");
  await cashier.goto(invoicePath);
  await cashier.getByRole("button", { name: "Record payment" }).click();
  await cashier.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  await expect(cashier.getByText("Paid").first()).toBeVisible();
  await expect(cashier.getByText(/PAY-2026-\d{4}/).first()).toBeVisible();

  // The printed invoice and the acknowledgment receipt.
  const invoicePdf = cashier.waitForEvent("download");
  await cashier.getByRole("button", { name: "PDF" }).click();
  expect((await invoicePdf).suggestedFilename()).toBe(`${number}.pdf`);

  await cashier.goto("/invoices");
  await cashier.getByRole("tab", { name: "Payments" }).click();
  const receipt = cashier.waitForEvent("download");
  await cashier.getByRole("button", { name: /Acknowledgment receipt PAY-2026-/ }).first().click();
  expect((await receipt).suggestedFilename()).toMatch(/^PAY-2026-\d{4}\.pdf$/);

  // Completed: the job is paid; the vehicle is still at the shop until handed back.
  await page.goto(`/work-orders/${job.id}`);
  await expect(page.getByText("Paid").first()).toBeVisible();
  await cashier.context().close();
});

test("a customer sees their own invoices, balance and statement, and moves no money (fleet manager)", async ({ page }) => {
  await signIn(page, "fleetManager");

  await page.goto("/invoices");
  await expectNoLoadError(page);
  await expect(page.getByRole("tab", { name: "Balance & statement" })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("Outstanding").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Statement of account" })).toBeVisible();
  const statement = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).click();
  expect((await statement).suggestedFilename()).toMatch(/^statement-.*\.pdf$/);

  await page.getByRole("tab", { name: "Invoices" }).click();
  await expect(page.getByRole("link", { name: "INV-2026-0001" })).toBeVisible();
  // Another account's invoice is not in the list.
  await expect(page.getByRole("link", { name: "INV-2026-0002" })).toHaveCount(0);

  await page.getByRole("link", { name: "INV-2026-0001" }).click();
  await expect(page.getByText("VATable sales")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Void" })).toHaveCount(0);
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).click();
  expect((await pdf).suggestedFilename()).toBe("INV-2026-0001.pdf");
});
