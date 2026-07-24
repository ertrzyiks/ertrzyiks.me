import { turnForPlayer, type NarrativeScript } from "../../core/narrative";

// Stage 2 story beats, verbatim from specs/10-stage-2.md's narrative table.
// Player ids match Scenario: the human is "human", the neutral Wanderer owner
// is "wanderer". The "gate" section is the win tile.
//
// Spec 10's "Turn 3 start" (line 33) is player-facing: the human's 3rd turn,
// not the 3rd raw engine turn (see turnForPlayer's doc comment). Stage 2
// registers 3 players per round in this order — human (index 0), bandits
// (index 1), wanderer (index 2); see stages/stage2.ts, matching
// Scenario.start()'s registration order.
const HUMANS_THIRD_TURN = turnForPlayer(0, 3, 3);

export function createStage2Narrative(
  humanId: string,
  wandererId: string
): NarrativeScript {
  return [
    {
      id: "stage2-turn-1",
      trigger: { kind: "turn", turn: 1 },
      lines: [
        {
          speaker: "Villager",
          text: "Halt! State your business, stranger. Are you with the bandits?",
        },
        {
          speaker: "Whirley",
          text: "What? No! My ship is stuck. I need a repairman.",
        },
        {
          speaker: "Villager",
          text: "That's exactly what a bandit would say.",
        },
      ],
    },
    {
      id: "stage2-turn-3",
      trigger: { kind: "turn", turn: HUMANS_THIRD_TURN },
      lines: [
        {
          speaker: "Narrator",
          text: "The bandits, noticing Whirley, begin to close in. The Wanderer notices the commotion and edges toward the gate.",
        },
        { speaker: "Whirley", text: "Oh, come ON." },
      ],
    },
    {
      id: "stage2-wanderer-sighted",
      trigger: { kind: "proximity", playerId: humanId, ofPlayerId: wandererId },
      lines: [
        {
          speaker: "Narrator",
          text: "The Wanderer sees you and bolts along the wall.",
        },
      ],
    },
    {
      id: "stage2-reached-gate",
      trigger: { kind: "tileReached", playerId: humanId, sections: ["gate"] },
      endsStage: "win",
      lines: [
        {
          speaker: "Villager",
          text: "He drove off the bandits AND the Wanderer ran from him! Open the gate! Open the gate!",
        },
        {
          speaker: "Whirley",
          text: "I wasn't driving anyone — can someone please just open the gate?",
        },
      ],
    },
    {
      id: "stage2-whirley-defeated",
      trigger: { kind: "lastUnitDefeated", playerId: humanId },
      endsStage: "lose",
      lines: [
        {
          speaker: "Narrator",
          text: "The bandits overwhelm you just short of the gate. The villagers close the shutters.",
        },
      ],
    },
  ];
}
