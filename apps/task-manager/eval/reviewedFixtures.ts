// Fixtures captured from real production email via `npm run review`
// (scripts/review-inspections.ts) — each one is a real extraction the user flagged as wrong via
// that tool's UI, with `expect` filled in by hand there to describe what the extraction *should*
// have produced. Unlike fixtures.ts's fixtures (hand-picked to exercise one
// extractActionItems.system.md rule each), these start out red: the point is to accumulate real
// failures here as a checklist for reworking the prompt, not to guard against a regression from
// day one. A fixture only leaves this file once its `it` block is green again — see
// reviewedFixtures.eval.test.ts.
//
// The array itself lives in reviewed-fixtures.json (plain data) rather than inline here, so the
// review server can append to it with a JSON read-modify-write instead of parsing/rewriting
// TypeScript. Read via readFileSync + import.meta.url (mirrors lmStudio.ts's system-prompt
// loading) rather than a JSON import, to sidestep import-attribute syntax differences between the
// tsx-run review script and vitest's own module loader.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalFixture } from "./fixtures.js";

// A regular EvalFixture plus provenance back to the review UI/inspection file it came from — the
// two extra fields are how scripts/review-inspections.ts finds "is this run already flagged?"
// (GET /api/runs) and "which fixture do I remove?" (DELETE /api/flag/:sourceFile) without
// re-deriving an id from the email content. runFixtureSuite.ts only reads the EvalFixture fields,
// so it's oblivious to these.
export interface ReviewedFixture extends EvalFixture {
  reviewSourceFile: string;
  reviewedAt: string;
}

export const reviewedFixturesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "reviewed-fixtures.json",
);

function loadReviewedFixtures(): ReviewedFixture[] {
  try {
    return JSON.parse(readFileSync(reviewedFixturesPath, "utf8")) as ReviewedFixture[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export const reviewedFixtures: EvalFixture[] = loadReviewedFixtures();
