import type { CubeCoordinates } from "honeycomb-grid";
import { Unit } from "./units";
import type { Player } from "./player";
import type { Board } from "./board";
import { World, type State } from "./world";
import { type GameEvent, GameEventType } from "./game_event";
import { createGrid } from "./grid";
import { Observable } from "../shared/observable";

interface WorldUpdateTuple {
  action: GameEvent;
  state: State;
}

export class Game {
  public world: World;
  public worldObservable: Observable<WorldUpdateTuple>;

  constructor(protected board: Board) {
    const grid = createGrid(board);
    this.world = new World(grid);

    this.worldObservable = new Observable();
    this.world.subscribe(this.onWorldUpdate.bind(this));
  }

  finish() {
    // Unsubscribe
  }

  add(player: Player) {
    this.dispatch({
      type: GameEventType.PlayerJoin,
      player: player,
    });
  }

  spawnInSection(player: Player, unit: Unit, sectionName: string) {
    this.spawn(player, unit, this.world.tileBySection(sectionName).cube());
  }

  spawn(player: Player, unit: Unit, position: CubeCoordinates) {
    this.dispatch({
      type: GameEventType.Spawn,
      owner: player,
      unit: unit,
      position: position,
    });
  }

  nextTurn() {
    this.dispatch({ type: GameEventType.StartTurn });
  }

  protected dispatch(event: GameEvent) {
    this.world.dispatch(event);
  }

  protected onWorldUpdate(state: State, action: GameEvent) {
    this.worldObservable.push({ state, action });

    if (action.type === GameEventType.EndTurn) {
      this.worldObservable.onNextDrain(() => {
        this.nextTurn();
      });
    }
  }
}
