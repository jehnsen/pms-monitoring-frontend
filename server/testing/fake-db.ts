import type { Db, Row, SelectOptions, Table, Tx, Where } from "@/server/db-port";

/**
 * An in-memory stand-in for `server/db.ts`, for command unit tests.
 *
 * Faithful where it matters to the commands: each `withUserTx` is
 * all-or-nothing (a throw restores every table to its state before the
 * transaction), filters and ordering behave like the SQL, and `seq` columns
 * auto-increment. It does **not** implement RLS — commands re-check tenant
 * scope in TypeScript, and that check is what these tests exercise. RLS on
 * the server path is covered by `tests/integration/`.
 */

/** Tables whose rows get an auto-incrementing `seq`, like their bigserial. */
const SEQ_TABLES = new Set<Table>([
  "pms_work_order_events",
  "pms_work_order_lines",
  "pms_approval_log",
  "pms_work_order_parts",
]);

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([column, value]) => {
    if (Array.isArray(value)) return value.includes(row[column]);
    if (value === null) return row[column] === null || row[column] === undefined;
    return row[column] === value;
  });
}

export type FakeTables = Partial<Record<Table, Row[]>>;

export class FakeDb implements Db {
  tables: FakeTables;
  private seq = 1_000;
  /** Set to make a specific write throw mid-transaction. */
  failOn: ((op: "insert" | "update" | "delete", table: Table) => boolean) | null = null;
  /** Every user a transaction was opened for, in order. */
  readonly actingAs: string[] = [];

  constructor(tables: FakeTables) {
    this.tables = structuredClone(tables);
  }

  rows(table: Table): Row[] {
    return this.tables[table] ?? (this.tables[table] = []);
  }

  async withUserTx<T>(user: { id: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
    this.actingAs.push(user.id);
    const snapshot = structuredClone(this.tables);
    try {
      return await fn(this.tx());
    } catch (error) {
      this.tables = snapshot;
      throw error;
    }
  }

  private tx(): Tx {
    return {
      select: async (table: Table, where: Where = {}, options: SelectOptions = {}) => {
        const found = this.rows(table).filter((row) => matches(row, where));
        if (options.orderBy) {
          const key = options.orderBy;
          found.sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0));
        }
        return structuredClone(found);
      },
      insert: async (table: Table, rows: Row | Row[]) => {
        if (this.failOn?.("insert", table)) throw new Error(`fake failure inserting into ${table}`);
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          const stored = structuredClone(row);
          if (SEQ_TABLES.has(table) && stored.seq === undefined) stored.seq = this.seq++;
          this.rows(table).push(stored);
        }
      },
      update: async (table: Table, where: Where, patch: Row) => {
        if (this.failOn?.("update", table)) throw new Error(`fake failure updating ${table}`);
        let count = 0;
        for (const row of this.rows(table)) {
          if (!matches(row, where)) continue;
          Object.assign(row, structuredClone(patch));
          count += 1;
        }
        return count;
      },
      delete: async (table: Table, where: Where) => {
        if (this.failOn?.("delete", table)) throw new Error(`fake failure deleting from ${table}`);
        const before = this.rows(table).length;
        this.tables[table] = this.rows(table).filter((row) => !matches(row, where));
        return before - this.rows(table).length;
      },
      advisoryLock: async () => {},
      highestWorkOrderReference: async (year: number) => {
        const pattern = new RegExp(`^WO-${year}-(\\d+)$`);
        let best: { n: number; reference: string } | null = null;
        for (const row of this.rows("pms_work_orders")) {
          const match = pattern.exec(String(row.reference ?? ""));
          if (match && (!best || Number(match[1]) > best.n)) {
            best = { n: Number(match[1]), reference: String(row.reference) };
          }
        }
        return best?.reference ?? null;
      },
    };
  }
}
