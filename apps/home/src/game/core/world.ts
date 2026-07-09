import type { Grid } from "honeycomb-grid";
import type { GameEvent, GameOutcome } from "./game_event";
import { getGridBoundingBox, getGridSize } from "./grid";
import type { Player } from "./player";
import { createStore, Store } from "./store";
import type { GameTileHex, UnitPosition } from "./board";
import { gameReducer } from "./reducers";

export type WorldUpdateCallback = (state: State, action: GameEvent) => void;

export interface State {
  players: Array<Player>;
  currentPlayerIndex: number | null;
  currentPlayer: Player | null;
  worldWidth: number;
  worldHeight: number;
  cols: number;
  rows: number;
  tiles: Array<GameTileHex>;
  units: Array<UnitPosition>;
  // The full roster of units, regardless of owner. The base store leaves this
  // undefined (use `units`); the per-player proxy populates it so AI behaviors
  // and combat can see enemy units that `units` filters out. See player_store.
  allUnits?: Array<UnitPosition>;
  revealedTiles: Record<string, Record<string, true>>;
  // Terminal marker: null while the stage is in play, set to the outcome once a
  // win/lose condition fires. The reducer rejects gameplay actions while set,
  // enforcing the terminal state from specs/05-win-lose-conditions.md.
  outcome: GameOutcome | null;
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
      revealedTiles: {},
      outcome: null,
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

  tileBySection(name: string) {
    return this.getState().tiles.find((t) => t.sectionName === name) ?? this.getState().tiles[0];
  }

  unitsOf(player: Player) {
    return this.getState().units.filter((u) => u.owner.id === player.id);
  }
}
