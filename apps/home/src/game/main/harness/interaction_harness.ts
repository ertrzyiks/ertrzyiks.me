import { Terrain, type Board } from "../../core/board";
import { PlayerColor } from "../../core/player/player";
import { Hero } from "../units";
import type { StageDefinition } from "../stages/stage";

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
