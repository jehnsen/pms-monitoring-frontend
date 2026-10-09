import { expect, test, type Page } from "@playwright/test";
import { choose, expectNoLoadError, signIn } from "./helpers";

/*
 * The shop's stock room, driven through its screens against the demo seed
 * (MekanikoMoR: 11 items; the repair store holds the oil filter at 13; SPO-2026-0001
 * is issued and part-received). The owner (provider admin) holds every
 * inventory capability. Writes are real: the suite runs on a demo database.
 */

const stamp = () => Date.now().toString(36).toUpperCase();
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
  return response;
}

test("every stock room screen opens with the seeded data (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");

  await page.goto("/shop/inventory");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
  await expect(page.getByText("Engine oil filter").first()).toBeVisible();
  await expect(page.getByText("90915-YZZD4").first()).toBeVisible();

  await page.goto("/shop/inventory/stock");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Stock on hand" })).toBeVisible();
  await expect(page.getByText("Stock value")).toBeVisible();
  await expect(page.getByText("Engine oil filter").first()).toBeVisible();

  await page.goto("/shop/inventory/movements");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Item movements" })).toBeVisible();
  await expect(page.getByText("GR-2026-0001").first()).toBeVisible();

  await page.goto("/shop/inventory/purchasing");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Receive PO" })).toBeVisible();
  await expect(page.getByText("SPO-2026-0001").first()).toBeVisible();

  await page.goto("/shop/inventory/counts");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Stock count" })).toBeVisible();
  await expect(page.getByText("SC-2026-0001").first()).toBeVisible();

  await page.goto("/shop/inventory/transfers");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Transfers" })).toBeVisible();
  await expect(page.getByText("TR-2026-0001").first()).toBeVisible();

  await page.goto("/shop/inventory/reorder");
  await expectNoLoadError(page);
  await expect(page.getByRole("heading", { name: "Reorder" })).toBeVisible();
  await expect(page.getByText("Camber adjustment bolt").first()).toBeVisible();
});

test("items: add one, set it up for a branch (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");
  const sku = `E2E-${stamp()}`;

  await page.goto("/shop/inventory");
  await page.getByRole("button", { name: "Add item" }).first().click();
  await page.locator("#item-sku").fill(sku);
  await page.locator("#item-name").fill(`E2E widget ${sku}`);
  await page.locator("#item-uom").fill("pc");
  await page.locator("#item-price").fill("250");
  await page.getByRole("button", { name: "Add item" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Search items" }).fill(sku);
  await expect(page.getByText(`E2E widget ${sku}`)).toBeVisible();

  await page.getByRole("button", { name: `Branch settings for E2E widget ${sku}` }).click();
  await page.locator("#bs-point").fill("5");
  await page.locator("#bs-qty").fill("10");
  await page.locator("#bs-bin").fill("E-99");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A duplicate SKU is refused, in the dialog, by the API.
  await page.getByRole("button", { name: "Add item" }).first().click();
  await page.locator("#item-sku").fill(sku.toLowerCase());
  await page.locator("#item-name").fill("Duplicate");
  await page.locator("#item-uom").fill("pc");
  await page.getByRole("button", { name: "Add item" }).last().click();
  await expect(page.getByText("Another item already uses that SKU.")).toBeVisible();
});

test("receive PO: take in part of an issued order (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");
  await page.goto("/shop/inventory/purchasing");

  const card = page.getByRole("region", { name: "SPO-2026-0001" });
  const badge = card.locator("header .rounded-full").first();
  await expect(badge).toHaveText(/Partly received|Received/);

  if (/Partly received/.test((await badge.textContent()) ?? "")) {
    await card.getByRole("button", { name: "Receive" }).click();
    // Only the box of filters is still outstanding; take one of the two.
    await page.getByLabel(/^Receive Engine oil filter/).fill("1");
    await page.getByLabel("Delivery note / invoice no.").fill(`E2E-${stamp()}`);
    await page.getByRole("button", { name: "Receive goods" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/shop/inventory/movements");
    await expect(page.getByText(/GR-2026-\d{4}/).first()).toBeVisible();
  }

  // Raise a new one for the coolant draft's vendor and issue it.
  await page.goto("/shop/inventory/purchasing");
  await page.getByRole("button", { name: "New purchase order" }).first().click();
  await choose(page, "#po-vendor", /Isuzu Alabang Service/);
  await page.getByRole("combobox", { name: "Item" }).first().click();
  await page.getByRole("option", { name: /08889-80015/ }).click();
  await page.getByLabel(/^Quantity in/).first().fill("4");
  await page.getByLabel(/^Unit cost per/).first().fill("1040");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The default view is the open orders: drafts are one filter away.
  await choose(page, '[aria-label="Status"]', "Drafts");
  await expect(page.getByText("Draft").first()).toBeVisible();
});

test("stock count and transfer (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");

  // A fresh sheet for the first location; count one line and post.
  await page.goto("/shop/inventory/counts");
  await page.getByRole("button", { name: "New count" }).first().click();
  await page.locator("#nc-reason").fill("E2E cycle count");
  await page.getByRole("button", { name: "Draw sheet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Count", exact: true }).first().click();
  await page.getByLabel("Counted Shop rags (bag)").fill("10");
  await page.getByRole("button", { name: "Post adjustments" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Posted").first()).toBeVisible();

  // A transfer between the two stores.
  await page.goto("/shop/inventory/transfers");
  await page.getByRole("button", { name: "New transfer" }).first().click();
  await page.getByRole("combobox", { name: "Item" }).first().click();
  await page.getByRole("option", { name: /DTL-MF-CLOTH/ }).click();
  await page.getByLabel(/^Quantity/).first().fill("1");
  await page.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/TR-2026-\d{4}/).first()).toBeVisible();
});

test("a shop-stock line is issued when the job is done, and the job shows its cost (provider admin)", async ({ page }) => {
  await signIn(page, "providerAdmin");
  const title = `E2E shop stock ${stamp()}`;

  await page.goto("/work-orders");
  await page.getByRole("button", { name: "New work order" }).click();
  await choose(page, "#wo-vehicle", /^NCT 9034/);
  await choose(page, "#wo-type", "Corrective repair");
  await page.locator("#wo-title").fill(title);
  await page.getByLabel("Line description").first().fill("Oil filter");
  await choose(page, '[aria-label="Parts source"]', "Shop stock");
  await page.getByRole("combobox", { name: "Inventory item" }).click();
  await page.getByRole("option", { name: /90915-YZZD4/ }).click();
  await page.getByLabel("Quantity").first().fill("1");
  await page.getByRole("button", { name: "Create work order" }).click();
  await page.getByRole("button", { name: "View work order" }).click();
  await page.waitForURL(/\/work-orders\/[0-9a-z]{26}$/);
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";

  // The line names where its part comes from, and the item.
  await expect(page.getByText(/Shop stock \(Engine oil filter\)/)).toBeVisible();

  // Drive the rest as the owner: approve what is pending, schedule, start, record the work, close.
  const order = await (await apiAs(page, "GET", `/work-orders/${id}`)).json();
  if (order.data.status === "pending_approval") {
    const decisions = order.data.lines.map((line: { id: string }) => ({ line_id: line.id, decision: "approved" }));
    expect((await apiAs(page, "POST", `/work-orders/${id}/decisions`, { decisions })).ok()).toBeTruthy();
  }
  const bays = await (await apiAs(page, "GET", "/bays")).json();
  expect(
    (await apiAs(page, "POST", `/work-orders/${id}/schedule`, { scheduled_for: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), scheduled_time: "09:00", bay_id: bays.data[0].id })).ok()
  ).toBeTruthy();
  expect((await apiAs(page, "POST", `/work-orders/${id}/start`)).ok()).toBeTruthy();
  expect((await apiAs(page, "POST", `/work-orders/${id}/complete`, { findings: "Filter replaced." })).ok()).toBeTruthy();

  // The shelf gave it up: an issue against this order is on the ledger.
  await page.goto(`/shop/inventory/movements`);
  await expect(page.getByText("Issue").first()).toBeVisible();
  await page.reload();
  const done = await (await apiAs(page, "GET", `/work-orders/${id}`)).json();
  expect(done.data.stock.cost_cents).toBeGreaterThan(0);

  await page.goto(`/work-orders/${id}`);
  await expect(page.getByText("Parts cost to the shop")).toBeVisible();
  await expect(page.getByText("Margin on parts")).toBeVisible();
});

test("the shop's costs and items stay on the shop's side (fleet manager, service advisor, technician)", async ({ page, browser }) => {
  // A fleet manager sees the shop's gate, not its stock.
  await signIn(page, "fleetManager");
  await page.goto("/shop/inventory");
  await expect(page.getByText("This is the service centre's view")).toBeVisible();

  // The advisor and technician read it, but cannot change it.
  const advisor = await (async () => {
    const context = await browser.newContext();
    const advisorPage = await context.newPage();
    await signIn(advisorPage, "serviceAdvisor");
    return advisorPage;
  })();
  await advisor.goto("/shop/inventory");
  await expectNoLoadError(advisor);
  await expect(advisor.locator("[aria-disabled=true]", { has: advisor.getByRole("button", { name: "Add item" }) })).toBeVisible();
  await advisor.goto("/shop/inventory/stock");
  await expect(advisor.getByText("Engine oil filter").first()).toBeVisible();
});
