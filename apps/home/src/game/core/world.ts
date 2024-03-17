import type { Grid } from "honeycomb-grid";
import type { GameEvent } from "./game_event";
import { getGridBoundingBox, getGridSize } from "./grid";
import type { Player } from "./player";
import { createStore, Store } from "./store";
import type { GameTileHex, UnitPosition } from "./board";
import { gameReducer } from "./reducers";

export type WorldUpdateCallback = (state: State, action: GameEvent) => void;

export interface State {
  players: Array<{ id: string; name: string }>;
  currentPlayerIndex: number | null;
  currentPlayer: Player | null;
  worldWidth: number;
  worldHeight: number;
  cols: number;
  rows: number;
  tiles: Array<GameTileHex>;
  units: Array<UnitPosition>;
}

export class World {
  store: Store<GameEvent, State>;

  constructor(grid: Grid) {
    const tiles = grid.reduce((acc, hex) => {
      // @ts-ignore
      acc.push(hex);
      return acc;
    }, []);

    const { worldWidth, worldHeight } = getGridBoundingBox(grid);
    const { cols, rows } = getGridSize(grid);

    // @ts-ignore
    this.store = createStore(gameReducer, {
      players: [],
      currentPlayerIndex: null,
      currentPlayer: null,
      tiles,
      units: [],
      worldWidth,
      worldHeight,
      cols,
      rows,
    });
  }

  getState() {
    return this.store.getState();
  }

  dispatch(event: GameEvent) {
    this.store.dispatch(event);
  }

  subscribe(fn: WorldUpdateCallback) {
    this.store.subscribe(fn);
  }

  tileBySection(_: string) {
    return this.getState().tiles[0];
  }

  // TODO: fix it
  unitsOf(_: Player) {
    return this.getState().units;
  }
}
