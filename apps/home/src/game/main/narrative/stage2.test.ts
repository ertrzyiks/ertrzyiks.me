import { describe, expect, test } from "vitest";
import { createStage2Narrative } from "./stage2";
import { turnForPlayer } from "../../core/narrative";

describe("createStage2Narrative", () => {
  test("has the five spec-10 beats, in script order", () => {
    const script = createStage2Narrative("human", "wanderer");
    expect(script.map((e) => e.id)).toEqual([
      "stage2-turn-1",
      "stage2-turn-3",
      "stage2-wanderer-sighted",
      "stage2-reached-gate",
      "stage2-whirley-defeated",
    ]);
  });

  test("the 'Turn 3' beat fires on the human's third turn, not the third raw engine turn", () => {
    // Stage 2 registers 3 players per round in this order: human (index 0),
    // bandits (index 1), wanderer (index 2) — see stages/stage2.ts, matching
    // Scenario.start()'s registration order. turnForPlayer has its own
    // dedicated tests (core/narrative/index.test.ts) verifying the underlying
    // arithmetic against a real 3-player rotation; this test only checks that
    // the script actually uses it rather than a stale hand-typed literal.
    const script = createStage2Narrative("human", "wanderer");
    const turn3 = script.find((e) => e.id === "stage2-turn-3")!;
    expect(turn3.trigger).toEqual({ kind: "turn", turn: turnForPlayer(0, 3, 3) });
  });

  test("wanderer-sighted, reached-gate, and defeated beats reference the given ids and the gate section", () => {
    const script = createStage2Narrative("human", "wanderer");

    const sighted = script.find((e) => e.id === "stage2-wanderer-sighted")!;
    expect(sighted.trigger).toEqual({
      kind: "proximity",
      playerId: "human",
      ofPlayerId: "wanderer",
    });

    const gate = script.find((e) => e.id === "stage2-reached-gate")!;
    expect(gate.trigger).toEqual({
      kind: "tileReached",
      playerId: "human",
      sections: ["gate"],
    });
    expect(gate.endsStage).toBe("win");

    const defeated = script.find((e) => e.id === "stage2-whirley-defeated")!;
    expect(defeated.trigger).toEqual({ kind: "lastUnitDefeated", playerId: "human" });
    expect(defeated.endsStage).toBe("lose");
  });

  test("swapping in different ids rewires the id-scoped triggers", () => {
    const script = createStage2Narrative("player-x", "npc-y");
    const sighted = script.find((e) => e.id === "stage2-wanderer-sighted")!;
    expect(sighted.trigger).toEqual({
      kind: "proximity",
      playerId: "player-x",
      ofPlayerId: "npc-y",
    });
  });
});
