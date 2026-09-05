// Same eval harness as extractActionItems.eval.test.ts (see runFixtureSuite.ts) — extract, the
// same call src/modules/email-processing/queues/extract-action-items/jobProcessor.ts runs for a real job — run against
// reviewedFixtures.ts — real emails a human flagged as wrongly extracted via `npm run review`
// (scripts/review-inspections.ts) — instead of fixtures.ts's hand-picked ones.
//
// A freshly-flagged fixture is *expected* to fail here (that's the point of flagging it — the
// current pipeline got it wrong). Green here means extraction now agrees with the human's
// correction, e.g. after a reworked extractActionItems.system.md no longer produces the bad item.
// Once green, move the fixture over to fixtures.ts as a regular regression fixture and delete its
// entry from reviewed-fixtures.json (or leave it — a green fixture here does no harm, it just
// stops being a to-do).
//
// Only ever run manually (`OPENROUTER_API_KEY=... pnpm --filter task-manager eval`), same caveats
// as extractActionItems.eval.test.ts's header comment (non-deterministic free-tier model output).
import { describe, it } from "vitest";
import { createOpenRouterExtractor } from "../src/modules/email-processing/queues/extract-action-items/openRouter.js";
import { reviewedFixtures } from "./reviewedFixtures.js";
import { runFixtureSuite } from "./runFixtureSuite.js";

if (reviewedFixtures.length > 0) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required to run this eval — set it in apps/task-manager/.env or " +
        "prefix the command, see extractActionItems.eval.test.ts's header comment.",
    );
  }

  runFixtureSuite(
    reviewedFixtures,
    createOpenRouterExtractor({
      apiKey,
      model: process.env.OPENROUTER_MODEL,
      baseUrl: process.env.OPENROUTER_BASE_URL,
    }),
  );
} else {
  // describe.each over an empty array silently produces zero tests, which reads as "nothing to
  // check" rather than "nothing has been flagged yet" — spell that out instead of letting this
  // file vanish from the eval run's output.
  describe("reviewedFixtures", () => {
    it.skip("no reviewed fixtures yet — run `npm run review` and flag a bad extraction", () => {});
  });
}
