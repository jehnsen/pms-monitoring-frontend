import { PlanError } from "@/lib/work-order-plans";

/**
 * What every command returns. Typed so the store can branch on `code`, and
 * shaped so nothing from Postgres — a constraint name, a column, a policy —
 * ever reaches the browser. Types-only for the browser; no "server-only" here
 * because `lib/store.ts` imports these types.
 */
export type CommandErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "out_of_scope"
  | "invalid_transition"
  | "validation"
  | "conflict";

export type CommandFailure = { ok: false; code: CommandErrorCode; message: string };
export type CommandResult<T> = { ok: true; data: T } | CommandFailure;

/** Thrown inside a command to abort its transaction with a typed failure. */
export class CommandError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CommandError";
  }
}

const GENERIC = "That change couldn't be saved — nothing was changed. Try again.";

/**
 * Maps anything a command threw onto a safe failure.
 *
 * Postgres errors are classified by SQLSTATE only; their message is logged
 * server-side and never returned. Anything unrecognised is reported as a
 * `conflict` ("nothing was changed, try again"), which is true — the
 * transaction rolled back — without describing the internals.
 */
export function toFailure(error: unknown, label: string): CommandFailure {
  if (error instanceof CommandError) {
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof PlanError) {
    return { ok: false, code: error.kind, message: error.message };
  }

  const sqlState = (error as { code?: unknown })?.code;
  if (typeof sqlState === "string" && /^[0-9A-Z]{5}$/.test(sqlState)) {
    console.error(`[command:${label}] postgres ${sqlState}: ${(error as Error).message}`);
    switch (sqlState) {
      case "23505": // unique_violation — e.g. two orders racing for one number
      case "40001": // serialization_failure
      case "40P01": // deadlock_detected
      case "55P03": // lock_not_available
        return {
          ok: false,
          code: "conflict",
          message: "Someone else changed this at the same time. Reload and try again.",
        };
      case "42501": // insufficient_privilege, incl. RLS WITH CHECK violations
        return { ok: false, code: "out_of_scope", message: "That record isn't yours to change." };
      case "23502": // not_null_violation
      case "23503": // foreign_key_violation
      case "23514": // check_violation
      case "22P02": // invalid_text_representation (bad enum / number)
      case "22007": // invalid_datetime_format
      case "22008": // datetime_field_overflow
        return { ok: false, code: "validation", message: "Some of those details aren't valid." };
      default:
        return { ok: false, code: "conflict", message: GENERIC };
    }
  }

  console.error(`[command:${label}] unexpected failure`, error);
  return { ok: false, code: "conflict", message: GENERIC };
}
