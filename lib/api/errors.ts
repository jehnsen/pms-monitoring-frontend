/**
 * The API's error envelope, typed.
 *
 * Every API error has one shape —
 * `{ error: { code, message, details? } }` — and clients branch on `code`,
 * never on `message` (../api/CLAUDE.md, "API conventions"). `ApiError`
 * carries it, plus the HTTP status and the request id for support.
 */

export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "bad_request"
  | "validation"
  | "invalid_transition"
  | "conflict"
  | "module_disabled"
  | "account_suspended"
  | "rate_limited"
  | "server_error"
  | "network_error";

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: {
      fields?: Record<string, string[]>;
      reason?: string;
      [key: string]: unknown;
    };
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Per-field messages on a 422, keyed by the request field (`lines.0.quantity`). */
  readonly fields: Record<string, string[]>;
  /** A tenant-context refusal's `ScopeDenial` (e.g. `branch_not_allowed`). */
  readonly reason: string | null;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { fields?: Record<string, string[]>; reason?: string | null; requestId?: string | null } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = options.fields ?? {};
    this.reason = options.reason ?? null;
    this.requestId = options.requestId ?? null;
  }

  /** The first message for a field, for inline form errors. */
  field(name: string): string | undefined {
    return this.fields[name]?.[0];
  }

  get isNotFound() {
    return this.code === "not_found";
  }

  get isUnauthenticated() {
    return this.code === "unauthenticated";
  }

  get isModuleDisabled() {
    return this.code === "module_disabled";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * The sentence to show a person for an error. A 404 never confirms that
 * someone else's record exists, so it reads the same as a missing one.
 */
export function describeApiError(error: unknown): string {
  if (!isApiError(error)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }
  switch (error.code) {
    case "not_found":
      return "Not found, or not yours to see.";
    case "unauthenticated":
      return "Your session has ended. Sign in again.";
    case "network_error":
      return "Can't reach the server. Check your connection and try again.";
    case "rate_limited":
      return "Too many requests. Wait a moment and try again.";
    case "server_error":
      return error.requestId
        ? `Something went wrong on our side (ref ${error.requestId}).`
        : "Something went wrong on our side.";
    case "validation": {
      const first = Object.values(error.fields)[0]?.[0];
      return first ?? error.message;
    }
    default:
      return error.message;
  }
}

const KNOWN_CODES: ApiErrorCode[] = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "bad_request",
  "validation",
  "invalid_transition",
  "conflict",
  "module_disabled",
  "account_suspended",
  "rate_limited",
  "server_error",
];

/** An error response → ApiError. Anything not shaped like the envelope is a server error. */
export function toApiError(status: number, body: unknown, requestId: string | null): ApiError {
  const envelope = body as Partial<ApiErrorEnvelope> | null;
  const error = envelope?.error;
  if (error && typeof error.code === "string" && typeof error.message === "string") {
    const code = (KNOWN_CODES as string[]).includes(error.code)
      ? (error.code as ApiErrorCode)
      : status >= 500
        ? "server_error"
        : "bad_request";
    return new ApiError(status, code, error.message, {
      fields: error.details?.fields,
      reason: typeof error.details?.reason === "string" ? error.details.reason : null,
      requestId,
    });
  }
  // Laravel's own CSRF mismatch (419) predates the envelope.
  if (status === 419) {
    return new ApiError(status, "forbidden", "Your session expired. Refresh and try again.", { requestId });
  }
  return new ApiError(
    status,
    status === 401 ? "unauthenticated" : status === 404 ? "not_found" : status >= 500 ? "server_error" : "bad_request",
    `Request failed (${status}).`,
    { requestId }
  );
}
