import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/security/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    maxWorkers: 1,
  },
});
