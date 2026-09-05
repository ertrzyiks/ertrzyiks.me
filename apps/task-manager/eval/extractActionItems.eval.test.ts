// Vitest suite for src/modules/email-processing/queues/extract-action-items/prompts/extractActionItems.system.md — a
// manual-run-only eval against a real OpenRouter account (see
// src/modules/email-processing/queues/extract-action-items/openRouter.ts). Never part of `pnpm test`/CI: this file is
// only picked up by eval/vitest.config.ts, which nothing but the `eval` package script points at,
// and the root vitest.config.ts excludes eval/ explicitly too. It needs a real `OPENROUTER_API_KEY`,
// so this only ever runs by hand.
//
// Each fixture (eval/fixtures.ts) extracts once in `beforeAll` — the exact same call
// src/modules/email-processing/queues/extract-action-items/jobProcessor.ts runs for a real job (see runFixtureSuite.ts) —
// and every assertion below reuses that one result. Free-tier model output isn't deterministic: a
// fixture or two flipping between runs is expected, treat it as a trend to watch across a prompt
// change, not a hard pass/fail gate the way `src/**/*.test.ts` is.
//
// The fixture -> extraction -> assertions shape itself lives in runFixtureSuite.ts, shared with
// reviewedFixtures.eval.test.ts (real emails flagged wrong via `npm run review`).
//
// Usage:
//   OPENROUTER_API_KEY=... pnpm --filter task-manager eval
//   OPENROUTER_API_KEY=... pnpm --filter task-manager eval -- -t due-date   # Vitest's own -t name filter
//   OPENROUTER_API_KEY=... OPENROUTER_MODEL=some/other-model:free pnpm --filter task-manager eval
import { createOpenRouterExtractor } from "../src/modules/email-processing/queues/extract-action-items/openRouter.js";
import { fixtures } from "./fixtures.js";
import { runFixtureSuite } from "./runFixtureSuite.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is required to run this eval — set it in apps/task-manager/.env or " +
      "prefix the command, see this file's header comment.",
  );
}

runFixtureSuite(
  fixtures,
  createOpenRouterExtractor({
    apiKey,
    model: process.env.OPENROUTER_MODEL,
    baseUrl: process.env.OPENROUTER_BASE_URL,
  }),
);
