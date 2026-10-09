/**
 * The one way this app talks to the TorqueLane API.
 *
 * - Cookie session (Sanctum SPA): `credentials: "include"`; before the first
 *   state-changing request the CSRF cookie is fetched from
 *   `/sanctum/csrf-cookie`, and its value is echoed in `X-XSRF-TOKEN`.
 * - Every request carries an `X-Request-Id` (the API echoes it in logs and
 *   error bodies) and, for staff, the branch switcher's `X-Branch-Id`.
 * - Errors arrive as the API's envelope and leave as a typed `ApiError`.
 *
 * The base URL is `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`).
 */
import { ApiError, toApiError } from "@/lib/api/errors";
import { selectedBranchHeader } from "@/lib/api/branch";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  /** JSON body (objects) or multipart (FormData). */
  body?: unknown;
  /** For POSTs the API makes idempotent (`Idempotency-Key`). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Override the branch header for one call (`null` = send none). */
  branch?: string | null;
}

function requestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let csrfPromise: Promise<void> | null = null;

/**
 * Sets the XSRF-TOKEN cookie (once; again after a 419 or a sign-out). Callers
 * also wait on a bootstrap already in flight: two requests that leave without
 * a session cookie each start a server session, and the token left in the jar
 * can belong to the other one — a 419 on the next write.
 */
export function ensureCsrfCookie(force = false): Promise<void> {
  if (csrfPromise && !force) return csrfPromise;
  if (!force && readCookie("XSRF-TOKEN")) return Promise.resolve();
  csrfPromise = fetch(`${API_URL}/sanctum/csrf-cookie`, { credentials: "include" })
    .then(() => undefined)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

export function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(`${key}[]`, String(item));
    } else {
      url.searchParams.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
    }
  }
  return url.toString();
}

async function send(path: string, options: RequestOptions, retried: boolean): Promise<Response> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-Request-Id": requestId(),
  };

  const branch = options.branch === undefined ? selectedBranchHeader() : options.branch;
  if (branch) headers["X-Branch-Id"] = branch;

  // Reads too: the first request on a page establishes the session.
  await ensureCsrfCookie();
  if (method !== "GET") {
    const token = readCookie("XSRF-TOKEN");
    if (token) headers["X-XSRF-TOKEN"] = token;
  }
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: "include",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Can't reach the server.");
  }

  // A stale CSRF token: fetch a fresh cookie and try once more.
  if (response.status === 419 && !retried) {
    await ensureCsrfCookie(true);
    return send(path, options, true);
  }
  return response;
}

/** JSON request; resolves to the parsed body (null for 204), throws `ApiError`. */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options, false);
  const id = response.headers.get("X-Request-Id");

  if (response.status === 204) return null as T;

  const text = await response.text();
  let parsed: unknown = null;
  if (text !== "") {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) throw toApiError(response.status, parsed, id);
  return parsed as T;
}

/** `{ data }` unwrapped. */
export async function apiData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const body = await api<{ data: T }>(path, options);
  return body.data;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; per_page: number; total: number };
}

/** One page of a paginated list. */
export function apiPage<T>(path: string, options: RequestOptions = {}): Promise<Page<T>> {
  return api<Page<T>>(path, options);
}

/**
 * Every page of a list, for small reference lists (bays, technicians, the
 * catalogue, customer accounts). Never for growing data: screens page those.
 */
export async function apiAll<T>(path: string, options: RequestOptions = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await apiPage<T>(path, { ...options, query: { ...options.query, page, per_page: 100 } });
    out.push(...result.data);
    if (page * result.meta.per_page >= result.meta.total) break;
  }
  return out;
}

/**
 * A file download (export, signed document URL) as a Blob, with the filename
 * the API suggested.
 */
export async function apiBlob(path: string, options: RequestOptions = {}): Promise<{ blob: Blob; filename: string | null }> {
  const response = await send(path, options, false);
  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    throw toApiError(response.status, parsed, response.headers.get("X-Request-Id"));
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match ? decodeURIComponent(match[1]) : null };
}

/** Saves a Blob through the browser. Client-only. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A fresh key for an idempotent POST: one per user action, reused on retry. */
export function newIdempotencyKey(): string {
  return requestId();
}
