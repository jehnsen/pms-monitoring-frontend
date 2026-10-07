/**
 * The database as server commands see it.
 *
 * Deliberately small: equality/IN filters, ordered selects with optional row
 * locks, and plain inserts/updates/deletes. Commands express everything else
 * in TypeScript on top of it. Two implementations exist and must agree:
 *
 *   - `server/db.ts` — postgres.js over the Supavisor pooler, one transaction
 *     per call, acting as `pms_server` with the user's claims (RLS applies).
 *   - `server/testing/fake-db.ts` — in-memory tables for unit tests, with the
 *     same all-or-nothing rollback but no RLS (commands re-check scope in
 *     TypeScript, which is exactly what the unit tests exercise).
 *
 * No "server-only" here: this file is types, and the fake imports it.
 */

/** Every table a command may touch. A string union, so no caller can splice
 * an arbitrary identifier into SQL. Phase 2 adds to this list. */
export type Table =
  | "pms_providers"
  | "pms_fleet_clients"
  | "pms_profiles"
  | "pms_vehicles"
  | "pms_work_orders"
  | "pms_work_order_events"
  | "pms_work_order_lines"
  | "pms_approval_log"
  | "pms_approval_settings"
  | "pms_service_tasks"
  | "pms_technicians"
  | "pms_vendors"
  | "pms_work_order_tasks"
  | "pms_work_order_parts"
  | "pms_parts";

export type Row = Record<string, unknown>;

/** Column -> value. An array value means `IN (...)`; `null` means `IS NULL`. */
export type Where = Record<string, unknown>;

export interface SelectOptions {
  orderBy?: string;
  /** `SELECT ... FOR UPDATE` — lock the matched rows until commit. */
  forUpdate?: boolean;
}

/** One open transaction. Every call participates in it. */
export interface Tx {
  select(table: Table, where?: Where, options?: SelectOptions): Promise<Row[]>;
  insert(table: Table, rows: Row | Row[]): Promise<void>;
  update(table: Table, where: Where, patch: Row): Promise<number>;
  delete(table: Table, where: Where): Promise<number>;
  /** Transaction-scoped advisory lock; released at commit or rollback. */
  advisoryLock(key: string): Promise<void>;
  /** Highest `WO-<year>-n` issued across ALL tenants (the reference index is global). */
  highestWorkOrderReference(year: number): Promise<string | null>;
}

export interface Db {
  /**
   * Runs `fn` inside one transaction acting as `user`. Commits if it
   * resolves, rolls back everything if it throws.
   */
  withUserTx<T>(user: { id: string }, fn: (tx: Tx) => Promise<T>): Promise<T>;
}
