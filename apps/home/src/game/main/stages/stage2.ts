import { PlayerColor } from "../../core/player/player";
import { Hero, Bandit, Wanderer } from "../units";
import { SeekerBehavior } from "../../core/player/seeker_behavior";
import { FleeBehavior } from "../../core/player/flee_behavior";
import type { StageDefinition } from "./stage";

/**
 * Stage 2 — The Gate (specs/10-stage-2.md). Whirley (one Hero unit) crosses
 * the road; three bandits each hunt him independently (no pack coordination,
 * unlike Stage 1's wolves), and the neutral Wanderer flees on sight. Win:
 * reach the gate.
 *
 * A factory, matching `createStage1Definition`'s shape: fresh Player objects
 * per call, ready for a stage reload once that's wired up.
 */
export function createStage2Definition(): StageDefinition {
  const player = { id: "human", name: "Adventurer", color: PlayerColor.BLUE };
  const banditPlayer = { id: "bandits", name: "Bandits", color: PlayerColor.RED };
  // Neutral NPC owner for the Wanderer. Registered last (end of `enemies`) so
  // it takes its turn after the bandits — spec 06 requires the Wanderer to
  // act last in the CPU turn.
  const wandererPlayer = { id: "wanderer", name: "Wanderer", color: PlayerColor.GREEN };

  return {
    player,
    playerSpawns: [{ section: "spawn_a", createUnit: () => new Hero() }],
    enemies: [
      {
        player: banditPlayer,
        spawns: [
          { section: "bandit_1", createUnit: () => new Bandit() },
          { section: "bandit_2", createUnit: () => new Bandit() },
          { section: "bandit_3", createUnit: () => new Bandit() },
        ],
        turnEventName: "banditTurn",
        createBehavior: (store) => new SeekerBehavior(store, { huntFor: [player.id] }),
      },
      {
        player: wandererPlayer,
        spawns: [{ section: "wanderer_spawn", createUnit: () => new Wanderer() }],
        turnEventName: "wandererTurn",
        createBehavior: (store) => new FleeBehavior(store, { fleeFrom: [player.id] }),
      },
    ],
    winSection: "gate",
  };
}
