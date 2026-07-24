import { PlayerColor } from "../../core/player/player";
import { Hero, Bandit, BanditCaptain, Wanderer } from "../units";
import { SeekerBehavior } from "../../core/player/seeker_behavior";
import { FleeBehavior } from "../../core/player/flee_behavior";
import type { StageDefinition } from "./stage";

/**
 * Stage 3 — Let's Be Reasonable (specs/11-stage-3.md). Whirley (one Hero
 * unit) crosses the camp; three standard Bandits and one higher-stat Bandit
 * Captain share a single faction, all hunting him independently via
 * SeekerBehavior (spec 11 "Behavior: seeker" applies to the Captain too — no
 * separate AI class needed, only different unit stats). "Standard bandits
 * engage Whirley before the Captain" (spec 11 "Stage Characteristics") is not
 * special-cased here: it falls out naturally from board3.json's positioning
 * (the standard bandits sit closer to the entrance than the Captain), the
 * same way Stage 2's bandits already work. The neutral Wanderer flees on
 * sight, registered last. Win: reach the campfire.
 *
 * A factory, matching `createStage1Definition`/`createStage2Definition`'s
 * shape: fresh Player objects per call, ready for a stage reload.
 */
export function createStage3Definition(): StageDefinition {
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
          { section: "bandit_4", createUnit: () => new Bandit() },
          { section: "bandit_5", createUnit: () => new Bandit() },
          { section: "bandit_6", createUnit: () => new Bandit() },
          { section: "captain_spawn", createUnit: () => new BanditCaptain() },
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
    winSection: "campfire",
  };
}
