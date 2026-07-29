import { Terrain, type Board } from "../../core/board";
import { PlayerColor } from "../../core/player/player";
import { Hero } from "../units";
import type { StageDefinition } from "../stages/stage";
import type { NarrativeScript } from "../../core/narrative";

// Deliberately minimal (docs/adr/0001): two adjacent tiles, one Hero, no
// enemies. Enough to drive the real click -> select -> click -> move path
// through MainWorld without mounting Stage 1's wolves or narrative.
export function createHarnessBoard(): Board {
  return {
    rows: 1,
    cols: 2,
    tiles: [
      { x: 0, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "harness_start" },
      { x: 1, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "harness_next" },
    ],
  };
}

export function createHarnessDefinition(): StageDefinition {
  return {
    player: { id: "human", name: "Harness Hero", color: PlayerColor.BLUE },
    playerSpawns: [{ section: "harness_start", createUnit: () => new Hero() }],
    enemies: [],
    winSection: "harness_next",
  };
}

// Opt-in only (interaction-harness.astro's default stays `[]` per docs/adr/0001
// — most interaction tests want input wiring with nothing else in the way).
// Exists for interaction/move-into-narrative-trigger.spec.ts: Observable.push()
// (shared/observable.ts) notifies subscribers synchronously, so a move that
// steps onto a tileReached section fires this beat's dialog inside the same
// moveUnit() call handleTileClick (main/game_world.ts) is still running —
// regression-testing that requires a real (if minimal) narrative trigger, not
// mounting all of Stage 1's wolves/dialogs the way ADR 0001 explicitly rejected.
export function createHarnessNarrativeScript(): NarrativeScript {
  return [
    {
      id: "harness-reached-next",
      trigger: { kind: "tileReached", playerId: "human", sections: ["harness_next"] },
      lines: [{ text: "You've arrived." }],
    },
  ];
}
