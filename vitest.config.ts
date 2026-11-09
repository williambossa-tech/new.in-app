import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost/newin_test",
    },
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
