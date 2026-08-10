import { PlayerColor } from "../../core/player/player";
import { Hero, PackLeader, PackFollower, Wanderer } from "../units";
import { PackBehavior, createPackMemory } from "../../core/player/pack_behavior";
import { FleeBehavior } from "../../core/player/flee_behavior";
import type { StageDefinition } from "./stage";

/**
 * Stage 1 — The Wreck (specs/09-stage-1.md). Whirley (a single Hero unit)
 * crosses the beach; a wolf pack roams, and the neutral Wanderer flees on
 * sight. Win: reach the village.
 *
 * A factory, not a static object: pack memory is per-playthrough state (the
 * leader's no-backtrack history), so each call — i.e. each stage load —
 * starts with fresh Player objects and a fresh pack memory, matching spec 08
 * "stage reset" semantics once something calls this again on reload.
 */
export function createStage1Definition(): StageDefinition {
  const player = { id: "human", name: "Adventurer", color: PlayerColor.BLUE };
  const wolfPlayer = { id: "wolves", name: "Pack", color: PlayerColor.RED };
  // Neutral NPC owner for the Wanderer. Registered last (end of `enemies`) so
  // it takes its turn after the wolves — spec 06 requires the Wanderer to act
  // last in the CPU turn.
  const wandererPlayer = { id: "wanderer", name: "Wanderer", color: PlayerColor.GREEN };
  const packMemory = createPackMemory();

  return {
    player,
    // Issue #330: a single Hero, matching specs/09-stage-1.md's "Starting
    // Conditions" ("Whirley spawns...", singular) and Stage 2/3's own
    // one-Hero rosters — a second Hero at "spawn_b" (board1.json) had drifted
    // in without ever being reflected in the spec.
    playerSpawns: [{ section: "spawn_a", createUnit: () => new Hero() }],
    enemies: [
      {
        player: wolfPlayer,
        spawns: [
          { section: "wolf_1", createUnit: () => new PackLeader() },
          { section: "wolf_2", createUnit: () => new PackFollower() },
          { section: "wolf_3", createUnit: () => new PackFollower() },
        ],
        turnEventName: "wolfTurn",
        createBehavior: (store) => new PackBehavior(store, packMemory),
      },
      {
        player: wandererPlayer,
        spawns: [{ section: "wanderer_spawn", createUnit: () => new Wanderer() }],
        turnEventName: "wandererTurn",
        createBehavior: (store) => new FleeBehavior(store, { fleeFrom: [player.id] }),
      },
    ],
    winSection: "village",
  };
}
