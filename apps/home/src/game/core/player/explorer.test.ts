import { describe, expect, test } from "vitest";
import { Explorer } from "./explorer";
import { PlayerActionType } from "../player_action";
import { PlayerColor } from "./player";
import { Unit, Movable } from "../units";
import type { StoreProxy } from "../store";
import type { GameEvent } from "../game_event";
import type { State } from "../world";
import type { PlayerAction } from "../player_action";

const human = { id: "human", name: "Human", color: PlayerColor.BLUE };

const MovableUnit = Movable(Unit, 2);

function makeStore(units: State["units"], cols = 10, rows = 10) {
  const dispatched: PlayerAction[] = [];
  const state: Pick<State, "units" | "cols" | "rows"> = { units, cols, rows };

  const store = {
    getState: () => state as State,
    dispatch: (action: PlayerAction) => dispatched.push(action),
    subscribe: () => {},
  } as unknown as StoreProxy<GameEvent, State, PlayerAction>;

  return { store, dispatched };
}

describe("Explorer.takeActions", () => {
  test("always dispatches EndTurn at the end", () => {
    const { store, dispatched } = makeStore([]);
    new Explorer(store).takeActions();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("dispatches Move for a unit that can move", () => {
    const unit = new MovableUnit();
    unit.replenish();
    const pos = { q: 0, r: 0, s: 0 };
    const { store, dispatched } = makeStore([{ unit, position: pos, owner: human }]);

    new Explorer(store).takeActions();

    expect(dispatched).toHaveLength(2);
    expect(dispatched[0].type).toBe(PlayerActionType.Move);
    expect(dispatched[1].type).toBe(PlayerActionType.EndTurn);
  });

  test("skips a unit that cannot move (budget exhausted)", () => {
    const unit = new MovableUnit();
    unit.replenish();
    unit.step(2); // exhaust all movement
    const { store, dispatched } = makeStore([{ unit, position: { q: 0, r: 0, s: 0 }, owner: human }]);

    new Explorer(store).takeActions();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("skips a unit that has never been replenished", () => {
    const unit = new MovableUnit(); // movementPoints starts at 0
    const { store, dispatched } = makeStore([{ unit, position: { q: 0, r: 0, s: 0 }, owner: human }]);

    new Explorer(store).takeActions();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });

  test("dispatches Move for each unit that can move", () => {
    const unitA = new MovableUnit();
    unitA.replenish();
    const unitB = new MovableUnit();
    unitB.replenish();
    const unitC = new MovableUnit(); // not replenished

    const { store, dispatched } = makeStore([
      { unit: unitA, position: { q: 0, r: 0, s: 0 }, owner: human },
      { unit: unitB, position: { q: 1, r: 0, s: -1 }, owner: human },
      { unit: unitC, position: { q: 0, r: 1, s: -1 }, owner: human },
    ]);

    new Explorer(store).takeActions();

    const moves = dispatched.filter((a) => a.type === PlayerActionType.Move);
    expect(moves).toHaveLength(2); // only unitA and unitB
    expect(dispatched[dispatched.length - 1].type).toBe(PlayerActionType.EndTurn);
  });

  test("does not move non-movable units", () => {
    const unit = new Unit(); // plain Unit, not Movable
    const { store, dispatched } = makeStore([{ unit, position: { q: 0, r: 0, s: 0 }, owner: human }]);

    new Explorer(store).takeActions();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(PlayerActionType.EndTurn);
  });
});
