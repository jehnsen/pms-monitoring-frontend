import { expect, test, type Page } from "@playwright/test";
import { choose, pageAs, signIn, tinyPdf, type AccountKey } from "./helpers";
import { recordApiCalls } from "./recorder";

/*
 * Parity sweep, actions: every mutation row of
 * ../torquelane-api/docs/frontend-parity.md that has a screen, driven through
 * that screen by a role allowed to do it. Each test records the API calls it
 * made (parity-log/parity-calls.jsonl) as the row's evidence, and fails on
 * any 5xx.
 */

const stamp = () => Date.now().toString(36).toUpperCase();

async function as(page: Page, role: AccountKey, label: string): Promise<() => void> {
  const calls = recordApiCalls(page, role, () => `${label} ${new URL(page.url()).pathname}`);
  await signIn(page, role);
  return () => {
    const unexpected = calls.filter(
      (call) =>
        call.status >= 400 &&
        // Anonymous before sign-in / after sign-out.
        !(call.endpoint === "/me" && call.status === 401) &&
        // The readings endpoint asks for confirmation with a 422 (confirm_warning).
        !(call.method === "POST" && /^\/vehicles\/\{id\}\/readings$/.test(call.endpoint) && call.status === 422)
    );
    expect(unexpected, "unexpected 4xx/5xx responses").toEqual([]);
  };
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** A call with the page's own session — setup only; the recorder sees page traffic, not this. */
async function apiAs(page: Page, method: string, path: string, data?: unknown) {
  const cookies = await page.context().cookies("http://localhost:8000");
  const xsrf = cookies.find((cookie) => cookie.name === "XSRF-TOKEN")?.value;
  return page.request.fetch(`${API}${path}`, {
    method,
    data,
    headers: {
      Accept: "application/json",
      Origin: "http://localhost:3000",
      Referer: "http://localhost:3000/",
      ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
    },
  });
}

/** Accepts the next window.confirm. */
function acceptConfirm(page: Page) {
  page.once("dialog", (dialog) => void dialog.accept());
}

test("fleet: add, edit, log a reading (fleet manager)", async ({ page }) => {
  const done = await as(page, "fleetManager", "fleet");
  const plate = `E2E ${stamp().slice(-4)}`;
  await page.goto("/vehicles");
  await page.getByRole("button", { name: "New vehicle" }).click();
  await page.locator("#veh-plate").fill(plate);
  await page.locator("#veh-make").fill("Toyota");
  await page.locator("#veh-model").fill("Hiace Commuter");
  await page.locator("#veh-year").fill("2024");
  await page.locator("#veh-odometer").fill("12000");
  await page.locator("#veh-vin").fill(`E2E${stamp()}`.padEnd(17, "0").slice(0, 17));
  await page.locator("#veh-assigned").fill("Parity Driver");
  await page.locator("#veh-department").fill("Logistics");
  await page.locator("#veh-location").fill("Makati Depot");
  await page.getByRole("dialog").getByRole("button", { name: "Add vehicle" }).click();
  await page.waitForURL(/\/vehicles\/[0-9a-z]{26}/);
  await expect(page.getByRole("dialog", { name: "Vehicle added" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(plate).first()).toBeVisible();

  await page.getByRole("tab", { name: "Vehicle details" }).click();
  await page.getByRole("button", { name: "Edit vehicle" }).click();
  await page.locator("#veh-department").fill("E2E Department");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("E2E Department").first()).toBeVisible();

  await page.getByRole("button", { name: "Log odometer" }).click();
  await page.locator("#odometer").fill("12040");
  await page.getByRole("button", { name: "Save reading" }).click();
  // A jump against an unknown rate may need confirming; the API says which.
  const confirm = page.getByText("This reading is correct.");
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
    await page.getByRole("button", { name: "Save reading" }).click();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/^12,040\s*km$/).first()).toBeVisible();
  done();
});

test("documents: upload, download, delete (fleet manager)", async ({ page }) => {
  const done = await as(page, "fleetManager", "documents");
  const name = `e2e-parity-${stamp()}.pdf`;
  await page.goto("/documents");
  await page.getByRole("button", { name: "Upload document" }).first().click();
  await page.locator("#doc-file").setInputFiles({ name, mimeType: "application/pdf", buffer: tinyPdf() });
  await page.getByRole("button", { name: "File document" }).click();
  await expect(page.getByText(name).first()).toBeVisible();

  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: `Download ${name}` }).click();
  await (await popup).close();

  acceptConfirm(page);
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByText(name)).toHaveCount(0);
  done();
});

test("alerts: mark read, dismiss, restore (fleet manager)", async ({ page }) => {
  const done = await as(page, "fleetManager", "alerts");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /^Alerts:/ }).click();
  const dismiss = page.getByRole("button", { name: /^Dismiss: / }).first();
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await page.getByRole("button", { name: /^Restore \d+ dismissed/ }).click();
  // The restored alert is back (unread) once the list has refetched.
  await expect(page.getByRole("button", { name: /^Restore \d+ dismissed/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("button", { name: "Alerts: none unread" })).toBeVisible();
  done();
});

test("schedule: auto-schedule preview and commit (fleet manager)", async ({ page }) => {
  const done = await as(page, "fleetManager", "auto-schedule");
  // The demo seed covers every overdue item with a live order, which leaves
  // nothing to propose. Uncover one: cancel an overdue vehicle's open orders.
  const overdue = (await (await apiAs(page, "GET", "/vehicles?pms=overdue&per_page=1")).json()) as { data: { id: string }[] };
  const vehicleId = overdue.data[0]?.id;
  expect(vehicleId, "an overdue vehicle in the seed").toBeTruthy();
  const open = (await (await apiAs(page, "GET", `/work-orders?vehicle_id=${vehicleId}&stage=active&per_page=100`)).json()) as {
    data: { id: string }[];
  };
  for (const order of open.data) {
    await apiAs(page, "POST", `/work-orders/${order.id}/cancel`, { reason: "Parity sweep: uncover an overdue item." });
  }

  await page.goto("/schedule");
  await page.getByRole("button", { name: "Auto-schedule overdue" }).click();
  const raise = page.getByRole("button", { name: /^Raise \d+ work orders?$/ });
  await expect(raise).toBeVisible();
  await raise.click();
  // The result: drafts raised by the API, then each sent for approval.
  await expect(page.getByText(/^\d+ work orders? raised$/)).toBeVisible();
  done();
});

test("purchasing: forecast → purchase request → sent → received, exports (fleet manager)", async ({ page }) => {
  const done = await as(page, "fleetManager", "purchasing");
  await page.goto("/demand-forecast");
  const all = page.getByLabel("Select all parts with a shortfall");
  // The forecast is computed per request; give it time.
  await expect(all.or(page.getByText("Nothing projected"))).toBeVisible({ timeout: 60_000 });
  if ((await all.isVisible()) && (await all.isEnabled())) {
    await all.check();
    await page.getByRole("button", { name: "Generate purchase request" }).first().click();
    await expect(page.getByText("Purchase request generated")).toBeVisible();
  }

  await page.goto("/purchase-orders");
  // A draft this fleet manager may issue (within their band): send, then receive.
  const sendable = page
    .locator("tr", { has: page.getByRole("button", { name: "Mark as sent" }) })
    .filter({ hasNot: page.locator("[aria-disabled=true]") })
    .first();
  await expect(sendable).toBeVisible();
  const reference = (await sendable.getByRole("button", { name: /^PO-\d{4}-\d{4}$/ }).textContent())?.trim() ?? "";
  await sendable.getByRole("button", { name: "Mark as sent" }).click();
  const row = page.locator("tr", { has: page.getByRole("button", { name: reference, exact: true }) });
  await row.getByRole("button", { name: "Mark as received" }).click();
  await expect(row.getByRole("button", { name: /Mark as/ })).toHaveCount(0);

  // Detail, and one order to Excel from it.
  await row.getByRole("button", { name: reference, exact: true }).click();
  await expect(page.getByRole("dialog", { name: reference })).toBeVisible();
  await page.getByRole("button", { name: "Print / export" }).click();
  const one = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export to Excel" }).click();
  expect((await one).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all to Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  done();
});

test("work orders: cancel from the list (service advisor)", async ({ page }) => {
  const done = await as(page, "serviceAdvisor", "cancel");
  // A throwaway draft to cancel.
  await page.goto("/work-orders");
  await page.getByRole("button", { name: "New work order" }).click();
  await choose(page, "#wo-vehicle", /^NCT 9034/);
  await choose(page, "#wo-type", "Corrective repair");
  const title = `E2E cancel me ${stamp()}`;
  await page.locator("#wo-title").fill(title);
  await page.getByLabel("Line description").first().fill("Inspect rattle");
  await page.getByLabel("Part unit rate").first().fill("100");
  await page.getByRole("button", { name: "Create work order" }).click();
  await page.getByRole("button", { name: "View work order" }).click();
  await page.waitForURL(/\/work-orders\/[0-9a-z]{26}$/);
  const reference = (await page.locator("h1 .tabular").first().textContent())?.trim() ?? "";

  await page.goto("/work-orders");
  await page.getByRole("textbox", { name: "Search work orders" }).fill(title);
  await page.getByRole("button", { name: `Actions for ${reference}` }).click();
  await page.getByRole("menuitem", { name: "Cancel work order" }).click();
  await page.locator("#cancel-reason").fill("Raised by the parity sweep.");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel work order" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  done();
});

test("check-in: walk-in, raise (service advisor); close, check-out (technician)", async ({ page, browser }) => {
  const done = await as(page, "serviceAdvisor", "check-in");
  await page.goto("/shop/check-in");

  // Walk-in: a plate nobody has.
  const plate = `WLK ${stamp().slice(-4)}`;
  await page.getByLabel("Search for a vehicle").fill(plate);
  await page.getByRole("button", { name: "Register a walk-in" }).click();
  await page.locator("#walkin-first").fill("Juan");
  await page.locator("#walkin-last").fill("Dela Cruz");
  await page.locator("#walkin-make").fill("Honda");
  await page.locator("#walkin-model").fill("City");
  await page.locator("#walkin-odo").fill("30500");
  await page.getByText("The customer agreed, in person").click();
  await page.getByRole("button", { name: "Register and continue" }).click();
  await expect(page.getByRole("button", { name: "Change" })).toBeVisible();
  await expect(page.getByText(plate).first()).toBeVisible();

  // Raise one offered job (the walk-in's reading was just taken).
  const offered = page.locator('section:has-text("3 · Work to offer") input[type="checkbox"]');
  await offered.first().check();
  await page.locator("#checkin-odo").fill("30500");
  await page.getByRole("button", { name: /^Raise 1 work order$/ }).click();
  const confirm = page.getByText("This reading is correct.");
  const checkedIn = page.getByText(`${plate} checked in`);
  await expect(confirm.or(checkedIn)).toBeVisible();
  if (await confirm.isVisible()) {
    await confirm.click();
    await page.getByRole("button", { name: /^Raise 1 work order$/ }).click();
  }
  await expect(checkedIn).toBeVisible();
  await expect(page.getByText(/1 auto-approved and booked/)).toBeVisible();

  // The bay technician starts and closes it…
  const raised = (await (await apiAs(page, "GET", `/work-orders?q=${encodeURIComponent(plate)}&per_page=1`)).json()) as {
    data: { id: string; status: string }[];
  };
  expect(raised.data[0]?.status, "the walk-in's job is booked").toBe("scheduled");
  const technician = await pageAs(browser, "technician");
  await technician.goto(`/work-orders/${raised.data[0].id}`);
  await technician.getByRole("button", { name: "Start job" }).click();
  await technician.getByRole("button", { name: /Close & record service/ }).click();
  await technician.getByRole("button", { name: "Use last recorded" }).click();
  await technician.getByRole("button", { name: "Close work order" }).click();
  // The dialog hides the page from role queries while open; wait it out.
  await expect(technician.getByRole("dialog")).toHaveCount(0);
  await expect(technician.getByText(/Ready for billing|Closed/).first()).toBeVisible();

  // …and releases the vehicle at check-out (release is `workorder:complete`,
  // which the advisor does not hold — their control is a denied one).
  await page.goto("/shop/check-in?tab=check-out");
  const advisorCard = page.locator("section", { has: page.getByRole("heading", { name: plate }) });
  await expect(advisorCard.locator("[aria-disabled=true]", { has: page.getByRole("button", { name: "Mark collected" }) })).toBeVisible();

  await technician.goto("/shop/check-in?tab=check-out");
  const card = technician.locator("section", { has: technician.getByRole("heading", { name: plate }) });
  await expect(card.getByText("All work closed. Ready to release.")).toBeVisible();
  await card.getByRole("button", { name: "Mark collected" }).click();
  await expect(technician.getByText(/released and stamped/)).toBeVisible();
  done();
});

test("shop roster: technicians and vendors add, edit, remove (provider admin)", async ({ page }) => {
  const done = await as(page, "providerAdmin", "roster");
  const tech = `E2E Tech ${stamp()}`;
  await page.goto("/shop/technicians");
  await page.getByRole("button", { name: "Add technician" }).first().click();
  await page.locator("#tech-name").fill(tech);
  await choose(page, "#tech-bay", /.+/);
  await page.getByRole("dialog").getByRole("button", { name: "Add technician" }).click();
  await expect(page.getByText(tech).first()).toBeVisible();
  await page.getByRole("button", { name: `Edit ${tech}` }).click();
  await page.locator("#tech-name").fill(`${tech} II`);
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${tech} II`).first()).toBeVisible();
  acceptConfirm(page);
  await page.getByRole("button", { name: `Remove ${tech} II` }).click();
  await expect(page.getByText(`${tech} II`)).toHaveCount(0);

  const vendor = `E2E Vendor ${stamp()}`;
  await page.goto("/shop/vendors");
  await page.getByRole("button", { name: "Add vendor" }).first().click();
  await page.locator("#vendor-name").fill(vendor);
  await page.getByRole("dialog").getByRole("button", { name: "Add vendor" }).click();
  await expect(page.getByText(vendor).first()).toBeVisible();
  await page.getByRole("button", { name: `Edit ${vendor}` }).click();
  await page.locator("#vendor-name").fill(`${vendor} II`);
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${vendor} II`).first()).toBeVisible();
  acceptConfirm(page);
  await page.getByRole("button", { name: `Remove ${vendor} II` }).click();
  await expect(page.getByText(`${vendor} II`)).toHaveCount(0);
  done();
});

test("catalogue: add, edit, delete a service item (provider admin)", async ({ page }) => {
  const done = await as(page, "providerAdmin", "catalogue");
  const name = `E2E check ${stamp()}`;
  await page.goto("/service-catalogue");
  await page.getByRole("button", { name: "Add service item" }).first().click();
  await page.locator("#task-name").fill(name);
  await page.locator("#task-km").fill("10000");
  await page.locator("#task-months").fill("6");
  await page.locator("#task-cost").fill("1200");
  await page.locator("#task-hours").fill("1");
  await page.getByRole("dialog").getByRole("button", { name: "Add service item" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  await page.locator("#task-months").fill("12");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  acceptConfirm(page);
  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(page.getByText(name)).toHaveCount(0);
  done();
});

test("clients: onboard and edit (provider admin)", async ({ page }) => {
  const done = await as(page, "providerAdmin", "clients");
  const name = `E2E Couriers ${stamp()}`;
  await page.goto("/shop/clients");
  await page.getByRole("button", { name: "Onboard a client" }).first().click();
  await page.locator("#client-name").fill(name);
  await page.locator("#client-contact").fill("Ana Reyes");
  await page.locator("#client-email").fill("ana@example.ph");
  await page.getByText("The client agrees to us keeping their service records").click();
  await page.getByRole("dialog").getByRole("button", { name: "Onboard client" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByText(name).first().click();
  await page.waitForURL(/\/shop\/clients\/[0-9a-z]{26}$/);
  await page.getByRole("button", { name: "Edit client" }).click();
  await page.locator("#client-terms").fill("E2E retainer");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("E2E retainer").first()).toBeVisible();
  done();
});

/** Bumps a numeric approval field, saves, then saves the original back. */
async function saveAndRestore(page: Page, field: string) {
  const input = page.locator(field);
  await expect(input).toBeEnabled();
  // The approval card's own Save (the Branding card has one too).
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Approval thresholds" }) });
  const original = await input.inputValue();
  for (const value of [String(Number(original) + 1), original]) {
    await input.fill(value);
    await card.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByText("Saved.")).toBeVisible();
  }
}

test("settings: approval bands and branding (provider admin), client bands (fleet manager)", async ({ browser }) => {
  const admin = await browser.newPage();
  const doneAdmin = await as(admin, "providerAdmin", "settings");
  await admin.goto("/settings");
  await saveAndRestore(admin, "#approval-slaHours");
  // Branding: saved when the draft matches the server again (Save disables).
  const branding = admin.locator("section", { has: admin.getByRole("heading", { name: "Branding" }) });
  const support = admin.locator("#tenant-support-email");
  const original = await support.inputValue();
  for (const value of ["e2e-support@mekanikomore.ph", original]) {
    await support.fill(value);
    await branding.getByRole("button", { name: "Save changes" }).click();
    await expect(branding.getByRole("button", { name: "Save changes" })).toBeDisabled();
  }
  doneAdmin();

  const manager = await browser.newPage();
  const doneManager = await as(manager, "fleetManager", "settings");
  await manager.goto("/settings");
  await saveAndRestore(manager, "#approval-slaHours");
  doneManager();
});

test("access: invite and revoke (provider admin)", async ({ page }) => {
  const done = await as(page, "providerAdmin", "access");
  const email = `e2e.${stamp().toLowerCase()}@example.ph`;
  await page.goto("/access");
  await page.getByRole("button", { name: "Invite user" }).first().click();
  await page.locator("#new-user-first-name").fill("Parity");
  await page.locator("#new-user-last-name").fill("Sweep");
  await page.locator("#new-user-email").fill(email);
  await choose(page, "#new-user-role", "Service Advisor");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("dialog").getByText(email)).toBeVisible();
  await page.keyboard.press("Escape");
  const row = page.locator("li", { hasText: email });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toHaveCount(0);
  done();
});

test("profile: edit names, change and restore the password (viewer)", async ({ page }) => {
  const done = await as(page, "viewer", "profile");
  await page.goto("/profile");
  const lastName = page.locator("#profile-last-name");
  const original = await lastName.inputValue();
  for (const value of [`${original}-E2E`, original]) {
    await lastName.fill(value);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog", { name: "Profile updated" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
  }

  for (const [current, next] of [
    ["demo1234", "demo12345"],
    ["demo12345", "demo1234"],
  ]) {
    await page.locator("#current-password").fill(current);
    await page.locator("#new-password").fill(next);
    await page.locator("#confirm-password").fill(next);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("dialog", { name: "Password changed" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
  }
  done();
});

test("shell: branch switcher, sign out, forgot password (provider admin)", async ({ page }) => {
  const done = await as(page, "providerAdmin", "shell");
  await page.goto("/shop");
  await page.getByRole("combobox", { name: "Branch" }).click();
  await page.getByRole("option").nth(1).click();
  await expect(page.getByRole("heading", { name: "Shop today" })).toBeVisible();
  await page.getByRole("combobox", { name: "Branch" }).click();
  await page.getByRole("option").first().click();
  // Let the refetch for that branch land: a request still in flight when the
  // session ends comes back 401, which is expected but not what this checks.
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".skeleton")).toHaveCount(0);

  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);

  await page.locator("#email").fill("owner@mekanikomore.ph");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  done();
});

test("viewer: actions render as denied controls", async ({ browser }) => {
  // The viewer sees work orders but every action is a denied control.
  const viewer = await pageAs(browser, "viewer");
  await viewer.goto("/work-orders");
  // Dimmed with a reason, never hidden (DeniedAction).
  const denied = viewer.locator("[aria-disabled=true]", { has: viewer.getByRole("button", { name: "New work order" }) });
  await expect(denied).toBeVisible();
});
