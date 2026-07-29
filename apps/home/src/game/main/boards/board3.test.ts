import { describe, expect, test } from "vitest";
import { Game } from "../../core/game";
import { hexDistance } from "../../core/grid";
import { createMoveContext, validDirections } from "../../core/player/movement";
import type { Board } from "../../core/board";
import board3Json from "./board3.json";

// The JSON import infers `type: string`, not the `Terrain` enum literal (the
// same reason main/stages/sequence.ts casts board1/2/3.json the same way).
const board3 = board3Json as unknown as Board;

// Sanity-checks the Stage 3 board data itself (specs/11-stage-3.md "Starting
// Conditions"). This is a data fixture, not behavior, so the test loads it
// the same way production does (`new Game(board)`) rather than re-deriving
// the layout.
describe("board3.json (Stage 3 — Let's Be Reasonable)", () => {
  const REQUIRED_SECTIONS = [
    "spawn_a",
    "bandit_4",
    "bandit_5",
    "bandit_6",
    "captain_spawn",
    "campfire",
    "wanderer_spawn",
  ];

  test("declares each required section exactly once", () => {
    for (const name of REQUIRED_SECTIONS) {
      const matches = board3.tiles.filter((t) => t.sectionName === name);
      expect(matches, `section "${name}"`).toHaveLength(1);
    }
  });

  test("standard bandits sit strictly between the entrance and the captain", () => {
    const game = new Game(board3);
    const spawnA = game.world.tileBySection("spawn_a").cube();
    const captain = game.world.tileBySection("captain_spawn").cube();
    const gap = hexDistance(spawnA, captain);

    for (const name of ["bandit_4", "bandit_5", "bandit_6"]) {
      const bandit = game.world.tileBySection(name).cube();
      expect(hexDistance(spawnA, bandit), name).toBeLessThan(gap);
      expect(hexDistance(captain, bandit), name).toBeLessThan(gap);
    }
  });

  test("the campfire sits near the captain, at the center of the camp", () => {
    const game = new Game(board3);
    const captain = game.world.tileBySection("captain_spawn").cube();
    const campfire = game.world.tileBySection("campfire").cube();

    // Distinct tiles (the goal isn't literally where the captain stands), but
    // adjacent — "the campfire section at the center of the camp" (spec 11
    // line 30) alongside "one Bandit Captain spawns at the center" (line 14).
    expect(hexDistance(captain, campfire)).toBe(1);
  });

  test("the Wanderer spawns at the far edge, away from the entrance", () => {
    const game = new Game(board3);
    const spawnA = game.world.tileBySection("spawn_a").cube();
    const campfire = game.world.tileBySection("campfire").cube();
    const wanderer = game.world.tileBySection("wanderer_spawn").cube();

    expect(hexDistance(wanderer, spawnA)).toBeGreaterThan(
      hexDistance(campfire, spawnA)
    );
  });

  // Spec 11 "Starting Conditions": "surrounded by tents on three sides, one
  // open direction toward Whirley." Texture ("water"/"grass") does not block
  // movement in this engine (only occupancy and true grid bounds do — see
  // board1.json, which textures an entire rectangle without blocking
  // anything), so genuine enclosure has to come from the tile array's actual
  // edges. wanderer_spawn sits at a grid corner: of its 6 hex neighbours,
  // only 2 are in-bounds. That's tighter than the spec's literal "three
  // sides" (which would leave 3 open) — a hex corner can't produce exactly
  // that split without also occupying neighbour tiles, which this engine has
  // no "tent" scenery/obstacle concept for — but it's the closest achievable
  // realization of "heavily constrained escape routes," and errs toward
  // *more* enclosed rather than less.
  test("the Wanderer's spawn is enclosed on a grid corner (at most 2 open directions)", () => {
    const game = new Game(board3);
    const tiles = game.world.getState().tiles;
    const wandererTile = tiles.find((t) => t.sectionName === "wanderer_spawn")!;
    const ctx = createMoveContext({ tiles, units: [] });
    const open = validDirections(wandererTile.cube(), ctx);

    expect(open.length).toBeLessThanOrEqual(2);
    expect(open.length).toBeGreaterThan(0); // not a fully sealed dead end
  });
});
