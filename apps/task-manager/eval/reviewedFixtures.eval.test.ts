// Same eval harness as extractActionItems.eval.test.ts (see runFixtureSuite.ts) — extract, then
// judge and filter, the same two-call pipeline src/queues/extract-action-items/jobProcessor.ts
// runs for a real job — run
// against reviewedFixtures.ts — real emails a human flagged as wrongly extracted via `npm run
// review` (scripts/review-inspections.ts) — instead of fixtures.ts's hand-picked ones.
//
// A freshly-flagged fixture is *expected* to fail here (that's the point of flagging it — the
// current pipeline got it wrong). Green here means extraction+judging together now agree with the
// human's correction — which can happen from either side: a reworked extractActionItems.system.md
// no longer producing the bad item, or judgeActionItem.system.md now correctly rejecting it even
// though extraction still offers it up. Once green, move the fixture over to fixtures.ts as a
// regular regression fixture and delete its entry from reviewed-fixtures.json (or leave it — a
// green fixture here does no harm, it just stops being a to-do).
//
// Only ever run manually (`pnpm --filter task-manager eval`), same caveats as
// extractActionItems.eval.test.ts's header comment (non-deterministic local model output).
import { describe, it } from "vitest";
import { createLmStudioActionItemJudge } from "../src/queues/extract-action-items/actionItemJudge.js";
import { createLmStudioExtractor } from "../src/queues/extract-action-items/lmStudio.js";
import { reviewedFixtures } from "./reviewedFixtures.js";
import { runFixtureSuite } from "./runFixtureSuite.js";

const baseUrl = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234";

if (reviewedFixtures.length > 0) {
  runFixtureSuite(
    reviewedFixtures,
    createLmStudioExtractor({ baseUrl }),
    createLmStudioActionItemJudge({ baseUrl }),
  );
} else {
  // describe.each over an empty array silently produces zero tests, which reads as "nothing to
  // check" rather than "nothing has been flagged yet" — spell that out instead of letting this
  // file vanish from the eval run's output.
  describe("reviewedFixtures", () => {
    it.skip("no reviewed fixtures yet — run `npm run review` and flag a bad extraction", () => {});
  });
}
