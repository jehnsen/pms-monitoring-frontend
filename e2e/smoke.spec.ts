import { expect, test } from "@playwright/test";
import { ACCOUNTS, choose, expectNoLoadError, pageAs, signIn, tinyPdf, type AccountKey } from "./helpers";

/*
 * Smoke suite for the API cutover: each flow drives the real UI against the
 * real API. Nothing here stubs a response.
 */

test.describe("sign-in per role", () => {
  const roles: AccountKey[] = ["providerAdmin", "serviceAdvisor", "technician", "fleetManager", "viewer"];

  for (const role of roles) {
    test(`${role} lands on their home`, async ({ page }) => {
      await signIn(page, role);
      await expect(page).toHaveURL(new RegExp(`${ACCOUNTS[role].home}$`));
      await expect(page.getByText(ACCOUNTS[role].name).first()).toBeVisible();
      await expectNoLoadError(page);
    });
  }

  test("a suspended account is refused", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(ACCOUNTS.suspended.email);
    await page.locator("#password").fill("demo1234");
    await page.getByRole("button", { name: /Sign in to workspace/ }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test("dashboard renders the fleet overview", async ({ page }) => {
  await signIn(page, "fleetManager");
  await expect(page.getByRole("heading", { name: "Fleet overview" })).toBeVisible();
  // KPI tiles come from GET /analytics/dashboard; a skeleton never resolves on failure.
  await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 30_000 });
  await expectNoLoadError(page);
});

test("work order: create → approve → close", async ({ browser }) => {
  const stamp = Date.now();
  const title = `E2E aircon compressor ${stamp}`;

  // 1 — the shop raises a corrective job big enough to need the client.
  const advisor = await pageAs(browser, "serviceAdvisor");
  await advisor.goto("/work-orders");
  await advisor.getByRole("button", { name: "New work order" }).click();
  await choose(advisor, "#wo-vehicle", /^NCT 9034/);
  await choose(advisor, "#wo-type", "Corrective repair");
  await advisor.locator("#wo-title").fill(title);
  await advisor.getByLabel("Line description").first().fill("Replace aircon compressor");
  await advisor.getByLabel("Part unit rate").first().fill("60000");
  await advisor.getByLabel("Labour hours").first().fill("3");
  await advisor.getByRole("button", { name: "Create work order" }).click();
  await expect(advisor.getByText(/awaiting approval/)).toBeVisible();
  await advisor.getByRole("button", { name: "View work order" }).click();
  await advisor.waitForURL(/\/work-orders\/[0-9a-z]+$/);
  const orderUrl = new URL(advisor.url()).pathname;

  // 2 — the fleet manager approves the line.
  const manager = await pageAs(browser, "fleetManager");
  await manager.goto(orderUrl);
  await expect(manager.getByText(title)).toBeVisible();
  await manager.getByRole("button", { name: "Approve", exact: true }).first().click();
  await expect(manager.getByText("Approved").first()).toBeVisible();

  // 3 — the advisor books a bay…
  await advisor.reload();
  await advisor.getByRole("button", { name: "Schedule" }).click();
  await choose(advisor, "#schedule-bay", /.+/);
  await advisor.getByRole("button", { name: "Confirm slot" }).click();
  await expect(advisor.getByRole("button", { name: "Start job" })).toBeVisible();

  // …and the bay technician starts and closes it (closing is theirs, not the advisor's).
  const technician = await pageAs(browser, "technician");
  await technician.goto(orderUrl);
  await technician.getByRole("button", { name: "Start job" }).click();
  await technician.getByRole("button", { name: /Close & record service/ }).click();
  await technician.getByRole("button", { name: "Use last recorded" }).click();
  await technician.getByRole("button", { name: "Close work order" }).click();
  await expect(technician.getByRole("button", { name: /Close & record service/ })).toHaveCount(0);
  await expect(technician.getByText(/Ready for billing|Closed/).first()).toBeVisible();
});

test("check-in finds a vehicle by plate", async ({ page }) => {
  await signIn(page, "serviceAdvisor");
  await page.goto("/shop/check-in");
  // Exact match on the normalised plate: case, space and dash insensitive.
  await page.getByLabel("Search for a vehicle").fill("nct-9034");
  await expect(page.getByRole("button", { name: "Change" })).toBeVisible();
  await expect(page.getByText("NCT 9034").first()).toBeVisible();
  await expect(page.getByText("2 · Odometer reading")).toBeVisible();
  await expect(page.getByText("3 · Work to offer")).toBeVisible();
  await expect(page.getByText("Actimed").first()).toBeVisible();
});

test("upload a document", async ({ page }) => {
  const name = `e2e-invoice-${Date.now()}.pdf`;
  await signIn(page, "fleetManager");
  await page.goto("/documents");
  await page.getByRole("button", { name: "Upload document" }).first().click();
  await page.locator("#doc-file").setInputFiles({ name, mimeType: "application/pdf", buffer: tinyPdf() });
  await page.getByRole("button", { name: "File document" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(name).first()).toBeVisible();
});

test("an out-of-scope URL shows not-found", async ({ browser }) => {
  // A vehicle Actimed can see…
  const actimed = await pageAs(browser, "fleetManager");
  await actimed.goto("/vehicles");
  await actimed.locator('a[href^="/vehicles/"]').first().click();
  await actimed.waitForURL(/\/vehicles\/[0-9a-z]+$/);
  const vehicleUrl = new URL(actimed.url()).pathname;

  // …is "not found, or not yours" to a sibling client under the same provider.
  const northwind = await pageAs(browser, "northwind");
  await northwind.goto(vehicleUrl);
  await expect(northwind.getByText("Not found, or not yours")).toBeVisible();
});
