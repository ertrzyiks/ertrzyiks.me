import { describe, expect, test } from "vitest";
import { createGrid } from "../grid";
import { Terrain } from "../board";
import type { GameTileHex, UnitPosition } from "../board";
import type { State } from "../world";
import { PlayerColor } from "../player/player";
import { Unit, Movable } from "../units";
import {
  destinationReached,
  lastUnitDefeated,
  evaluateEndConditions,
} from "./index";

const human = { id: "human", name: "Human", color: PlayerColor.BLUE };
const wolf = { id: "wolf", name: "Wolf", color: PlayerColor.RED };
const PlainUnit = Movable(Unit, 3);

// Builds a 3x3 grid where the tile at (goalX, goalY) carries `goalSection`.
function makeTiles(goalX: number, goalY: number, goalSection: string): GameTileHex[] {
  const grid = createGrid({
    rows: 3,
    cols: 3,
    tiles: Array.from({ length: 3 }, (_, x) =>
      Array.from({ length: 3 }, (_, y) => ({
        x,
        y,
        type: Terrain.WATER,
        textureName: "grass",
        sectionName: x === goalX && y === goalY ? goalSection : "none",
      }))
    ).flat(),
  });
  const tiles: GameTileHex[] = [];
  grid.forEach((hex) => tiles.push(hex as unknown as GameTileHex));
  return tiles;
}

function tileCube(tiles: GameTileHex[], x: number, y: number) {
  const t = tiles.find((t) => {
    const c = t.coordinates();
    return c.x === x && c.y === y;
  })!;
  return t.cube();
}

function makeState(tiles: GameTileHex[], units: UnitPosition[]): State {
  return {
    players: [human, wolf],
    currentPlayerIndex: 0,
    currentPlayer: human,
    turn: 0,
    tiles,
    units,
    revealedTiles: {},
    outcome: null,
    worldWidth: 300,
    worldHeight: 300,
    cols: 3,
    rows: 3,
  };
}

describe("destinationReached", () => {
  test("true when the player's unit stands on a goal-section tile", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 2, 0), owner: human },
    ]);
    expect(destinationReached("human", ["village"])(state)).toBe(true);
  });

  test("false when the player's unit is elsewhere", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 0, 0), owner: human },
    ]);
    expect(destinationReached("human", ["village"])(state)).toBe(false);
  });

  test("ignores enemy units standing on the goal", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 2, 0), owner: wolf },
    ]);
    expect(destinationReached("human", ["village"])(state)).toBe(false);
  });
});

describe("lastUnitDefeated", () => {
  test("true when the player has no units", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 0, 0), owner: wolf },
    ]);
    expect(lastUnitDefeated("human")(state)).toBe(true);
  });

  test("false while the player still has a unit", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 0, 0), owner: human },
    ]);
    expect(lastUnitDefeated("human")(state)).toBe(false);
  });
});

describe("evaluateEndConditions", () => {
  test("returns win when a win condition is met", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 2, 0), owner: human },
    ]);
    expect(
      evaluateEndConditions(state, {
        win: [destinationReached("human", ["village"])],
        lose: [lastUnitDefeated("human")],
      })
    ).toBe("win");
  });

  test("returns lose when a lose condition is met", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 2, 0), owner: wolf },
    ]);
    expect(
      evaluateEndConditions(state, {
        win: [destinationReached("human", ["village"])],
        lose: [lastUnitDefeated("human")],
      })
    ).toBe("lose");
  });

  test("lose takes priority when win and lose are met at once", () => {
    // A human unit sits on the goal (win) but the wolf owns the only human-less
    // world — construct a case where both fire: human on goal AND no human units
    // is impossible, so simulate simultaneity via two custom conditions.
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 2, 0), owner: human },
    ]);
    expect(
      evaluateEndConditions(state, {
        win: [() => true],
        lose: [() => true],
      })
    ).toBe("lose");
  });

  test("returns null when nothing is met", () => {
    const tiles = makeTiles(2, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 0, 0), owner: human },
    ]);
    expect(
      evaluateEndConditions(state, {
        win: [destinationReached("human", ["village"])],
        lose: [lastUnitDefeated("human")],
      })
    ).toBe(null);
  });
});
