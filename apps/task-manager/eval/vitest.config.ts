import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// Loads apps/task-manager/.env — the same file server.ts's own `import "dotenv/config"` reads,
// see .env.example — so OPENROUTER_API_KEY/OPENROUTER_MODEL (the env vars *.eval.test.ts files
// read) can be set once there instead of prefixed onto every `pnpm run eval` invocation by hand. A
// no-op when no .env file exists, same as server.ts's own load, and it never overrides an
// already-exported value (dotenv's default). Resolved relative to this config file rather than
// `process.cwd()`, so it finds the right .env regardless of where `vitest --config
// eval/vitest.config.ts` is invoked from.
loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

// Separate Vitest project for eval/*.eval.test.ts, the manual-only prompt eval against a real
// OpenRouter account (see src/modules/email-processing/queues/extract-action-items/openRouter.ts
// and the root vitest.config.ts's `exclude`). Nothing but the `eval` package script points at this
// file — it is never picked up by `pnpm test`/CI, and it needs a real `OPENROUTER_API_KEY`, so in
// practice this only ever runs by hand.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.eval.test.ts"],
    // Free-tier model inference can be slow (queued behind other free-tier traffic), and each
    // fixture's `beforeAll` makes a real HTTP call — give it real headroom instead of Vitest's 5s
    // default, which a slow/queued request would blow through easily.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
