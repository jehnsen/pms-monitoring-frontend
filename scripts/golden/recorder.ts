import { format, isValid } from "date-fns";
import { expect } from "vitest";
import { getCurrentSuite } from "vitest/suite";

/**
 * Records calls into the domain modules as language-neutral golden cases.
 *
 * Every exported function of a recorded module is wrapped. A call is recorded
 * only when it is *top-level* — made by a test or a sweep, not by another
 * domain function on the way (evaluateVehicle calling computeIntervalStatus is
 * the port's business, not a separate case). Inputs are encoded *before* the
 * call so nothing the function does can change what was recorded.
 *
 * The JSON encoding is documented in fixtures/golden/README.md; keep the two
 * in step.
 */

export interface GoldenCase {
  case: string;
  fn: string;
  input: unknown;
  output: unknown;
}

interface PendingCase extends GoldenCase {
  module: string;
  /** The test (or, at collection time, the describe block) that made the call. */
  test: string;
  /** Made while a describe block was being collected, before any test ran. */
  collected: boolean;
  /** Collection-time calls are encoded at write time, once the reference index exists. */
  raw?: { args: unknown[]; result: unknown; threw: string | null };
}

interface CollectorLike {
  name: string;
  tasks: unknown[];
}

type AnyFn = (...args: unknown[]) => unknown;

/* ------------------------------------------------------------------ money */

/** Fields that hold pesos wherever they appear. */
const MONEY_KEYS = new Set([
  "amountAtTime",
  "autoApproveUnder",
  "defaultLabourRate",
  "estimatedCost",
  "grandTotal",
  "labourCost",
  "labourRate",
  "labourTotal",
  "laborCost",
  "margin",
  "miscFeeFlat",
  "miscTotal",
  "monthlyBudget",
  "opsApprovalUnder",
  "outstanding",
  "ownStockValue",
  "partCost",
  "partsCost",
  "partsTotal",
  "spendThisPeriod",
  "subTotal",
  "supplierProvidedValue",
  "taxTotal",
  "totalValue",
  "unitCost",
  "unitPartRate",
]);

/** Keys that are money only in a particular function's values (elsewhere they are counts or hours). */
const MONEY_KEYS_BY_FN: Record<string, string[]> = {
  monthlyCosts: ["parts", "labor", "total"],
  rollingSpend: ["current", "previous"],
  revenueByClient: ["value"],
  revenueByServiceItem: ["value"],
  spendByVehicle: ["value"],
  spendByCategory: ["value"],
};

/** Positional arguments that are bare peso amounts. */
const MONEY_ARGS_BY_FN: Record<string, number[]> = {
  requiredApprover: [0],
  canApprove: [1],
  varianceExceeds: [0, 1],
  totalsFromSubtotal: [0, 1],
  roundMoney: [0],
};

/** Functions whose return value is a bare peso amount. */
const MONEY_RESULT_FNS = new Set([
  "approvedGrandTotal",
  "approvedValue",
  "authorisedValue",
  "declinedValue",
  "lineAmount",
  "lineCost",
  "lineLabourAmount",
  "linePartAmount",
  "pendingValue",
  "resolvePartsCost",
  "revenueBetween",
  "roundMoney",
  "sumLinesByStatus",
  "workOrderCost",
]);

function money(value: number) {
  const cents = Math.round(value * 100);
  // A value that isn't a whole number of centavos (a margin, a 3-decimal rate)
  // says so, rather than letting the PHP side assume `cents` is exact.
  return Math.abs(value * 100 - cents) > 1e-6
    ? { $money: value, cents, subCentavo: true }
    : { $money: value, cents };
}

/* ------------------------------------------------------------- references */

export interface RefIndex {
  /** Seed-document nodes by identity → path inside fixtures/seed/demo-seed.json. */
  seedByIdentity: WeakMap<object, string>;
  /** Seed entities/collections by their JSON text → path (catches equal copies). */
  seedByJson: Map<string, string>;
  /** Whole-fleet health nodes → "$health" path. */
  healthByIdentity: WeakMap<object, string>;
  healthByJson: Map<string, string>;
}

function segmentFor(parent: unknown[], index: number): string {
  const item = parent[index] as { id?: unknown } | null;
  return item && typeof item === "object" && typeof item.id === "string" ? item.id : String(index);
}

/**
 * Indexes every object/array node under `root`. Identity matches are taken for
 * any node; JSON-equality matches only for arrays and id-bearing objects, so a
 * synthetic two-field object that happens to equal some seed fragment is never
 * mistaken for it.
 */
function indexTree(
  root: unknown,
  base: string,
  byIdentity: WeakMap<object, string>,
  byJson: Map<string, string>
) {
  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    if (byIdentity.has(node)) return;
    byIdentity.set(node, path);

    const isEntity = !Array.isArray(node) && typeof (node as { id?: unknown }).id === "string";
    if ((Array.isArray(node) && node.length > 0) || isEntity || path === base) {
      const json = JSON.stringify(node);
      if (!byJson.has(json)) byJson.set(json, path);
    }

    const join = (segment: string) => (path ? `${path}/${segment}` : segment);
    if (Array.isArray(node)) node.forEach((item, i) => visit(item, join(segmentFor(node, i))));
    else for (const [key, value] of Object.entries(node)) visit(value, join(key));
  };
  visit(root, base);
}

export function buildRefIndex(
  seedDocument: object,
  fleetHealth: { vehicle: { id: string } }[]
): RefIndex {
  const index: RefIndex = {
    seedByIdentity: new WeakMap(),
    seedByJson: new Map(),
    healthByIdentity: new WeakMap(),
    healthByJson: new Map(),
  };
  // Health first: its entries embed seed vehicles, which must still resolve
  // to $seed when met on their own, so they are indexed separately below.
  index.healthByIdentity.set(fleetHealth, "*");
  index.healthByJson.set(JSON.stringify(fleetHealth), "*");
  for (const entry of fleetHealth) {
    const tmpIdentity = new WeakMap<object, string>();
    indexTree(entry, entry.vehicle.id, tmpIdentity, index.healthByJson);
    // Copy identity entries for the health subtree, except the seed objects it
    // embeds (vehicle, task) — those are better named by their seed path.
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const path = tmpIdentity.get(node);
      if (path && !path.endsWith("/vehicle") && !/\/task$/.test(path)) index.healthByIdentity.set(node, path);
      if (Array.isArray(node)) node.forEach(walk);
      else Object.values(node).forEach(walk);
    };
    walk(entry);
  }
  indexTree(seedDocument, "", index.seedByIdentity, index.seedByJson);
  return index;
}

/* --------------------------------------------------------------- encoding */

interface EncodeOptions {
  fn: string;
  index: RefIndex | null;
  /** False while encoding the case that *defines* fleet health. */
  healthRefs: boolean;
}

function lookupRef(value: object, opts: EncodeOptions): Record<string, string> | null {
  const index = opts.index;
  if (!index) return null;

  const seedPath = index.seedByIdentity.get(value);
  if (seedPath !== undefined) return { $seed: seedPath };
  if (opts.healthRefs) {
    const healthPath = index.healthByIdentity.get(value);
    if (healthPath !== undefined) return { $health: healthPath };
  }

  const comparable =
    (Array.isArray(value) && value.length > 0) ||
    (!Array.isArray(value) && typeof (value as { id?: unknown }).id === "string") ||
    (!Array.isArray(value) && "vehicle" in value && "items" in value);
  if (!comparable) return null;

  const json = JSON.stringify(value);
  const bySeed = index.seedByJson.get(json);
  if (bySeed !== undefined) return { $seed: bySeed };
  if (opts.healthRefs) {
    const byHealth = index.healthByJson.get(json);
    if (byHealth !== undefined) return { $health: byHealth };
  }
  return null;
}

function formatDate(date: Date): string {
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx") : "Invalid Date";
}

export function encode(value: unknown, opts: EncodeOptions, key?: string | number): unknown {
  if (value === undefined) return { $undefined: true };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { $number: String(value) };
    const moneyKeys = MONEY_KEYS_BY_FN[opts.fn] ?? [];
    if (typeof key === "string" && (MONEY_KEYS.has(key) || moneyKeys.includes(key))) return money(value);
    return value;
  }

  if (typeof value === "function") return { $function: value.name || "anonymous" };
  if (typeof value !== "object") return { $unsupported: typeof value };

  if (value instanceof Date) return { $date: formatDate(value) };

  const ref = lookupRef(value, opts);
  if (ref) return ref;

  if (value instanceof Map) {
    return { $map: [...value.entries()].map(([k, v]) => [encode(k, opts), encode(v, opts)]) };
  }
  if (value instanceof Set) return { $set: [...value].map((v) => encode(v, opts)) };
  if (Array.isArray(value)) return value.map((item) => encode(item, opts));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    // Absent and undefined are the same thing to a JSON consumer.
    if (v === undefined) continue;
    out[k] = encode(v, opts, k);
  }
  return out;
}

function encodeArgs(fn: string, args: unknown[], opts: EncodeOptions) {
  const moneyArgs = MONEY_ARGS_BY_FN[fn] ?? [];
  return args.map((arg, i) =>
    typeof arg === "number" && Number.isFinite(arg) && moneyArgs.includes(i) ? money(arg) : encode(arg, opts)
  );
}

function encodeResult(fn: string, result: unknown, opts: EncodeOptions) {
  if (typeof result === "number" && Number.isFinite(result) && MONEY_RESULT_FNS.has(fn)) return money(result);
  return encode(result, opts);
}

/* --------------------------------------------------------------- recorder */

export class Recorder {
  private depth = 0;
  private cases: PendingCase[] = [];
  private originals = new Map<string, AnyFn>();
  private nextLabel: string | null = null;
  private healthDefinition = false;
  index: RefIndex | null = null;
  readonly testsSeen: string[] = [];
  private roots = new Map<CollectorLike, string>();

  /** A top-level describe whose nested blocks' calls should be attributed by path. */
  registerRoot(collector: unknown, name: string) {
    this.roots.set(collector as CollectorLike, name);
  }

  /** The full "a > b > c" path of the describe block being collected right now, if any. */
  private collectingPath(): string | null {
    const current = getCurrentSuite() as unknown as CollectorLike | undefined;
    if (!current) return null;
    const find = (node: CollectorLike, path: string): string | null => {
      if (node === current) return path;
      for (const child of node.tasks) {
        const c = child as Partial<CollectorLike> & { type?: string };
        if (c && c.type === "collector" && Array.isArray(c.tasks)) {
          const hit = find(c as CollectorLike, `${path} > ${c.name}`);
          if (hit) return hit;
        }
      }
      return null;
    };
    for (const [root, name] of this.roots) {
      const hit = find(root, name);
      if (hit) return hit;
    }
    return null;
  }

  /** Replaces a module's exported functions with recording wrappers. */
  wrap<T extends Record<string, unknown>>(module: string, exports: T): T {
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function" || /^use[A-Z]/.test(name)) {
        out[name] = value;
        continue;
      }
      const original = value as AnyFn;
      this.originals.set(`${module}.${name}`, original);
      out[name] = (...args: unknown[]) => this.call(module, name, original, args);
    }
    return out as T;
  }

  /** Wraps a module so calls *inside* it are never recorded (the seed generator). */
  shield<T extends Record<string, unknown>>(exports: T): T {
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function") {
        out[name] = value;
        continue;
      }
      const original = value as AnyFn;
      out[name] = (...args: unknown[]) => {
        this.depth++;
        try {
          return original(...args);
        } finally {
          this.depth--;
        }
      };
    }
    return out as T;
  }

  /** The unwrapped function, for building fixtures without recording them. */
  original<F extends (...args: never[]) => unknown>(module: string, name: string): F {
    const fn = this.originals.get(`${module}.${name}`);
    if (!fn) throw new Error(`No recorded module function ${module}.${name}`);
    return fn as unknown as F;
  }

  /** Names the next recorded call (sweeps), instead of the current test's name. */
  as<T>(label: string, run: () => T): T {
    this.nextLabel = label;
    try {
      return run();
    } finally {
      this.nextLabel = null;
    }
  }

  /** The next recorded call defines fleet health, so its output must not refer to itself. */
  definingHealth<T>(run: () => T): T {
    this.healthDefinition = true;
    try {
      return run();
    } finally {
      this.healthDefinition = false;
    }
  }

  /**
   * Records a composite rule that no single domain function owns — e.g.
   * "may this role drive this transition", which is checkTransition plus
   * rbac.can(). `fn` starts with "$" so the port knows it is a composition.
   */
  compose(module: string, fn: string, label: string, args: unknown[], run: () => unknown) {
    const opts: EncodeOptions = { fn, index: this.index, healthRefs: true };
    const input = encodeArgs(fn, args, opts);
    this.depth++;
    let result: unknown;
    try {
      result = run();
    } finally {
      this.depth--;
    }
    const test = expect.getState().currentTestName ?? label;
    this.push(module, fn, test, label, input, encodeResult(fn, result, opts));
  }

  private call(module: string, name: string, fn: AnyFn, args: unknown[]) {
    const running = expect.getState().currentTestName;
    // Outside a test, a call may still be a describe block computing the
    // value its tests then assert on — that is the case worth recording.
    const collecting = this.depth === 0 && running === undefined ? this.collectingPath() : null;
    if (collecting !== null) return this.callDuringCollection(module, name, fn, args, collecting);

    const test = running;
    const record = this.depth === 0 && test !== undefined;
    const opts: EncodeOptions = { fn: name, index: this.index, healthRefs: !this.healthDefinition };
    const input = record ? encodeArgs(name, args, opts) : null;
    const label = this.nextLabel;
    this.nextLabel = null;

    this.depth++;
    let result: unknown;
    try {
      result = fn(...args);
    } catch (error) {
      if (record) {
        this.push(module, name, test, label, input, { $throws: (error as Error).message });
      }
      throw error;
    } finally {
      this.depth--;
    }

    if (record) this.push(module, name, test, label, input, encodeResult(name, result, opts));
    return result;
  }

  private callDuringCollection(module: string, name: string, fn: AnyFn, args: unknown[], path: string) {
    this.depth++;
    try {
      const result = fn(...args);
      this.cases.push({ module, test: path, case: path, fn: name, input: null, output: null, collected: true, raw: { args, result, threw: null } });
      return result;
    } catch (error) {
      this.cases.push({ module, test: path, case: path, fn: name, input: null, output: null, collected: true, raw: { args, result: undefined, threw: (error as Error).message } });
      throw error;
    } finally {
      this.depth--;
    }
  }

  private push(module: string, fn: string, test: string, label: string | null, input: unknown, output: unknown) {
    this.cases.push({ module, test, case: label ?? test, fn, input, output, collected: false });
  }

  noteTest(name: string | undefined) {
    if (name) this.testsSeen.push(name);
  }

  /**
   * Cases grouped by module, in recording order. Several unlabelled calls from
   * one test are numbered "[i/n]" so every case name is unique and stable.
   */
  casesByModule(): Map<string, GoldenCase[]> {
    const perTest = new Map<string, number>();
    for (const c of this.cases) if (c.case === c.test) perTest.set(c.test, (perTest.get(c.test) ?? 0) + 1);

    const seen = new Map<string, number>();
    const byModule = new Map<string, GoldenCase[]>();
    for (const c of this.cases) {
      let name = c.case;
      if (c.case === c.test && (perTest.get(c.test) ?? 0) > 1) {
        const i = (seen.get(c.test) ?? 0) + 1;
        seen.set(c.test, i);
        name = `${c.test} [${i}/${perTest.get(c.test)}]`;
      }
      if (c.collected) name = `${name} (computed at describe scope, asserted by its tests)`;
      let { input, output } = c;
      if (c.raw) {
        const opts: EncodeOptions = { fn: c.fn, index: this.index, healthRefs: true };
        input = encodeArgs(c.fn, c.raw.args, opts);
        output = c.raw.threw !== null ? { $throws: c.raw.threw } : encodeResult(c.fn, c.raw.result, opts);
      }
      const list = byModule.get(c.module) ?? [];
      list.push({ case: name, fn: c.fn, input, output });
      byModule.set(c.module, list);
    }
    return byModule;
  }

  /** Whether a test made a recorded call, or its enclosing describe did at collection time. */
  isCovered(test: string): boolean {
    return this.cases.some((c) => (c.collected ? test.startsWith(`${c.test} > `) : c.test === test));
  }

  encodeConstant(fn: string, value: unknown) {
    return encode(value, { fn, index: this.index, healthRefs: true });
  }
}
