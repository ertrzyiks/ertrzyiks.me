import { defineConfig } from "vitest/config";

// Scoped to src/ so vitest never picks up interaction/*.spec.ts (Playwright,
// run separately via `pnpm test:e2e` — docs/adr/0001).
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
  },
});
