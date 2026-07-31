import { describe, expect, test } from "vitest";
import { Game } from "../../core/game";
import { hexDistance } from "../../core/grid";
import type { Board } from "../../core/board";
import board2Json from "./board2.json";

// The JSON import infers `type: string`, not the `Terrain` enum literal (the
// same reason main/stages/sequence.ts casts board1/2/3.json the same way).
const board2 = board2Json as unknown as Board;

// Sanity-checks the Stage 2 board data itself (specs/10-stage-2.md
// "Starting Conditions"): every section the scenario will need exists exactly
// once, and their rough spatial arrangement — entrance, then bandits, then the
// gate, with the Wanderer nearer the gate than the entrance — actually holds.
// This is a data fixture, not behavior, so the test loads it the same way
// production does (`new Game(board)`) rather than re-deriving the layout.
describe("board2.json (Stage 2 — The Gate)", () => {
  const REQUIRED_SECTIONS = [
    "spawn_a",
    "bandit_1",
    "bandit_2",
    "bandit_3",
    "wanderer_spawn",
    "gate",
  ];

  test("is roughly the ~8x6 size the spec calls for", () => {
    expect(board2.cols).toBe(8);
    expect(board2.rows).toBe(6);
  });

  test("declares each required section exactly once", () => {
    for (const name of REQUIRED_SECTIONS) {
      const matches = board2.tiles.filter((t) => t.sectionName === name);
      expect(matches, `section "${name}"`).toHaveLength(1);
    }
  });

  test("bandits patrol strictly between the entrance and the gate", () => {
    const game = new Game(board2);
    const spawnA = game.world.tileBySection("spawn_a").cube();
    const gate = game.world.tileBySection("gate").cube();
    const gap = hexDistance(spawnA, gate);

    for (const name of ["bandit_1", "bandit_2", "bandit_3"]) {
      const bandit = game.world.tileBySection(name).cube();
      expect(hexDistance(spawnA, bandit), name).toBeLessThan(gap);
      expect(hexDistance(gate, bandit), name).toBeLessThan(gap);
    }
  });

  test("the Wanderer spawns nearer the gate than the entrance", () => {
    const game = new Game(board2);
    const spawnA = game.world.tileBySection("spawn_a").cube();
    const gate = game.world.tileBySection("gate").cube();
    const wanderer = game.world.tileBySection("wanderer_spawn").cube();

    expect(hexDistance(wanderer, gate)).toBeLessThan(
      hexDistance(wanderer, spawnA)
    );
  });
});
