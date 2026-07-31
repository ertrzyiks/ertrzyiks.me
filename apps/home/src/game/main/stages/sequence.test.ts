import { describe, expect, test } from "vitest";
import { STAGE_SEQUENCE, nextStageIndex } from "./sequence";

// Pure data/logic seam for issue #152 "stage progression" — the one part of
// stage-swapping this ticket can unit-test without Pixi (see StageManager's
// own module comment for why the actual swap isn't covered here).
describe("STAGE_SEQUENCE", () => {
  test("declares all three stages in order", () => {
    expect(STAGE_SEQUENCE).toHaveLength(3);
  });

  test("each entry's definition/narrative factories are callable and self-consistent", () => {
    for (const entry of STAGE_SEQUENCE) {
      const definition = entry.createDefinition();
      expect(definition.player.id).toBe("human");
      const narrative = entry.createNarrative("human", "wanderer");
      expect(Array.isArray(narrative)).toBe(true);
    }
  });
});

describe("nextStageIndex", () => {
  test("advances to the next stage while one remains", () => {
    expect(nextStageIndex(0)).toBe(1);
    expect(nextStageIndex(1)).toBe(2);
  });

  test("returns null after the final stage — spec 08: no further stages load", () => {
    expect(nextStageIndex(2)).toBeNull();
  });
});
