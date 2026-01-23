import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    minWorkers: 1,
    maxWorkers: 1,
  },
});
