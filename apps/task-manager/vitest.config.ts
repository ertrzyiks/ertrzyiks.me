import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    // Belt-and-braces alongside `include` only covering `src/`: eval/ holds a second,
    // separate Vitest project (see eval/vitest.config.ts) for the manual-only,
    // real-LM-Studio prompt eval — it must never run under `pnpm test`/CI, so it's
    // named out here explicitly rather than relying solely on `include` not matching it.
    exclude: [...configDefaults.exclude, "eval/**"],
  },
});
