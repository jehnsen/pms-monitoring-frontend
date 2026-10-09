import { expect, test, type Browser, type Page } from "@playwright/test";
import { ensureRecorded } from "./recorder";

/** The API's demo seed (`DemoSeeder::DEMO_USERS`); every password is the same. */
export const DEMO_PASSWORD = "demo1234";

export const ACCOUNTS = {
  providerAdmin: { email: "owner@mekanikomore.ph", name: "Mike Manabat", home: "/shop" },
  serviceAdvisor: { email: "advisor@mekanikomore.ph", name: "Divina Lacson", home: "/shop" },
  technician: { email: "bay@mekanikomore.ph", name: "Arnel Pascual", home: "/shop" },
  cashier: { email: "cashier@mekanikomore.ph", name: "Paolo Reyes", home: "/shop" },
  fleetManager: { email: "donmiguel@mekanikomor.ph", name: "Don Miguel", home: "/dashboard" },
  viewer: { email: "viewer@mekanikomore.ph", name: "Camille Ortega", home: "/dashboard" },
  northwind: { email: "fleet@northwind.ph", name: "Ruben Salcedo", home: "/dashboard" },
  suspended: { email: "yard@bayanicon.ph", name: "Andres Malolos", home: "/login" },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

/*
 * The API throttles sign-in: 5 a minute per email and IP, 20 a minute per IP.
 * One worker runs the whole suite from one IP, so sign-ins are paced to stay
 * under both rather than tripping the limiter mid-run.
 */
const signIns: { email: string; at: number }[] = [];

async function paceSignIn(page: Page, email: string): Promise<void> {
  for (;;) {
    const windowStart = Date.now() - 60_000;
    const recent = signIns.filter((entry) => entry.at > windowStart);
    const mine = recent.filter((entry) => entry.email === email);
    const blocker = mine.length >= 4 ? mine[0] : recent.length >= 16 ? recent[0] : null;
    if (!blocker) break;
    await page.waitForTimeout(blocker.at - windowStart + 500);
  }
  signIns.push({ email, at: Date.now() });
}

/** Signs in through the form, the way a person does, and waits to land. */
export async function signIn(page: Page, account: AccountKey): Promise<void> {
  const { email, home } = ACCOUNTS[account];
  await paceSignIn(page, email);
  // Every signed-in page feeds the parity log (see recorder.ts).
  const title = test.info().title;
  ensureRecorded(page, account, () => `${title} ${new URL(page.url()).pathname}`);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /Sign in to workspace/ }).click();
  await page.waitForURL((url) => url.pathname.startsWith(home), { timeout: 60_000 });
}

/** A fresh, signed-in browser context — one per role in multi-party flows. */
export async function pageAs(browser: Browser, account: AccountKey): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, account);
  return page;
}

/** Picks a Radix Select option by its visible text. */
export async function choose(page: Page, triggerSelector: string, option: string | RegExp): Promise<void> {
  await page.locator(triggerSelector).click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Fails on the generic error states a broken screen falls back to. */
export async function expectNoLoadError(page: Page): Promise<void> {
  await expect(page.getByText("Couldn't load this")).toHaveCount(0);
}

/** A minimal, well-formed one-page PDF — the API sniffs content, not the name. */
export function tinyPdf(): Buffer {
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
