import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Separate from vitest.config.ts: these tests hit a live local Supabase
 * (`supabase start`), run far slower than the pure-function unit suite, and
 * must never share a CI lane with it — one slow/offline integration test
 * should not make `npm test` flaky. See CLAUDE.md's "Live database test
 * harness".
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // See tests/stubs/server-only.ts.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // RLS/auth isolation tests share one Postgres instance; running them
    // concurrently risks one test's signed-in session leaking into another's
    // request via a shared client.
    fileParallelism: false,
    env: {
      TZ: "Asia/Manila",
      // The local stack's direct connection. In production server/db.ts uses
      // the Supavisor transaction pooler; both run the same SET LOCAL path.
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
  },
});
