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
// Usage (LM Studio must be running locally with a model loaded):
//   pnpm --filter task-manager eval
//   pnpm --filter task-manager eval -- -t due-date       # Vitest's own -t name filter
//   LM_STUDIO_BASE_URL=http://localhost:1234 pnpm --filter task-manager eval
import { beforeAll, describe, expect, it } from "vitest";
import type { ActionItem } from "../src/actionItem.js";
import { createLmStudioExtractor } from "../src/lmStudio.js";
import { fixtures } from "./fixtures.js";

const baseUrl = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234";
const extractor = createLmStudioExtractor({ baseUrl });

describe.each(fixtures)("$name — $rule", (fixture) => {
  let actionItems: ActionItem[];

  beforeAll(async () => {
    actionItems = await extractor.extract(fixture.email);
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
        expect(actionItems[index]?.description).toMatch(expectation.descriptionContains as string | RegExp);
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
