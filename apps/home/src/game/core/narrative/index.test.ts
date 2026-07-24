import { describe, expect, test } from "vitest";
import { createGrid } from "../grid";
import { Terrain } from "../board";
import type { GameTileHex, UnitPosition } from "../board";
import type { State } from "../world";
import { PlayerColor } from "../player/player";
import { Unit, Movable, Sightful, Damageable } from "../units";
import { GameEventType, type GameEvent } from "../game_event";
import {
  NarrativeEngine,
  triggerMatches,
  turnForPlayer,
  type NarrativeScript,
} from "./index";

const human = { id: "human", name: "Human", color: PlayerColor.BLUE };
const wanderer = { id: "wanderer", name: "Wanderer", color: PlayerColor.GREEN };

const PlainUnit = Movable(Unit, 3);
const Watcher = Sightful(Movable(Unit, 3), 2); // sight range 2, like the Wanderer
const Mortal = Damageable(Unit, 10);

// Builds a 5x5 grid where the tile at (secX, secY) carries `section`.
function makeTiles(secX: number, secY: number, section: string): GameTileHex[] {
  const grid = createGrid({
    rows: 5,
    cols: 5,
    tiles: Array.from({ length: 5 }, (_, x) =>
      Array.from({ length: 5 }, (_, y) => ({
        x,
        y,
        type: Terrain.WATER,
        textureName: "grass",
        sectionName: x === secX && y === secY ? section : "none",
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

function makeState(
  tiles: GameTileHex[],
  units: UnitPosition[],
  turn = 0
): State {
  return {
    players: [human, wanderer],
    currentPlayerIndex: 0,
    currentPlayer: human,
    turn,
    tiles,
    units,
    revealedTiles: {},
    outcome: null,
    worldWidth: 500,
    worldHeight: 500,
    cols: 5,
    rows: 5,
  };
}

const startTurn: GameEvent = { type: GameEventType.StartTurn };
const move: GameEvent = {
  type: GameEventType.Move,
  unit: new PlainUnit(),
  position: { q: 0, r: 0, s: 0 },
};
const takeDamage = (): GameEvent => ({
  type: GameEventType.TakeDamage,
  target: new Mortal(),
  inflictor: new Mortal(),
  damage: 5,
});

describe("turnForPlayer", () => {
  test("the first player's first turn is the first StartTurn", () => {
    expect(turnForPlayer(0, 3, 1)).toBe(1);
  });

  test("each player's first turn is offset by registration order", () => {
    expect(turnForPlayer(0, 3, 1)).toBe(1); // 1st player (human)
    expect(turnForPlayer(1, 3, 1)).toBe(2); // 2nd player (e.g. bandits)
    expect(turnForPlayer(2, 3, 1)).toBe(3); // 3rd player (e.g. wanderer)
  });

  test("the first player's 3rd turn in a 3-player rotation is the 7th StartTurn", () => {
    // human, bandits, wanderer, human, bandits, wanderer, human <- 7th
    expect(turnForPlayer(0, 3, 3)).toBe(7);
  });

  test("a 2-player rotation advances one turn per round", () => {
    expect(turnForPlayer(0, 2, 1)).toBe(1);
    expect(turnForPlayer(0, 2, 2)).toBe(3);
    expect(turnForPlayer(1, 2, 2)).toBe(4);
  });
});

describe("triggerMatches — turn", () => {
  test("fires on StartTurn when the turn number matches", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [], 1);
    expect(
      triggerMatches({ kind: "turn", turn: 1 }, state, startTurn)
    ).toBe(true);
  });

  test("does not fire on a non-StartTurn action even at the right turn", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [], 1);
    expect(triggerMatches({ kind: "turn", turn: 1 }, state, move)).toBe(false);
  });

  test("does not fire on a different turn", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [], 2);
    expect(
      triggerMatches({ kind: "turn", turn: 1 }, state, startTurn)
    ).toBe(false);
  });
});

describe("triggerMatches — tileReached", () => {
  test("fires when the player's unit stands on a named section after a Move", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 4, 0), owner: human },
    ]);
    expect(
      triggerMatches(
        { kind: "tileReached", playerId: "human", sections: ["village"] },
        state,
        move
      )
    ).toBe(true);
  });

  test("ignores non-Move actions", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 4, 0), owner: human },
    ]);
    expect(
      triggerMatches(
        { kind: "tileReached", playerId: "human", sections: ["village"] },
        state,
        startTurn
      )
    ).toBe(false);
  });

  test("ignores other players standing on the section", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 4, 0), owner: wanderer },
    ]);
    expect(
      triggerMatches(
        { kind: "tileReached", playerId: "human", sections: ["village"] },
        state,
        move
      )
    ).toBe(false);
  });
});

describe("triggerMatches — lastUnitDefeated", () => {
  test("fires on TakeDamage when the player has no units left", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 0, 0), owner: wanderer },
    ]);
    expect(
      triggerMatches({ kind: "lastUnitDefeated", playerId: "human" }, state, takeDamage())
    ).toBe(true);
  });

  test("does not fire while the player still has a unit", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 0, 0), owner: human },
    ]);
    expect(
      triggerMatches({ kind: "lastUnitDefeated", playerId: "human" }, state, takeDamage())
    ).toBe(false);
  });

  test("does not fire on a Move even with no units (avoids spawn-order false fires)", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, []);
    expect(
      triggerMatches({ kind: "lastUnitDefeated", playerId: "human" }, state, move)
    ).toBe(false);
  });
});

describe("triggerMatches — unitDefeated", () => {
  const isWatcher = (u: Unit) => u instanceof Watcher;

  test("fires on TakeDamage once no matching unit remains", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 0, 0), owner: human },
    ]);
    expect(
      triggerMatches({ kind: "unitDefeated", predicate: isWatcher }, state, takeDamage())
    ).toBe(true);
  });

  test("does not fire while a matching unit is alive", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new Watcher(), position: tileCube(tiles, 0, 0), owner: wanderer },
    ]);
    expect(
      triggerMatches({ kind: "unitDefeated", predicate: isWatcher }, state, takeDamage())
    ).toBe(false);
  });
});

describe("triggerMatches — proximity", () => {
  test("fires when a player unit is within the watcher's sight range on a Move", () => {
    const tiles = makeTiles(4, 0, "village");
    // watcher at (2,2), human two tiles away — within sight range 2.
    const state = makeState(tiles, [
      { unit: new Watcher(), position: tileCube(tiles, 2, 2), owner: wanderer },
      { unit: new PlainUnit(), position: tileCube(tiles, 3, 2), owner: human },
    ]);
    expect(
      triggerMatches(
        { kind: "proximity", playerId: "human", ofPlayerId: "wanderer" },
        state,
        move
      )
    ).toBe(true);
  });

  test("does not fire when the player unit is out of sight range", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new Watcher(), position: tileCube(tiles, 0, 0), owner: wanderer },
      { unit: new PlainUnit(), position: tileCube(tiles, 4, 4), owner: human },
    ]);
    expect(
      triggerMatches(
        { kind: "proximity", playerId: "human", ofPlayerId: "wanderer" },
        state,
        move
      )
    ).toBe(false);
  });

  test("ignores non-Move actions", () => {
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new Watcher(), position: tileCube(tiles, 2, 2), owner: wanderer },
      { unit: new PlainUnit(), position: tileCube(tiles, 2, 2), owner: human },
    ]);
    expect(
      triggerMatches(
        { kind: "proximity", playerId: "human", ofPlayerId: "wanderer" },
        state,
        startTurn
      )
    ).toBe(false);
  });
});

describe("NarrativeEngine", () => {
  function script(): NarrativeScript {
    return [
      {
        id: "turn-1",
        trigger: { kind: "turn", turn: 1 },
        lines: [{ speaker: "Whirley", text: "line" }],
      },
      {
        id: "village",
        trigger: { kind: "tileReached", playerId: "human", sections: ["village"] },
        lines: [
          { speaker: "Villager", text: "a" },
          { speaker: "Whirley", text: "b" },
        ],
      },
    ];
  }

  test("returns a fired event and marks it so it fires at most once", () => {
    const engine = new NarrativeEngine(script());
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [], 1);

    const first = engine.evaluate(state, startTurn);
    expect(first.map((e) => e.id)).toEqual(["turn-1"]);
    expect(engine.hasFired("turn-1")).toBe(true);

    const second = engine.evaluate(state, startTurn);
    expect(second).toEqual([]);
  });

  test("returns multiple simultaneous events in definition order", () => {
    const combined: NarrativeScript = [
      {
        id: "village",
        trigger: { kind: "tileReached", playerId: "human", sections: ["village"] },
        lines: [{ text: "a" }],
      },
      {
        id: "also-here",
        trigger: { kind: "tileReached", playerId: "human", sections: ["village"] },
        lines: [{ text: "b" }],
      },
    ];
    const engine = new NarrativeEngine(combined);
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [
      { unit: new PlainUnit(), position: tileCube(tiles, 4, 0), owner: human },
    ]);
    expect(engine.evaluate(state, move).map((e) => e.id)).toEqual([
      "village",
      "also-here",
    ]);
  });

  test("a repeatable event fires every time it matches", () => {
    const engine = new NarrativeEngine([
      {
        id: "tick",
        trigger: { kind: "turn", turn: 1 },
        lines: [{ text: "x" }],
        repeatable: true,
      },
    ]);
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [], 1);
    expect(engine.evaluate(state, startTurn)).toHaveLength(1);
    expect(engine.evaluate(state, startTurn)).toHaveLength(1);
  });

  test("reset() clears fired history so a reloaded stage replays beats", () => {
    const engine = new NarrativeEngine(script());
    const tiles = makeTiles(4, 0, "village");
    const state = makeState(tiles, [], 1);
    engine.evaluate(state, startTurn);
    expect(engine.hasFired("turn-1")).toBe(true);
    engine.reset();
    expect(engine.hasFired("turn-1")).toBe(false);
    expect(engine.evaluate(state, startTurn).map((e) => e.id)).toEqual(["turn-1"]);
  });
});
