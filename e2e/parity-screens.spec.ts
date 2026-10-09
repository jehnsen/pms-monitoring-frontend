import { expect, test, type Page } from "@playwright/test";
import { signIn, type AccountKey } from "./helpers";
import { paceCalls, recordApiCalls } from "./recorder";

/*
 * Parity sweep, screens: every screen in app/(app) as each of the five roles
 * the Phase 5 brief names. A screen passes when it renders its data or its
 * deliberate gate (redirect, module notice, denied control) — never the
 * generic error state, never a 5xx, never an uncaught exception.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const ROLES: AccountKey[] = ["providerAdmin", "serviceAdvisor", "technician", "fleetManager", "viewer"];

const STATIC_SCREENS = [
  "/dashboard",
  "/vehicles",
  "/schedule",
  "/reports",
  "/documents",
  "/requests",
  "/demand-forecast",
  "/purchase-orders",
  "/work-orders",
  "/shop",
  "/shop/check-in",
  "/shop/check-in?tab=check-out",
  "/shop/queue",
  "/shop/clients",
  "/shop/technicians",
  "/shop/vendors",
  "/shop/reports",
  "/service-catalogue",
  "/settings",
  "/access",
  "/profile",
  "/workflow",
];

/** First id from a list endpoint, read with the page's own session cookie. */
async function firstId(page: Page, endpoint: string): Promise<string | null> {
  const response = await page.request.get(`${API}${endpoint}`, {
    headers: { Accept: "application/json", Referer: "http://localhost:3000/" },
  });
  if (!response.ok()) return null;
  const body = (await response.json()) as { data: { id?: string; customer_account_id?: string }[] };
  const row = body.data[0];
  return row?.id ?? row?.customer_account_id ?? null;
}

for (const role of ROLES) {
  test(`every screen renders for ${role}`, async ({ page }) => {
    test.setTimeout(600_000);
    let screen = "/login";
    const calls = recordApiCalls(page, role, () => screen);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(`${screen}: ${error.message}`));

    await signIn(page, role);

    const vehicle = await firstId(page, "/vehicles?per_page=1");
    const order = await firstId(page, "/work-orders?per_page=1");
    const client = await firstId(page, "/shop/clients");
    const screens = [
      ...STATIC_SCREENS,
      ...(vehicle ? [`/vehicles/${vehicle}`] : []),
      ...(order ? [`/work-orders/${order}`] : []),
      ...(client ? [`/shop/clients/${client}`] : []),
    ];

    const outcomes: string[] = [];
    for (const target of screens) {
      await paceCalls(page, calls);
      screen = target;
      await page.goto(target);
      await page.waitForLoadState("networkidle");
      // Skeletons resolve to data or to a deliberate state.
      await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 30_000 });
      // A side guard redirects once /me resolves; let the route settle first.
      await page.waitForTimeout(1500);
      await page.waitForLoadState("networkidle");
      const landed = new URL(page.url()).pathname;
      await expect(page.getByText("Couldn't load this"), `${role} ${target}`).toHaveCount(0);
      outcomes.push(`${target} → ${landed === target.split("?")[0] ? "rendered" : `redirected to ${landed}`}`);
    }

    const serverErrors = calls.filter((call) => call.status >= 500);
    expect(serverErrors, `${role}: 5xx responses`).toEqual([]);
    expect(pageErrors, `${role}: uncaught page errors`).toEqual([]);
    test.info().annotations.push({ type: "outcomes", description: outcomes.join("\n") });
    console.log(`\n[${role}]\n${outcomes.join("\n")}`);
  });
}
