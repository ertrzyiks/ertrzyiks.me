// Shared Vitest suite-generation logic for eval/*.eval.test.ts. Both
// extractActionItems.eval.test.ts (fixtures.ts, hand-picked to exercise one prompt rule each) and
// reviewedFixtures.eval.test.ts (reviewedFixtures.ts, real emails flagged wrong via `npm run
// review`, see that script's header) run the exact same fixture -> extraction[-> judge] ->
// assertions shape, just against a different fixture list and (in principle) a different
// extractor/judge — pulled out so neither file has to duplicate it.
import { beforeAll, describe, expect, it } from "vitest";
import type { ActionItem } from "../src/actionItem.js";
import type { ActionItemJudge } from "../src/actionItemJudge.js";
import { judgeActionItems } from "../src/jobProcessor.js";
import type { ActionItemExtractor } from "../src/lmStudio.js";
import type { EvalFixture } from "./fixtures.js";

// `judge` is optional so callers that only want to eval the extraction prompt in isolation still
// can — but every current caller passes one, since a real job always runs both steps and asserting
// only on raw extraction would eval a pipeline nothing in production actually uses. When passed,
// this is the exact same extract-then-judge-then-filter logic src/jobProcessor.ts runs for a real
// job (see judgeActionItems there), so a fixture's `expect` is checked against what would actually
// have reached Google Tasks, not an intermediate result.
export function runFixtureSuite(
  fixtures: EvalFixture[],
  extractor: ActionItemExtractor,
  judge?: ActionItemJudge,
): void {
  describe.each(fixtures)("$name — $rule", (fixture) => {
    let actionItems: ActionItem[];

    beforeAll(async () => {
      const extracted = await extractor.extract(fixture.email);
      actionItems = judge ? (await judgeActionItems(fixture.email, extracted, judge)).kept : extracted;
    });

    const { count, items = [] } = fixture.expect;

    it(`returns ${typeof count === "number" ? count : JSON.stringify(count)} action item(s)`, () => {
      if (typeof count === "number") {
        expect(actionItems).toHaveLength(count);
        return;
      }
      if (count.min !== undefined) expect(actionItems.length).toBeGreaterThanOrEqual(count.min);
      if (count.max !== undefined) expect(actionItems.length).toBeLessThanOrEqual(count.max);
    });

    items.forEach((expectation, index) => {
      if (expectation.titleContains !== undefined) {
        it(`item[${index}].title contains ${expectation.titleContains}`, () => {
          expect(actionItems[index]?.title).toMatch(expectation.titleContains as string | RegExp);
        });
      }

      if (expectation.descriptionContains !== undefined) {
        it(`item[${index}].description contains ${expectation.descriptionContains}`, () => {
          expect(actionItems[index]?.description).toMatch(
            expectation.descriptionContains as string | RegExp,
          );
        });
      }

      if (expectation.dueDate === "present") {
        it(`item[${index}].dueDate is present`, () => {
          expect(actionItems[index]?.dueDate).toBeTruthy();
        });
      } else if (expectation.dueDate === "absent") {
        it(`item[${index}].dueDate is absent`, () => {
          expect(actionItems[index]?.dueDate).toBeFalsy();
        });
      } else if (expectation.dueDate !== undefined) {
        const expectedDueDate = expectation.dueDate;
        it(`item[${index}].dueDate equals ${expectedDueDate}`, () => {
          expect(actionItems[index]?.dueDate).toBe(expectedDueDate);
        });
      }
    });
  });
}
