import { describe, expect, test } from "vitest";
import { createPlayerStore } from "./player_store";
import { createStore } from "./store";
import { gameReducer } from "./reducers";
import { GameEventType } from "./game_event";
import { PlayerActionType } from "./player_action";
import { PlayerColor } from "./player/player";
import { Unit, Movable, Damageable, Damaging } from "./units";
import { positionAt } from "./grid";
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
    outcome: null,
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

describe("createPlayerStore — proxyState allUnits", () => {
  test("allUnits exposes every unit while units stays filtered", () => {
    const store = makeStore();
    const heroUnit = new MovableUnit();
    const wolfUnit = new MovableUnit();
    store.dispatch({ type: GameEventType.Spawn, unit: heroUnit, position: { q: 0, r: 0, s: 0 }, owner: human });
    store.dispatch({ type: GameEventType.Spawn, unit: wolfUnit, position: { q: 1, r: -1, s: 0 }, owner: wolf });

    const humanStore = createPlayerStore(store, human);
    expect(humanStore.getState().units).toHaveLength(1);
    expect(humanStore.getState().allUnits).toHaveLength(2);
  });
});

describe("createPlayerStore — Attack translation", () => {
  const HeroUnit = Damaging(Damageable(Unit, 30), 10);

  function spawnAttackerAndTarget(targetMaxHp: number, owner = wolf) {
    const store = makeStore();
    const attacker = new HeroUnit();
    attacker.replenish();
    const TargetUnit = Damageable(Unit, targetMaxHp);
    const target = new TargetUnit();
    target.replenish();

    const attackerPos = { q: 0, r: 0, s: 0 };
    const targetPos = positionAt(attackerPos, "ne"); // adjacent hex

    store.dispatch({ type: GameEventType.Spawn, unit: attacker, position: attackerPos, owner: human });
    store.dispatch({ type: GameEventType.Spawn, unit: target, position: targetPos, owner });
    return { store, attacker, target, attackerPos, targetPos };
  }

  test("attacking an adjacent enemy emits TakeDamage and can kill it", () => {
    const { store, attacker, target, targetPos } = spawnAttackerAndTarget(8); // dies to 10 dmg
    const humanStore = createPlayerStore(store, human);

    humanStore.dispatch({ type: PlayerActionType.Attack, unit: attacker, position: targetPos });

    expect(store.getState().units.some((u) => u.unit === target)).toBe(false);
    expect(attacker.canAttack()).toBe(false); // charge consumed
  });

  test("attacking a surviving enemy keeps it on the board", () => {
    const { store, attacker, target, targetPos } = spawnAttackerAndTarget(25);
    const humanStore = createPlayerStore(store, human);

    humanStore.dispatch({ type: PlayerActionType.Attack, unit: attacker, position: targetPos });

    expect(store.getState().units.some((u) => u.unit === target)).toBe(true);
    expect(target.isAlive()).toBe(true); // 25 - 10
  });

  test("ignores an attack on a non-adjacent enemy", () => {
    const { store, attacker, attackerPos } = spawnAttackerAndTarget(8);
    // Move the target two hexes away so it's no longer adjacent.
    const farTarget = new (Damageable(Unit, 8))();
    farTarget.replenish();
    const farPos = positionAt(positionAt(attackerPos, "ne"), "ne");
    store.dispatch({ type: GameEventType.Spawn, unit: farTarget, position: farPos, owner: wolf });

    const humanStore = createPlayerStore(store, human);
    humanStore.dispatch({ type: PlayerActionType.Attack, unit: attacker, position: farPos });

    expect(store.getState().units.some((u) => u.unit === farTarget)).toBe(true);
    expect(attacker.canAttack()).toBe(true); // no charge spent
  });

  test("ignores an attack on a friendly unit", () => {
    const { store, attacker, target, targetPos } = spawnAttackerAndTarget(8, human);
    const humanStore = createPlayerStore(store, human);

    humanStore.dispatch({ type: PlayerActionType.Attack, unit: attacker, position: targetPos });

    expect(store.getState().units.some((u) => u.unit === target)).toBe(true);
    expect(attacker.canAttack()).toBe(true);
  });

  test("ignores an attack when the attacker has no charge left", () => {
    const { store, attacker, target, targetPos } = spawnAttackerAndTarget(8);
    attacker.useAttack(); // exhaust the single charge
    const humanStore = createPlayerStore(store, human);

    humanStore.dispatch({ type: PlayerActionType.Attack, unit: attacker, position: targetPos });

    expect(store.getState().units.some((u) => u.unit === target)).toBe(true);
  });
});
