import { describe, expect, test } from "vitest";
import { createStage3Narrative } from "./stage3";
import { turnForPlayer } from "../../core/narrative";
import { Bandit, BanditCaptain } from "../units";

describe("createStage3Narrative", () => {
  test("has the six spec-11 beats, in script order", () => {
    const script = createStage3Narrative("human", "wanderer");
    expect(script.map((e) => e.id)).toEqual([
      "stage3-turn-1",
      "stage3-turn-4",
      "stage3-captain-defeated",
      "stage3-wanderer-sighted",
      "stage3-reached-campfire",
      "stage3-whirley-defeated",
    ]);
  });

  test("the 'Turn 4' beat fires on the human's fourth turn, not the fourth raw engine turn", () => {
    // Stage 3 registers 3 players per round (human, bandits, wanderer — see
    // stages/stage3.ts), same as Stage 2. turnForPlayer has its own dedicated
    // tests (core/narrative/index.test.ts); this test only checks that the
    // script actually uses it rather than a stale hand-typed literal.
    const script = createStage3Narrative("human", "wanderer");
    const turn4 = script.find((e) => e.id === "stage3-turn-4")!;
    expect(turn4.trigger).toEqual({ kind: "turn", turn: turnForPlayer(0, 3, 4) });
  });

  test("the 'Bandit Captain defeated' beat's predicate matches only a BanditCaptain instance", () => {
    const script = createStage3Narrative("human", "wanderer");
    const captainDefeated = script.find((e) => e.id === "stage3-captain-defeated")!;
    expect(captainDefeated.trigger.kind).toBe("unitDefeated");
    if (captainDefeated.trigger.kind !== "unitDefeated") throw new Error("unreachable");

    expect(captainDefeated.trigger.predicate(new BanditCaptain())).toBe(true);
    expect(captainDefeated.trigger.predicate(new Bandit())).toBe(false);
  });

  test("wanderer-sighted, reached-campfire, and defeated beats reference the given ids and the campfire section", () => {
    const script = createStage3Narrative("human", "wanderer");

    const sighted = script.find((e) => e.id === "stage3-wanderer-sighted")!;
    expect(sighted.trigger).toEqual({
      kind: "proximity",
      playerId: "human",
      ofPlayerId: "wanderer",
    });

    const campfire = script.find((e) => e.id === "stage3-reached-campfire")!;
    expect(campfire.trigger).toEqual({
      kind: "tileReached",
      playerId: "human",
      sections: ["campfire"],
    });
    expect(campfire.endsStage).toBe("win");

    const defeated = script.find((e) => e.id === "stage3-whirley-defeated")!;
    expect(defeated.trigger).toEqual({ kind: "lastUnitDefeated", playerId: "human" });
    expect(defeated.endsStage).toBe("lose");
  });

  test("swapping in different ids rewires the id-scoped triggers", () => {
    const script = createStage3Narrative("player-x", "npc-y");
    const sighted = script.find((e) => e.id === "stage3-wanderer-sighted")!;
    expect(sighted.trigger).toEqual({
      kind: "proximity",
      playerId: "player-x",
      ofPlayerId: "npc-y",
    });
  });
});
