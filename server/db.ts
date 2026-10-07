import "server-only";

import postgres, { type PendingQuery, type Row as PgRow, type TransactionSql } from "postgres";
import type { Db, Row, SelectOptions, Table, Tx, Where } from "@/server/db-port";

/**
 * Transactional database access for server commands.
 *
 * Connects with `DATABASE_URL` — in production the Supavisor **transaction**
 * pooler (port 6543), which is why `prepare: false`: a pooled connection can
 * be handed to a different client between transactions, so a named prepared
 * statement from one may not exist (or may mean something else) on the next.
 *
 * Every transaction opens with:
 *
 *     set local role pms_server;
 *     select set_config('request.jwt.claims', '{"sub": "<user id>", ...}', true);
 *
 * `postgres` has BYPASSRLS on Supabase, so nothing may run before the role
 * switch — `withUserTx` is the only way in, and it does this first. Both
 * settings are transaction-local (`local`, and `true` for set_config), which
 * is what makes them safe under transaction pooling: they vanish at commit or
 * rollback and can never leak onto the next client's transaction.
 */

/** NOLOGIN role created in migration 0010. Not configurable, deliberately. */
const SERVER_ROLE = "pms_server";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __pmsSql?: Sql };

function sqlClient(): Sql {
  if (globalForDb.__pmsSql) return globalForDb.__pmsSql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Point it at the Supabase transaction pooler (port 6543)."
    );
  }

  const client = postgres(url, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    // Match what PostgREST hands the browser, because lib/mappers.ts is shared:
    // `date` stays "YYYY-MM-DD" (a Date object would shift the day for anyone
    // east of UTC) and timestamps become ISO strings.
    types: {
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
      timestamp: {
        to: 1184,
        from: [1114, 1184],
        serialize: (x: string | Date) => new Date(x).toISOString(),
        parse: (x: string) => new Date(x).toISOString(),
      },
    },
  });

  // Reused across hot reloads in dev rather than leaking a pool per edit.
  globalForDb.__pmsSql = client;
  return client;
}

/** Plain objects go to jsonb; postgres.js would otherwise send "[object Object]". */
function toParam(tx: TransactionSql, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  ) {
    return tx.json(value as postgres.JSONValue);
  }
  return value;
}

function toParams(tx: TransactionSql, row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) out[key] = toParam(tx, value);
  return out;
}

type Fragment = PendingQuery<PgRow[]>;

/** Null when an IN list is empty: nothing can match, so the caller skips the query. */
function whereClause(tx: TransactionSql, where: Where): Fragment | null {
  const parts: Fragment[] = [];
  for (const [column, value] of Object.entries(where)) {
    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      parts.push(tx`${tx(column)} in ${tx(value as string[])}`);
    } else if (value === null) {
      parts.push(tx`${tx(column)} is null`);
    } else {
      parts.push(tx`${tx(column)} = ${toParam(tx, value) as string}`);
    }
  }
  if (parts.length === 0) return tx`true`;
  return parts.reduce((acc, part) => tx`${acc} and ${part}`);
}

function pgTx(tx: TransactionSql): Tx {
  return {
    async select(table: Table, where: Where = {}, options: SelectOptions = {}) {
      const condition = whereClause(tx, where);
      if (!condition) return [];
      const order = options.orderBy ? tx`order by ${tx(options.orderBy)}` : tx``;
      const lock = options.forUpdate ? tx`for update` : tx``;
      const rows = await tx`select * from ${tx(table)} where ${condition} ${order} ${lock}`;
      return rows as unknown as Row[];
    },

    async insert(table: Table, rows: Row | Row[]) {
      const list = (Array.isArray(rows) ? rows : [rows]).map((row) => toParams(tx, row));
      if (list.length === 0) return;
      const columns = Object.keys(list[0]);
      await tx`insert into ${tx(table)} ${tx(
        list as Record<string, postgres.ParameterOrJSON<never>>[],
        columns
      )}`;
    },

    async update(table: Table, where: Where, patch: Row) {
      const condition = whereClause(tx, where);
      if (!condition || Object.keys(patch).length === 0) return 0;
      const result = await tx`update ${tx(table)} set ${tx(toParams(tx, patch))} where ${condition}`;
      return result.count;
    },

    async delete(table: Table, where: Where) {
      const condition = whereClause(tx, where);
      if (!condition) return 0;
      const result = await tx`delete from ${tx(table)} where ${condition}`;
      return result.count;
    },

    async advisoryLock(key: string) {
      await tx`select pg_advisory_xact_lock(hashtext(${key}))`;
    },

    async highestWorkOrderReference(year: number) {
      const [row] = await tx`select pms_highest_work_order_reference(${year}::int) as reference`;
      return (row?.reference as string | null) ?? null;
    },
  };
}

export const pgDb: Db = {
  async withUserTx<T>(user: { id: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const claims = JSON.stringify({ sub: user.id, role: "authenticated" });
    const result = await sqlClient().begin(async (tx) => {
      await tx.unsafe(`set local role ${SERVER_ROLE}`);
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      return fn(pgTx(tx));
    });
    return result as T;
  },
};

/** For tests and graceful shutdown only. */
export async function closeDb() {
  const client = globalForDb.__pmsSql;
  globalForDb.__pmsSql = undefined;
  if (client) await client.end({ timeout: 5 });
}
