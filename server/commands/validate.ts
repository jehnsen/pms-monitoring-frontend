import type { PartLine, WorkOrder, WorkOrderLine } from "@/types";
import type { CompletionDetail, DraftPatch, LineDecision, LineIntent } from "@/lib/work-order-plans";
import { CommandError } from "@/server/commands/result";

/**
 * Input parsing at the system boundary.
 *
 * A server action receives whatever JSON the browser chose to send; the
 * TypeScript types on the store's side are a convenience, not a guarantee.
 * Every field a command uses is read through here, by name, so an extra
 * property (a `partCost`, an `id` on a new record, an `approvalStatus`) is not
 * so much rejected as never looked at.
 */

type Obj = Record<string, unknown>;

function fail(message: string): never {
  throw new CommandError("validation", message);
}

export function obj(value: unknown, what = "Request"): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${what} is malformed.`);
  return value as Obj;
}

export function text(o: Obj, key: string, opts: { required?: boolean; max?: number } = {}): string {
  const value = o[key];
  if (value === undefined || value === null) {
    if (opts.required) fail(`${key} is required.`);
    return "";
  }
  if (typeof value !== "string") fail(`${key} must be text.`);
  const trimmed = value.trim();
  if (opts.required && !trimmed) fail(`${key} is required.`);
  if (trimmed.length > (opts.max ?? 2000)) fail(`${key} is too long.`);
  return trimmed;
}

export function optionalText(o: Obj, key: string, max = 2000): string | undefined {
  return o[key] === undefined ? undefined : text(o, key, { max });
}

export function id(o: Obj, key: string): string {
  return text(o, key, { required: true, max: 200 });
}

export function num(
  o: Obj,
  key: string,
  opts: { min?: number; exclusiveMin?: number; required?: boolean; fallback?: number } = {}
): number {
  const value = o[key];
  if (value === undefined || value === null) {
    if (opts.required || opts.fallback === undefined) fail(`${key} is required.`);
    return opts.fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${key} must be a number.`);
  if (opts.min !== undefined && value < opts.min) fail(`${key} can't be below ${opts.min}.`);
  if (opts.exclusiveMin !== undefined && value <= opts.exclusiveMin) {
    fail(`${key} must be more than ${opts.exclusiveMin}.`);
  }
  return value;
}

export function bool(o: Obj, key: string): boolean {
  const value = o[key];
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") fail(`${key} must be true or false.`);
  return value;
}

export function oneOf<T extends string>(o: Obj, key: string, allowed: readonly T[], fallback?: T): T {
  const value = o[key];
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(`${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function list(o: Obj, key: string, max = 200): unknown[] {
  const value = o[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${key} must be a list.`);
  if (value.length > max) fail(`${key} has too many entries.`);
  return value;
}

export function idList(o: Obj, key: string): string[] {
  return [
    ...new Set(
      list(o, key).map((entry) => {
        if (typeof entry !== "string" || !entry.trim()) fail(`${key} must be a list of ids.`);
        return entry.trim();
      })
    ),
  ];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function date(o: Obj, key: string, opts: { required?: boolean } = {}): string {
  const value = text(o, key, { required: opts.required, max: 10 });
  if (value && !DATE.test(value)) fail(`${key} must be a YYYY-MM-DD date.`);
  return value;
}

export function time(o: Obj, key: string): string | null {
  const value = text(o, key, { max: 5 });
  if (!value) return null;
  if (!TIME.test(value)) fail(`${key} must be an HH:mm time.`);
  return value;
}

/* ------------------------------------------------------------ enumerations */

export const WORK_ORDER_TYPES = ["preventive", "corrective", "inspection"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const CATEGORIES = [
  "engine",
  "drivetrain",
  "brakes",
  "tires",
  "electrical",
  "safety",
  "body",
  "other",
] as const satisfies readonly WorkOrderLine["category"][];
export const URGENCIES = ["safety_critical", "recommended", "optional"] as const;
export const PARTS_SOURCES = ["own_stock", "supplier_provided"] as const;
export const DECISIONS = ["approved", "declined", "deferred"] as const;

/* --------------------------------------------------------------- composites */

/** Quantities and rates only. `partCost`/`labourCost` are never read. */
export function lineIntent(value: unknown): LineIntent & { id: string | null } {
  const o = obj(value, "Line");
  return {
    id: o.id === undefined || o.id === null ? null : id(o, "id"),
    description: text(o, "description", { required: true, max: 500 }),
    category: oneOf(o, "category", CATEGORIES, "other"),
    quantity: num(o, "quantity", { exclusiveMin: 0, fallback: 1 }),
    unitPartRate: num(o, "unitPartRate", { min: 0, fallback: 0 }),
    labourHours: num(o, "labourHours", { min: 0, fallback: 0 }),
    labourRate: num(o, "labourRate", { min: 0, fallback: 0 }),
    urgency: oneOf(o, "urgency", URGENCIES, "recommended"),
    partsSource: oneOf(o, "partsSource", PARTS_SOURCES, "supplier_provided"),
    photoUrls: list(o, "photoUrls", 20).map((url) => {
      if (typeof url !== "string") fail("photoUrls must be a list of URLs.");
      return url;
    }),
    serviceTaskId: o.serviceTaskId ? id(o, "serviceTaskId") : null,
  };
}

/** A fitted part. Its id is the server's to assign, so any given one is dropped. */
export function partLine(value: unknown): Omit<PartLine, "id"> {
  const o = obj(value, "Part");
  return {
    partNumber: text(o, "partNumber", { max: 100 }),
    name: text(o, "name", { required: true, max: 300 }),
    quantity: num(o, "quantity", { exclusiveMin: 0, required: true }),
    unitCost: num(o, "unitCost", { min: 0, required: true }),
  };
}

export function lineDecision(value: unknown): LineDecision {
  const o = obj(value, "Decision");
  return {
    lineId: id(o, "lineId"),
    decision: oneOf(o, "decision", DECISIONS),
    note: optionalText(o, "note", 1000) ?? null,
  };
}

export function completionDetail(o: Obj): Omit<CompletionDetail, "parts"> & {
  parts?: Omit<PartLine, "id">[];
} {
  return {
    odometer: o.odometer === undefined ? undefined : Math.round(num(o, "odometer", { min: 0 })),
    findings: optionalText(o, "findings", 5000),
    parts: o.parts === undefined ? undefined : list(o, "parts").map(partLine),
    taskIds: o.taskIds === undefined ? undefined : idList(o, "taskIds"),
  };
}

export function draftPatch(o: Obj): DraftPatch {
  const patch: DraftPatch = {};
  if (o.title !== undefined) patch.title = text(o, "title", { required: true, max: 300 });
  if (o.type !== undefined) patch.type = oneOf(o, "type", WORK_ORDER_TYPES) as WorkOrder["type"];
  if (o.priority !== undefined) {
    patch.priority = oneOf(o, "priority", PRIORITIES) as WorkOrder["priority"];
  }
  if (o.scheduledFor !== undefined) patch.scheduledFor = date(o, "scheduledFor");
  if (o.scheduledTime !== undefined) patch.scheduledTime = time(o, "scheduledTime");
  if (o.bayId !== undefined) patch.bayId = optionalText(o, "bayId", 100) || null;
  if (o.technician !== undefined) patch.technician = text(o, "technician", { max: 200 });
  if (o.vendor !== undefined) patch.vendor = text(o, "vendor", { max: 200 });
  if (o.notes !== undefined) patch.notes = text(o, "notes", { max: 5000 });
  if (o.taskIds !== undefined) patch.taskIds = idList(o, "taskIds");
  if (o.laborCost !== undefined) patch.laborCost = num(o, "laborCost", { min: 0 });
  if (o.partsCost !== undefined) patch.partsCost = num(o, "partsCost", { min: 0 });
  return patch;
}
