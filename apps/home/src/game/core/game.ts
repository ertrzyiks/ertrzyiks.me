import type { CubeCoordinates } from "honeycomb-grid";
import { Unit } from "./units";
import type { Player } from "./player";
import type { Board } from "./board";
import { World, type State } from "./world";
import { type GameEvent, GameEventType } from "./game_event";
import { createGrid } from "./grid";
import { Observable } from "../shared/observable";
import {
  evaluateEndConditions,
  NO_END_CONDITIONS,
  type EndConditions,
} from "./conditions";

interface WorldUpdateTuple {
  action: GameEvent;
  state: State;
}

export class Game {
  public world: World;
  public worldObservable: Observable<WorldUpdateTuple>;

  // Scenario-supplied win/lose rules. Empty until a stage configures them, so a
  // bare Game never ends on its own. See specs/05-win-lose-conditions.md.
  protected endConditions: EndConditions = NO_END_CONDITIONS;

  constructor(protected board: Board) {
    const grid = createGrid(board);
    this.world = new World(grid);

    this.worldObservable = new Observable();
    this.world.subscribe(this.onWorldUpdate.bind(this));
  }

  setEndConditions(conditions: EndConditions) {
    this.endConditions = conditions;
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

    // Evaluate scenario end conditions after every gameplay action. A move can
    // reach a goal (win); an attack can defeat the last unit (lose). A met
    // condition ends the game — the resulting GameEnd flips the store into its
    // terminal state, so nothing further processes. See specs/05.
    if (
      state.outcome === null &&
      (action.type === GameEventType.Move ||
        action.type === GameEventType.TakeDamage)
    ) {
      const outcome = evaluateEndConditions(state, this.endConditions);
      if (outcome) {
        this.dispatch({ type: GameEventType.GameEnd, outcome });
        return;
      }
    }

    if (action.type === GameEventType.EndTurn) {
      this.worldObservable.onNextDrain(() => {
        this.nextTurn();
      });
    }
  }
}
