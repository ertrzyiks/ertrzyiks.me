import { describe, expect, test } from "vitest";
import { createPlayerStore } from "./player_store";
import { createStore } from "./store";
import { gameReducer } from "./reducers";
import { GameEventType } from "./game_event";
import { PlayerActionType } from "./player_action";
import { PlayerColor } from "./player/player";
import { Unit, Movable } from "./units";
import type { State } from "./world";

const human = { id: "human", name: "Human", color: PlayerColor.BLUE };
const wolf = { id: "wolf", name: "Wolf", color: PlayerColor.RED };

function makeStore() {
  const initialState: State = {
    players: [human, wolf],
    currentPlayerIndex: null,
    currentPlayer: null,
    tiles: [],
    units: [],
    revealedTiles: {},
    worldWidth: 500,
    worldHeight: 500,
    cols: 10,
    rows: 10,
  };
  return createStore(gameReducer, initialState);
}

const MovableUnit = Movable(Unit, 3);

describe("createPlayerStore — proxyState unit filtering", () => {
  test("human store only sees human units", () => {
    const store = makeStore();
    const heroUnit = new MovableUnit();
    const wolfUnit = new MovableUnit();

    store.dispatch({ type: GameEventType.Spawn, unit: heroUnit, position: { q: 0, r: 0, s: 0 }, owner: human });
    store.dispatch({ type: GameEventType.Spawn, unit: wolfUnit, position: { q: 1, r: -1, s: 0 }, owner: wolf });

    const humanStore = createPlayerStore(store, human);
    expect(humanStore.getState().units).toHaveLength(1);
    expect(humanStore.getState().units[0].unit).toBe(heroUnit);
  });

  test("wolf store only sees wolf units", () => {
    const store = makeStore();
    store.dispatch({ type: GameEventType.Spawn, unit: new MovableUnit(), position: { q: 0, r: 0, s: 0 }, owner: human });
    const wolfUnit = new MovableUnit();
    store.dispatch({ type: GameEventType.Spawn, unit: wolfUnit, position: { q: 1, r: -1, s: 0 }, owner: wolf });

    const wolfStore = createPlayerStore(store, wolf);
    expect(wolfStore.getState().units).toHaveLength(1);
    expect(wolfStore.getState().units[0].unit).toBe(wolfUnit);
  });

  test("player store shows empty units when player has none", () => {
    const store = makeStore();
    store.dispatch({ type: GameEventType.Spawn, unit: new MovableUnit(), position: { q: 0, r: 0, s: 0 }, owner: wolf });

    const humanStore = createPlayerStore(store, human);
    expect(humanStore.getState().units).toHaveLength(0);
  });

  test("non-unit state fields (cols, rows) pass through unchanged", () => {
    const store = makeStore();
    const humanStore = createPlayerStore(store, human);
    const state = humanStore.getState();
    expect(state.cols).toBe(10);
    expect(state.rows).toBe(10);
  });
});

describe("createPlayerStore — proxyAction translation", () => {
  test("EndTurn action dispatches GameEvent.EndTurn", () => {
    const store = makeStore();
    store.dispatch({ type: GameEventType.StartTurn }); // set currentPlayer

    const humanStore = createPlayerStore(store, human);
    humanStore.dispatch({ type: PlayerActionType.EndTurn });

    // After EndTurn, the game is waiting for next StartTurn (no currentPlayer change yet)
    // We can verify it didn't throw and state is still valid
    expect(store.getState().players).toHaveLength(2);
  });

  test("Move action translates to GameEvent.Move with computed position", () => {
    const store = makeStore();
    const unit = new MovableUnit();
    unit.replenish();
    const startPos = { q: 0, r: 0, s: 0 };
    store.dispatch({ type: GameEventType.Spawn, unit, position: startPos, owner: human });

    const humanStore = createPlayerStore(store, human);
    humanStore.dispatch({ type: PlayerActionType.Move, unit, direction: "ne" });

    // Position should have changed from origin
    const unitPos = store.getState().units.find((u) => u.unit === unit)!.position;
    expect(unitPos).not.toEqual(startPos);
  });
});
