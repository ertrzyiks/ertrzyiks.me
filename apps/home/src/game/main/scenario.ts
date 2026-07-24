import type { CubeCoordinates } from "honeycomb-grid";
import { Game } from "../core/game";
import type { Player } from "../core/player/player";
import type { ObservableSubscriptionDone } from "../shared/observable";
import { type GameEvent, GameEventType } from "../core/game_event";
import { destinationReached, lastUnitDefeated } from "../core/conditions";
import type { State } from "../core/world";
import { createPlayerStore } from "../core/player_store";
import { StoreProxy } from "../core/store";
import { type PlayerAction, PlayerActionType } from "../core/player_action";
import { utils } from "pixi.js";
import type { StageDefinition } from "./stages/stage";

/**
 * Drives a single stage: spawns everyone `definition` describes, ends the
 * game on win/lose, and cycles CPU factions through their behaviors on their
 * turn while the human's turn waits for explicit input (spec 03). Stage
 * content itself (who spawns where, how CPU factions act, the win section)
 * lives entirely in `definition` — Scenario does not hard-code it (specs/08).
 */
export class Scenario {
  public emitter = new utils.EventEmitter();
  protected playerStore: StoreProxy<GameEvent, State, PlayerAction> | null = null;
  protected unitsToMove: Set<number> = new Set();

  constructor(protected game: Game, protected definition: StageDefinition) {
    game.worldObservable.subscribe(this.onWorldUpdate.bind(this));
  }

  protected onWorldUpdate(
    { state, action }: { state: State; action: GameEvent },
    done: ObservableSubscriptionDone
  ) {
    switch (action.type) {
      case GameEventType.GameEnd:
        done();
        // Terminal state: stop driving turns and let the renderer show the
        // outcome. The store already rejects further gameplay. See specs/05.
        this.playerStore = null;
        this.unitsToMove.clear();
        this.emitter.emit("gameEnd", { outcome: action.outcome });
        break;
      case GameEventType.StartTurn:
        done();

        if (!state.currentPlayer) throw new Error("No current player");

        this.onTurnStart(
          state.currentPlayer,
          state,
          createPlayerStore(this.game.world.store, state.currentPlayer)
        );
        break;
      case GameEventType.Move:
        done();
        // Track which units still have an unspent turn so the UI can auto-advance
        // selection. The human turn does NOT end here — the player ends it
        // explicitly via the End Turn control (spec 03). Enemy behaviors dispatch
        // their own EndTurn when their pass completes.
        if (action.unit) {
          this.unitsToMove.delete(action.unit.id);
        }
        break;
      default:
        done();
        break;
    }
  }

  public start() {
    const { definition } = this;

    // A stage ends when the human reaches its win section or loses every
    // unit. See specs/05-win-lose-conditions.md.
    this.game.setEndConditions({
      win: [destinationReached(definition.player.id, [definition.winSection])],
      lose: [lastUnitDefeated(definition.player.id)],
    });

    this.game.add(definition.player);
    for (const enemy of definition.enemies) {
      this.game.add(enemy.player);
    }

    for (const spawn of definition.playerSpawns) {
      this.game.spawnInSection(definition.player, spawn.createUnit(), spawn.section);
    }
    for (const enemy of definition.enemies) {
      for (const spawn of enemy.spawns) {
        this.game.spawnInSection(enemy.player, spawn.createUnit(), spawn.section);
      }
    }

    this.game.nextTurn();
  }

  protected onTurnStart(
    player: Player,
    state: State,
    store: StoreProxy<GameEvent, State, PlayerAction>
  ) {
    // Get all units belonging to this player
    const playerUnits = state.units.filter(u => u.owner.id === player.id);
    this.unitsToMove = new Set(playerUnits.map(u => u.unit.id));

    const enemy = this.definition.enemies.find(e => e.player.id === player.id);
    if (enemy) {
      this.emitter.emit(enemy.turnEventName);
      enemy.createBehavior(store).takeActions();
    } else {
      this.playerStore = store;
      this.emitter.emit("playerTurn", { units: playerUnits });
    }
  }

  public moveUnit(unit: any, direction: string) {
    if (this.playerStore) {
      this.playerStore.dispatch({
        type: PlayerActionType.Move,
        unit,
        direction,
      });
    }
  }

  public attackUnit(unit: any, position: CubeCoordinates) {
    if (this.playerStore) {
      this.playerStore.dispatch({
        type: PlayerActionType.Attack,
        unit,
        position,
      });
    }
  }

  public endPlayerTurn() {
    if (this.playerStore) {
      this.playerStore.dispatch({ type: PlayerActionType.EndTurn });
      this.playerStore = null;
      this.unitsToMove.clear();
    }
  }

  public getUnitsToMove(): Set<number> {
    return this.unitsToMove;
  }
}
