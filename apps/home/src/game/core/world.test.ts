import { describe, expect, test } from "vitest";
import { World } from "./world";
import { createGrid } from "./grid";
import { GameEventType } from "./game_event";
import { PlayerColor } from "./player/player";
import { Unit, Movable } from "./units";
import { Terrain } from "./board";

const human = { id: "human", name: "Human", color: PlayerColor.BLUE };
const wolf = { id: "wolf", name: "Wolf", color: PlayerColor.RED };

function makeWorld() {
  const grid = createGrid({
    rows: 3,
    cols: 3,
    tiles: [
      { x: 0, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "spawn_a" },
      { x: 1, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "goal" },
      { x: 2, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "none" },
      { x: 0, y: 1, type: Terrain.WATER, textureName: "grass", sectionName: "none" },
      { x: 1, y: 1, type: Terrain.WATER, textureName: "grass", sectionName: "none" },
      { x: 2, y: 1, type: Terrain.WATER, textureName: "grass", sectionName: "none" },
      { x: 0, y: 2, type: Terrain.WATER, textureName: "grass", sectionName: "none" },
      { x: 1, y: 2, type: Terrain.WATER, textureName: "grass", sectionName: "none" },
      { x: 2, y: 2, type: Terrain.WATER, textureName: "grass", sectionName: "none" },
    ],
  });
  return new World(grid);
}

const PlainUnit = Movable(Unit, 3);

describe("World.tileBySection", () => {
  test("returns the tile with the matching sectionName", () => {
    const world = makeWorld();
    const tile = world.tileBySection("spawn_a");
    expect(tile.sectionName).toBe("spawn_a");
  });

  test("returns a different tile for a different section", () => {
    const world = makeWorld();
    const spawnA = world.tileBySection("spawn_a");
    const goal = world.tileBySection("goal");
    expect(spawnA).not.toBe(goal);
    expect(goal.sectionName).toBe("goal");
  });

  test("falls back to tiles[0] when section is not found", () => {
    const world = makeWorld();
    const fallback = world.tileBySection("does_not_exist");
    expect(fallback).toBe(world.getState().tiles[0]);
  });
});

describe("World.unitsOf", () => {
  test("returns only units belonging to the given player", () => {
    const world = makeWorld();
    const heroUnit = new PlainUnit();
    const wolfUnit = new PlainUnit();

    world.dispatch({ type: GameEventType.Spawn, unit: heroUnit, position: { q: 0, r: 0, s: 0 }, owner: human });
    world.dispatch({ type: GameEventType.Spawn, unit: wolfUnit, position: { q: 1, r: -1, s: 0 }, owner: wolf });

    const humanUnits = world.unitsOf(human);
    expect(humanUnits).toHaveLength(1);
    expect(humanUnits[0].unit).toBe(heroUnit);

    const wolfUnits = world.unitsOf(wolf);
    expect(wolfUnits).toHaveLength(1);
    expect(wolfUnits[0].unit).toBe(wolfUnit);
  });

  test("returns empty array when player has no units", () => {
    const world = makeWorld();
    world.dispatch({ type: GameEventType.Spawn, unit: new PlainUnit(), position: { q: 0, r: 0, s: 0 }, owner: human });
    expect(world.unitsOf(wolf)).toHaveLength(0);
  });

  test("returns all units for a player with multiple units", () => {
    const world = makeWorld();
    world.dispatch({ type: GameEventType.Spawn, unit: new PlainUnit(), position: { q: 0, r: 0, s: 0 }, owner: wolf });
    world.dispatch({ type: GameEventType.Spawn, unit: new PlainUnit(), position: { q: 1, r: -1, s: 0 }, owner: wolf });
    world.dispatch({ type: GameEventType.Spawn, unit: new PlainUnit(), position: { q: 0, r: 1, s: -1 }, owner: wolf });
    expect(world.unitsOf(wolf)).toHaveLength(3);
  });
});
