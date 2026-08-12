// Vitest suite for src/prompts/extractActionItems.system.md — a manual-run-only eval
// against a real local LM Studio server (see src/lmStudio.ts). Never part of `pnpm
// test`/CI: this file is only picked up by eval/vitest.config.ts, which nothing but
// the `eval` package script points at, and the root vitest.config.ts excludes eval/
// explicitly too. LM Studio is macOS-only local software, so this only ever runs by
// hand on a Mac with LM Studio running and a model loaded.
//
// Each fixture (eval/fixtures.ts) calls the real extractor once in `beforeAll`, then
// every assertion below reuses that one result — one LLM call per fixture, not one per
// assertion. Local model output isn't deterministic: a fixture or two flipping between
// runs is expected, treat it as a trend to watch across a prompt change, not a hard
// pass/fail gate the way `src/**/*.test.ts` is.
//
// The fixture -> extraction -> assertions shape itself lives in runFixtureSuite.ts, shared with
// reviewedFixtures.eval.test.ts (real emails flagged wrong via `npm run review`).
//
// Usage (LM Studio must be running locally with a model loaded):
//   pnpm --filter task-manager eval
//   pnpm --filter task-manager eval -- -t due-date       # Vitest's own -t name filter
//   LM_STUDIO_BASE_URL=http://localhost:1234 pnpm --filter task-manager eval
import { createLmStudioExtractor } from "../src/lmStudio.js";
import { fixtures } from "./fixtures.js";
import { runFixtureSuite } from "./runFixtureSuite.js";

const baseUrl = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234";

runFixtureSuite(fixtures, createLmStudioExtractor({ baseUrl }));
