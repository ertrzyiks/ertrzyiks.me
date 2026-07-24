import { turnForPlayer, type NarrativeScript } from "../../core/narrative";
import { BanditCaptain } from "../units";
import type { Unit } from "../../core/units";

// Stage 3 story beats, verbatim from specs/11-stage-3.md's narrative table.
// Player ids match Scenario: the human is "human", the neutral Wanderer owner
// is "wanderer". The "campfire" section is the win tile.
//
// Spec 11's "Turn 4 start" (line 43) is player-facing: the human's 4th turn,
// not the 4th raw engine turn (see turnForPlayer's doc comment — same fix
// Stage 2's "Turn 3" needed). Stage 3 registers 3 players per round in this
// order — human (index 0), bandits (index 1, standard Bandits + the Captain
// share this one faction), wanderer (index 2); see stages/stage3.ts, matching
// Scenario.start()'s registration order.
const HUMANS_FOURTH_TURN = turnForPlayer(0, 3, 4);

// "Bandit Captain defeated" (spec line 44) needs to identify the Captain
// specifically, not any bandit — units are otherwise anonymous mixin
// instances. `instanceof` reads directly off the concrete BanditCaptain
// class (main/units/bandit.ts), so this can't silently drift out of sync
// with its stats the way a hand-duplicated `damage === 12` check could.
const isBanditCaptain = (unit: Unit): boolean => unit instanceof BanditCaptain;

export function createStage3Narrative(
  humanId: string,
  wandererId: string
): NarrativeScript {
  return [
    {
      id: "stage3-turn-1",
      trigger: { kind: "turn", turn: 1 },
      lines: [
        {
          speaker: "Whirley",
          text: "Adults can resolve things peacefully. I'll walk in, explain the situation, and we'll all be home by dinner.",
        },
        { speaker: "Bandit Captain", text: "CHARGE!" },
        {
          speaker: "Whirley",
          text: "WAIT — does anyone here know a ship repairman?!",
        },
      ],
    },
    {
      id: "stage3-turn-4",
      trigger: { kind: "turn", turn: HUMANS_FOURTH_TURN },
      lines: [
        {
          speaker: "Narrator",
          text: "Whirley is making progress, mostly by accident.",
        },
      ],
    },
    {
      id: "stage3-captain-defeated",
      trigger: { kind: "unitDefeated", predicate: isBanditCaptain },
      lines: [
        {
          speaker: "Whirley",
          text: "Look, I'm sure we can still talk about—",
        },
        { speaker: "Narrator", text: "The Captain is not available for talking." },
      ],
    },
    {
      id: "stage3-wanderer-sighted",
      trigger: { kind: "proximity", playerId: humanId, ofPlayerId: wandererId },
      lines: [
        {
          speaker: "Narrator",
          text: "The Wanderer sees you coming. They look left. They look right. There is nowhere to go.",
        },
      ],
    },
    {
      id: "stage3-reached-campfire",
      trigger: { kind: "tileReached", playerId: humanId, sections: ["campfire"] },
      endsStage: "win",
      lines: [
        {
          speaker: "Narrator",
          text: "The bandits are defeated. The Wanderer is cornered by a tent. The Sheriff steps out from behind a rock.",
        },
        {
          speaker: "Sheriff",
          text: "You... you caught the Wanderer. You defeated the bandits. You are the greatest hero this island has ever seen.",
        },
        { speaker: "Whirley", text: "I just want my ship fixed." },
        {
          speaker: "Narrator",
          text: "Three weeks later, a ballad called 'Whirley of the Shore' is being sung in every tavern on the island. Whirley's ship is fixed. He leaves on a Tuesday. Nobody notices.",
        },
      ],
    },
    {
      id: "stage3-whirley-defeated",
      trigger: { kind: "lastUnitDefeated", playerId: humanId },
      endsStage: "lose",
      lines: [
        {
          speaker: "Narrator",
          text: "The bandits overwhelm you. The Wanderer watches from the tent, bewildered.",
        },
      ],
    },
  ];
}
