import { describe, expect, test } from "vitest";
import { gameReducer } from "./index";
import { GameEventType } from "../game_event";
import { PlayerColor } from "../player/player";
import { Unit, Movable, Sightful, Damageable, Damaging } from "../units";
import { Terrain } from "../board";
import { createGrid } from "../grid";
import { cubeKey } from "../grid/helpers";
import type { State } from "../world";
import type { GameTileHex } from "../board";

const human = { id: "human", name: "Human", color: PlayerColor.BLUE };
const wolf = { id: "wolf", name: "Wolf", color: PlayerColor.RED };

function makeState(overrides: Partial<State> = {}): State {
  return {
    players: [],
    currentPlayerIndex: null,
    currentPlayer: null,
    tiles: [],
    units: [],
    revealedTiles: {},
    outcome: null,
    worldWidth: 300,
    worldHeight: 200,
    cols: 5,
    rows: 5,
    ...overrides,
  };
}

function makeTiles(cols = 3, rows = 3): GameTileHex[] {
  const board = {
    rows,
    cols,
    tiles: Array.from({ length: cols }, (_, x) =>
      Array.from({ length: rows }, (_, y) => ({
        x,
        y,
        type: Terrain.WATER,
        textureName: "grass",
        sectionName: "none",
      }))
    ).flat(),
  };
  const grid = createGrid(board);
  const tiles: GameTileHex[] = [];
  grid.forEach((hex) => tiles.push(hex as unknown as GameTileHex));
  return tiles;
}

// A simple unit without Sightful so fog reveal is skipped in non-fog tests
const PlainUnit = Movable(Unit, 3);

describe("Spawn", () => {
  test("adds unit to state with owner", () => {
    const unit = new PlainUnit();
    const pos = { q: 0, r: 0, s: 0 };
    const state = gameReducer(makeState(), {
      type: GameEventType.Spawn,
      unit,
      position: pos,
      owner: human,
    });
    expect(state.units).toHaveLength(1);
    expect(state.units[0].unit).toBe(unit);
    expect(state.units[0].owner).toBe(human);
    expect(state.units[0].position).toEqual(pos);
  });

  test("accumulates multiple units", () => {
    let state = makeState();
    state = gameReducer(state, { type: GameEventType.Spawn, unit: new PlainUnit(), position: { q: 0, r: 0, s: 0 }, owner: human });
    state = gameReducer(state, { type: GameEventType.Spawn, unit: new PlainUnit(), position: { q: 1, r: -1, s: 0 }, owner: wolf });
    expect(state.units).toHaveLength(2);
  });

  test("does not reveal tiles for units without Sightful", () => {
    const state = gameReducer(makeState({ tiles: makeTiles() }), {
      type: GameEventType.Spawn,
      unit: new PlainUnit(),
      position: { q: 0, r: 0, s: 0 },
      owner: human,
    });
    expect(state.revealedTiles).toEqual({});
  });

  test("reveals tiles within sightRange on spawn", () => {
    const tiles = makeTiles(5, 5);
    const SightfulUnit = Sightful(Unit, 1);
    const unit = new SightfulUnit();
    // Spawn at the tile that's at grid (2,2) — center of 5x5
    const centerTile = tiles.find((t) => {
      const c = t.coordinates();
      return c.x === 2 && c.y === 2;
    })!;
    const pos = centerTile.cube();

    const state = gameReducer(makeState({ tiles }), {
      type: GameEventType.Spawn,
      unit,
      position: pos,
      owner: human,
    });

    const revealed = state.revealedTiles[human.id];
    expect(revealed).toBeDefined();
    // The spawn tile itself must be revealed
    expect(revealed[cubeKey(pos)]).toBe(true);
    // With range 1, adjacent tiles must also be revealed
    const revealedCount = Object.keys(revealed).length;
    expect(revealedCount).toBeGreaterThanOrEqual(7); // center + up to 6 neighbors
  });

  test("only reveals tiles up to sightRange — tiles beyond are not revealed", () => {
    const tiles = makeTiles(7, 7);
    const SightfulUnit = Sightful(Unit, 1);
    const unit = new SightfulUnit();
    const centerTile = tiles.find((t) => {
      const c = t.coordinates();
      return c.x === 3 && c.y === 3;
    })!;
    const pos = centerTile.cube();

    const state = gameReducer(makeState({ tiles }), {
      type: GameEventType.Spawn,
      unit,
      position: pos,
      owner: human,
    });

    const revealed = state.revealedTiles[human.id];
    const totalTiles = tiles.length; // 49
    const revealedCount = Object.keys(revealed).length;
    // With range 1, at most 7 tiles revealed (1 + 6 neighbors); far fewer than total
    expect(revealedCount).toBeLessThan(totalTiles);
  });

  test("accumulates revealed tiles across multiple spawns", () => {
    const tiles = makeTiles(5, 5);
    const SightfulUnit = Sightful(Unit, 1);

    const tile00 = tiles.find((t) => { const c = t.coordinates(); return c.x === 0 && c.y === 0; })!;
    const tile44 = tiles.find((t) => { const c = t.coordinates(); return c.x === 4 && c.y === 4; })!;

    let state = makeState({ tiles });
    state = gameReducer(state, { type: GameEventType.Spawn, unit: new SightfulUnit(), position: tile00.cube(), owner: human });
    const countAfterFirst = Object.keys(state.revealedTiles[human.id] || {}).length;

    state = gameReducer(state, { type: GameEventType.Spawn, unit: new SightfulUnit(), position: tile44.cube(), owner: human });
    const countAfterSecond = Object.keys(state.revealedTiles[human.id] || {}).length;

    expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
  });

  test("tracks revealed tiles per player independently", () => {
    const tiles = makeTiles(5, 5);
    const SightfulUnit = Sightful(Unit, 1);

    const tile00 = tiles.find((t) => { const c = t.coordinates(); return c.x === 0 && c.y === 0; })!;
    const tile44 = tiles.find((t) => { const c = t.coordinates(); return c.x === 4 && c.y === 4; })!;

    let state = makeState({ tiles });
    state = gameReducer(state, { type: GameEventType.Spawn, unit: new SightfulUnit(), position: tile00.cube(), owner: human });
    state = gameReducer(state, { type: GameEventType.Spawn, unit: new SightfulUnit(), position: tile44.cube(), owner: wolf });

    expect(state.revealedTiles[human.id]).toBeDefined();
    expect(state.revealedTiles[wolf.id]).toBeDefined();
    expect(state.revealedTiles[human.id]).not.toEqual(state.revealedTiles[wolf.id]);
  });
});

describe("Move", () => {
  test("updates unit position", () => {
    const unit = new PlainUnit();
    unit.replenish();
    const initial = { q: 0, r: 0, s: 0 };
    const next = { q: 1, r: -1, s: 0 };

    let state = makeState({ units: [{ unit, position: initial, owner: human }] });
    state = gameReducer(state, { type: GameEventType.Move, unit, position: next });

    expect(state.units[0].position).toEqual(next);
  });

  test("calls step(1) on movable units, consuming one movement point", () => {
    const unit = new (Movable(Unit, 1))();
    unit.replenish();
    const state = makeState({ units: [{ unit, position: { q: 0, r: 0, s: 0 }, owner: human }] });
    gameReducer(state, { type: GameEventType.Move, unit, position: { q: 1, r: -1, s: 0 } });
    expect(unit.canMove()).toBe(false);
  });

  test("does not affect other units positions", () => {
    const unitA = new PlainUnit();
    unitA.replenish();
    const unitB = new PlainUnit();
    const posA = { q: 0, r: 0, s: 0 };
    const posB = { q: 2, r: -2, s: 0 };
    const newPosA = { q: 1, r: -1, s: 0 };

    let state = makeState({ units: [{ unit: unitA, position: posA, owner: human }, { unit: unitB, position: posB, owner: wolf }] });
    state = gameReducer(state, { type: GameEventType.Move, unit: unitA, position: newPosA });

    expect(state.units.find((u) => u.unit === unitB)!.position).toEqual(posB);
  });

  test("reveals tiles around new position for sightful units", () => {
    const tiles = makeTiles(5, 5);
    const SightfulUnit = Sightful(Unit, 1);
    const unit = new SightfulUnit();

    const tile11 = tiles.find((t) => { const c = t.coordinates(); return c.x === 1 && c.y === 1; })!;
    const tile33 = tiles.find((t) => { const c = t.coordinates(); return c.x === 3 && c.y === 3; })!;

    let state = makeState({ tiles, units: [{ unit, position: tile11.cube(), owner: human }] });
    const keyAt33 = cubeKey(tile33.cube());

    // Before move, tile33 should not be revealed
    expect(state.revealedTiles[human.id]?.[keyAt33]).toBeUndefined();

    state = gameReducer(state, { type: GameEventType.Move, unit, position: tile33.cube() });

    expect(state.revealedTiles[human.id]?.[keyAt33]).toBe(true);
  });

  test("does not reveal tiles for units without Sightful", () => {
    const tiles = makeTiles(3, 3);
    const unit = new PlainUnit();
    unit.replenish();

    const tile00 = tiles.find((t) => { const c = t.coordinates(); return c.x === 0 && c.y === 0; })!;
    const tile11 = tiles.find((t) => { const c = t.coordinates(); return c.x === 1 && c.y === 1; })!;

    let state = makeState({ tiles, units: [{ unit, position: tile00.cube(), owner: human }] });
    state = gameReducer(state, { type: GameEventType.Move, unit, position: tile11.cube() });

    expect(state.revealedTiles).toEqual({});
  });

  test("rejects a move onto a hex occupied by another unit (spec 02)", () => {
    const mover = new PlainUnit();
    mover.replenish();
    const blocker = new PlainUnit();
    const start = { q: 0, r: 0, s: 0 };
    const occupied = { q: 1, r: -1, s: 0 };

    let state = makeState({
      units: [
        { unit: mover, position: start, owner: human },
        { unit: blocker, position: occupied, owner: wolf },
      ],
    });
    const next = gameReducer(state, {
      type: GameEventType.Move,
      unit: mover,
      position: occupied,
    });

    // Move had no effect: the mover stayed put and did not spend a movement point.
    expect(next.units.find((u) => u.unit === mover)!.position).toEqual(start);
    expect(mover.canMove()).toBe(true);
    expect(next).toBe(state);
  });

  test("rejects a move by a unit with zero movement budget (spec 02)", () => {
    // Budget 1, replenished then spent — a second move must be rejected.
    const unit = new (Movable(Unit, 1))();
    unit.replenish();
    const start = { q: 0, r: 0, s: 0 };
    const first = { q: 1, r: -1, s: 0 };
    const second = { q: 2, r: -2, s: 0 };

    let state = makeState({ units: [{ unit, position: start, owner: human }] });
    state = gameReducer(state, { type: GameEventType.Move, unit, position: first });
    expect(unit.canMove()).toBe(false);
    expect(state.units[0].position).toEqual(first);

    // Second move: no budget → rejected, position unchanged.
    const blocked = gameReducer(state, { type: GameEventType.Move, unit, position: second });
    expect(blocked.units[0].position).toEqual(first);
    expect(blocked).toBe(state);
  });
});

describe("TakeDamage", () => {
  const Attacker = Damaging(Unit, 10);
  const Target = Damageable(Unit, 25);

  test("reduces the target's HP and keeps a survivor on the board", () => {
    const attacker = new Attacker();
    attacker.replenish();
    const target = new Target();
    target.replenish(); // 25 HP

    let state = makeState({
      units: [
        { unit: attacker, position: { q: 0, r: 0, s: 0 }, owner: human },
        { unit: target, position: { q: 1, r: -1, s: 0 }, owner: wolf },
      ],
    });
    state = gameReducer(state, {
      type: GameEventType.TakeDamage,
      inflictor: attacker,
      target,
      damage: 10,
    });

    expect(state.units).toHaveLength(2);
    expect(target.isAlive()).toBe(true); // 25 - 10 = 15
  });

  test("removes a target reduced to <= 0 HP from the board", () => {
    const attacker = new Attacker();
    attacker.replenish();
    const target = new (Damageable(Unit, 8))();
    target.replenish(); // 8 HP, killed by 10 damage

    let state = makeState({
      units: [
        { unit: attacker, position: { q: 0, r: 0, s: 0 }, owner: human },
        { unit: target, position: { q: 1, r: -1, s: 0 }, owner: wolf },
      ],
    });
    state = gameReducer(state, {
      type: GameEventType.TakeDamage,
      inflictor: attacker,
      target,
      damage: 10,
    });

    expect(state.units).toHaveLength(1);
    expect(state.units[0].unit).toBe(attacker);
  });

  test("consumes the attacker's attack charge", () => {
    const attacker = new Attacker();
    attacker.replenish();
    const target = new Target();
    target.replenish();

    expect(attacker.canAttack()).toBe(true);
    const state = makeState({
      units: [
        { unit: attacker, position: { q: 0, r: 0, s: 0 }, owner: human },
        { unit: target, position: { q: 1, r: -1, s: 0 }, owner: wolf },
      ],
    });
    gameReducer(state, {
      type: GameEventType.TakeDamage,
      inflictor: attacker,
      target,
      damage: 10,
    });
    expect(attacker.canAttack()).toBe(false);
  });

  test("does not remove other units that merely read as 0 HP (unreplenished)", () => {
    const attacker = new Attacker();
    attacker.replenish();
    const target = new Target();
    target.replenish();
    // A bystander spawned but not yet replenished reads as 0 HP / not alive.
    const bystander = new Target();
    expect(bystander.isAlive()).toBe(false);

    let state = makeState({
      units: [
        { unit: attacker, position: { q: 0, r: 0, s: 0 }, owner: human },
        { unit: target, position: { q: 1, r: -1, s: 0 }, owner: wolf },
        { unit: bystander, position: { q: 2, r: -2, s: 0 }, owner: wolf },
      ],
    });
    state = gameReducer(state, {
      type: GameEventType.TakeDamage,
      inflictor: attacker,
      target,
      damage: 10,
    });

    // target survived (25-10) and bystander is untouched despite reading 0 HP.
    expect(state.units.some((u) => u.unit === bystander)).toBe(true);
    expect(state.units).toHaveLength(3);
  });
});

describe("StartTurn", () => {
  test("sets currentPlayer to the first registered player on first turn", () => {
    let state = makeState({ players: [human, wolf] });
    state = gameReducer(state, { type: GameEventType.StartTurn });
    expect(state.currentPlayer).toEqual(human);
    expect(state.currentPlayerIndex).toBe(0);
  });

  test("rotates to the next player on subsequent turns", () => {
    let state = makeState({ players: [human, wolf] });
    state = gameReducer(state, { type: GameEventType.StartTurn });
    state = gameReducer(state, { type: GameEventType.EndTurn });
    state = gameReducer(state, { type: GameEventType.StartTurn });
    expect(state.currentPlayer).toEqual(wolf);
    expect(state.currentPlayerIndex).toBe(1);
  });

  test("wraps back to first player after all players have acted", () => {
    let state = makeState({ players: [human, wolf] });
    state = gameReducer(state, { type: GameEventType.StartTurn });
    state = gameReducer(state, { type: GameEventType.EndTurn });
    state = gameReducer(state, { type: GameEventType.StartTurn });
    state = gameReducer(state, { type: GameEventType.EndTurn });
    state = gameReducer(state, { type: GameEventType.StartTurn });
    expect(state.currentPlayer).toEqual(human);
  });

  test("replenishes units belonging to the current player", () => {
    const heroUnit = new PlainUnit();
    let state = makeState({
      players: [human],
      units: [{ unit: heroUnit, position: { q: 0, r: 0, s: 0 }, owner: human }],
    });
    expect(heroUnit.canMove()).toBe(false);
    gameReducer(state, { type: GameEventType.StartTurn });
    expect(heroUnit.canMove()).toBe(true);
  });

  test("does not replenish units belonging to other players", () => {
    const wolfUnit = new PlainUnit();
    let state = makeState({
      players: [human, wolf],
      units: [{ unit: wolfUnit, position: { q: 0, r: 0, s: 0 }, owner: wolf }],
    });
    // StartTurn activates human (players[0])
    gameReducer(state, { type: GameEventType.StartTurn });
    expect(wolfUnit.canMove()).toBe(false);
  });
});

describe("GameEnd", () => {
  test("records the outcome on the state", () => {
    const state = gameReducer(makeState(), {
      type: GameEventType.GameEnd,
      outcome: "win",
    });
    expect(state.outcome).toBe("win");
  });

  test("records a lose outcome", () => {
    const state = gameReducer(makeState(), {
      type: GameEventType.GameEnd,
      outcome: "lose",
    });
    expect(state.outcome).toBe("lose");
  });
});

describe("terminal state", () => {
  test("rejects a Move once the game has ended", () => {
    const unit = new PlainUnit();
    const ended = makeState({
      outcome: "win",
      players: [human],
      units: [{ unit, position: { q: 0, r: 0, s: 0 }, owner: human }],
    });
    const next = gameReducer(ended, {
      type: GameEventType.Move,
      unit,
      position: { q: 1, r: 0, s: -1 },
    });
    // Position unchanged: the action was ignored.
    expect(next.units[0].position).toEqual({ q: 0, r: 0, s: 0 });
    expect(next).toBe(ended);
  });

  test("rejects StartTurn once the game has ended", () => {
    const ended = makeState({ outcome: "lose", players: [human, wolf] });
    const next = gameReducer(ended, { type: GameEventType.StartTurn });
    expect(next).toBe(ended);
    expect(next.currentPlayer).toBe(null);
  });

  test("rejects TakeDamage once the game has ended", () => {
    const target = new (Damageable(Unit, 10))();
    target.replenish(); // full HP so aliveness reflects the (blocked) damage only
    const inflictor = new (Damaging(Unit, 5))();
    const ended = makeState({
      outcome: "win",
      units: [{ unit: target, position: { q: 0, r: 0, s: 0 }, owner: human }],
    });
    const next = gameReducer(ended, {
      type: GameEventType.TakeDamage,
      target,
      inflictor,
      damage: 999,
    });
    // Terminal state short-circuits before any damage is applied: the target
    // keeps full HP and stays on the board.
    expect(target.isAlive()).toBe(true);
    expect(next.units).toHaveLength(1);
    expect(next).toBe(ended);
  });

  test("still records a GameEnd (idempotent) after the game has ended", () => {
    const ended = makeState({ outcome: "win" });
    const next = gameReducer(ended, {
      type: GameEventType.GameEnd,
      outcome: "lose",
    });
    expect(next.outcome).toBe("lose");
  });
});
