import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

// Loads apps/task-manager/.env — the same file server.ts's own `import "dotenv/config"` reads,
// see .env.example — so LM_STUDIO_BASE_URL (the one env var *.eval.test.ts files read; see their
// `baseUrl` fallback) can be set once there instead of prefixed onto every `pnpm run eval`
// invocation by hand. A no-op when no .env file exists, same as server.ts's own load, and it never
// overrides an already-exported LM_STUDIO_BASE_URL (dotenv's default). Resolved relative to this
// config file rather than `process.cwd()`, so it finds the right .env regardless of where `vitest
// --config eval/vitest.config.ts` is invoked from.
loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

// Separate Vitest project for eval/*.eval.test.ts, the manual-only prompt eval against
// a real local LM Studio server (see src/lmStudio.ts and the root vitest.config.ts's
// `exclude`). Nothing but the `eval` package script points at this file — it is never
// picked up by `pnpm test`/CI. LM Studio is macOS-only local software, so in practice
// this only ever runs by hand on a Mac with LM Studio running and a model loaded.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["*.eval.test.ts"],
    // Local LLM inference is slow, and each fixture's `beforeAll` makes two real HTTP
    // calls (`/v1/models` + `/v1/chat/completions`) — give it real headroom instead of
    // Vitest's 5s default, which a cold/large model would blow through easily.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
