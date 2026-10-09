import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as billing from "@/lib/billing";

/**
 * `lib/billing.ts` survives the API cutover only as the new-work-order
 * dialog's live preview (labelled as such; the saved figures are the API's).
 * This replays every case of fixtures/golden/billing.json — the same
 * fixtures the API's own port is proven against — so the preview cannot
 * drift from what the server computes.
 */

type Case = { case: string; fn: string; input: unknown; output: unknown };

const cases: Case[] = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/golden/billing.json"), "utf8"));
const seed = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/seed/demo-seed.json"), "utf8"));

/** The fixture encoding (fixtures/golden/README.md) → plain JS values. */
function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value === null || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if ("$money" in object) return object.$money;
  if ("$undefined" in object) return undefined;
  if ("$number" in object) return Number(object.$number);
  if ("$date" in object) return new Date(String(object.$date));
  if ("$seed" in object) return node(seed, String(object.$seed));
  return Object.fromEntries(Object.entries(object).map(([key, entry]) => [key, decode(entry)]));
}

function node(root: unknown, path: string): unknown {
  return path.split("/").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      return current.find((item) => (item as { id?: string }).id === segment) ?? current[Number(segment)];
    }
    return (current as Record<string, unknown>)[segment];
  }, root);
}

const replayed = cases.filter((c) => !c.fn.startsWith("$"));
const functions = billing as unknown as Record<string, (...args: unknown[]) => unknown>;

describe("billing preview matches fixtures/golden/billing.json", () => {
  it("covers every function in the fixture", () => {
    for (const fn of new Set(replayed.map((c) => c.fn))) {
      expect(typeof functions[fn], fn).toBe("function");
    }
    expect(replayed.length).toBeGreaterThan(1000);
  });

  it("reproduces every case exactly", () => {
    const mismatches: string[] = [];
    for (const c of replayed) {
      const args = decode(c.input) as unknown[];
      const expected = decode(c.output);
      const actual = functions[c.fn](...args);
      try {
        expect(actual).toEqual(expected);
      } catch {
        mismatches.push(c.case);
      }
    }
    expect(mismatches.slice(0, 5), `${mismatches.length} of ${replayed.length} cases differ`).toEqual([]);
  });
});
