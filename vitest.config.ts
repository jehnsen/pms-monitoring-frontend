import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
    // Server commands are unit-tested against server/testing/fake-db.ts; the
    // live-database suite (tests/integration) has its own config.
    include: ["lib/**/*.test.ts", "server/**/*.test.ts"],
    env: { TZ: "Asia/Manila" },
  },
});
