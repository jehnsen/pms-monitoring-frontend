import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The authoring scripts in scripts/emit-*.ts are vitest files (so they share
 * the "@" alias and run the real modules), but they WRITE files — they must
 * never run as part of `npm test`. They are included only when one is named
 * on the command line: `npx vitest run scripts/emit-golden-fixtures.ts`.
 */
const emitting = process.argv.some((arg) => /scripts[\\/]emit-[\w-]+\.ts$/.test(arg));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: emitting ? ["scripts/emit-*.ts"] : ["lib/**/*.test.ts"],
  },
});
