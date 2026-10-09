import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

/**
 * Records every API call a page makes — method, endpoint (ids replaced by
 * `{id}`), status — tagged with the role and the screen that made it. The
 * parity sweep turns this log into evidence per row of
 * ../torquelane-api/docs/frontend-parity.md.
 */
export interface ApiCall {
  role: string;
  screen: string;
  method: string;
  endpoint: string;
  query: string;
  status: number;
  /** Epoch ms, for pacing under the API's per-user rate limit. */
  at: number;
}

// Outside test-results/, which Playwright empties at the start of every run.
const LOG = path.join("parity-log", "parity-calls.jsonl");
const ID = /^[0-9a-z]{26}$/;

export function normaliseEndpoint(url: URL): string {
  return url.pathname
    .replace(/^\/api\/v1/, "")
    .split("/")
    .map((segment) => (ID.test(segment) ? "{id}" : segment))
    .join("/");
}

const recorded = new WeakSet<Page>();

/** Records a page once; a second call (e.g. from signIn) is a no-op. */
export function ensureRecorded(page: Page, role: string, screen: () => string): void {
  if (!recorded.has(page)) recordApiCalls(page, role, screen);
}

/**
 * Waits until fewer than `budget` of these calls fall in the trailing minute.
 * The API allows 120 requests a minute per user; a production build can sweep
 * screens faster than that, and a 429 is the limiter working, not a defect.
 */
export async function paceCalls(page: Page, calls: ApiCall[], budget = 90): Promise<void> {
  for (;;) {
    const windowStart = Date.now() - 60_000;
    const recent = calls.filter((call) => call.at > windowStart);
    if (recent.length < budget) return;
    await page.waitForTimeout(recent[0].at - windowStart + 500);
  }
}

export function recordApiCalls(page: Page, role: string, screen: () => string): ApiCall[] {
  recorded.add(page);
  const calls: ApiCall[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/v1/")) return;
    const call: ApiCall = {
      role,
      screen: screen(),
      method: response.request().method(),
      endpoint: normaliseEndpoint(url),
      query: url.search,
      status: response.status(),
      at: Date.now(),
    };
    if (call.method === "OPTIONS") return;
    calls.push(call);
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify(call) + "\n");
  });
  return calls;
}
