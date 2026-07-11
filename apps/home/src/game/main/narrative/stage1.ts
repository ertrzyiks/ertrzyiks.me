import type { NarrativeScript } from "../../core/narrative";

// Stage 1 story beats, verbatim from specs/09-stage-1.md's narrative table. The
// engine (core) decides *when* each fires; this is the declarative script the
// engine consumes. Player ids match Scenario: the human is "human", the neutral
// Wanderer owner is "wanderer". The "village" section is the win tile.
//
// endsStage is set on the win/lose beats for documentation: the actual GameEnd is
// still driven by core/conditions in the Game, which the renderer sequences to
// fire *after* the dialog is dismissed (the narrative subscriber holds the world
// observable open until the player reads the beat). See specs/07-narrative-events.md.
export function createStage1Narrative(
  humanId: string,
  wandererId: string
): NarrativeScript {
  return [
    {
      id: "stage1-turn-1",
      trigger: { kind: "turn", turn: 1 },
      lines: [
        {
          speaker: "Whirley",
          text: "If I find a repairman by noon I only lose two days. The forest doesn't look that big.",
        },
      ],
    },
    {
      id: "stage1-wanderer-sighted",
      trigger: { kind: "proximity", playerId: humanId, ofPlayerId: wandererId },
      lines: [
        {
          speaker: "Narrator",
          text: "A figure darts between the trees ahead of you. Fast. Panicked. Gone.",
        },
      ],
    },
    {
      id: "stage1-reached-village",
      trigger: { kind: "tileReached", playerId: humanId, sections: ["village"] },
      endsStage: "win",
      lines: [
        {
          speaker: "Villager",
          text: "Did you just walk through the Howling Forest? Alone? And you flushed out the Wanderer?!",
        },
        {
          speaker: "Whirley",
          text: "I need a repairman. Is there a gate around here?",
        },
      ],
    },
    {
      id: "stage1-whirley-defeated",
      trigger: { kind: "lastUnitDefeated", playerId: humanId },
      endsStage: "lose",
      lines: [
        {
          speaker: "Narrator",
          text: "The wolves bring you down well short of the village. The ship will be stuck a while longer.",
        },
      ],
    },
  ];
}
