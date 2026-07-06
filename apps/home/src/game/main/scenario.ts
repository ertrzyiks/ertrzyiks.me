import { Game } from "../core/game";
import { type Player, PlayerColor } from "../core/player/player";
import { Hero, PackLeader, PackFollower } from "./units";
import type { ObservableSubscriptionDone } from "../shared/observable";
import { type GameEvent, GameEventType } from "../core/game_event";
import type { State } from "../core/world";
import { createPlayerStore } from "../core/player_store";
import { StoreProxy } from "../core/store";
import { type PlayerAction, PlayerActionType } from "../core/player_action";
import { PackBehavior, createPackMemory } from "../core/player/pack_behavior";
import { utils } from "pixi.js";

export class Scenario {
  protected player: Player = {
    id: "human",
    name: "Adventurer",
    color: PlayerColor.BLUE,
  };

  protected wolfPlayer: Player = {
    id: "wolves",
    name: "Pack",
    color: PlayerColor.RED,
  };

  // Persists the pack's "no backtracking" memory across CPU turns; a fresh
  // PackBehavior is created each turn but shares this.
  protected packMemory = createPackMemory();

  public emitter = new utils.EventEmitter();
  protected playerStore: StoreProxy<GameEvent, State, PlayerAction> | null = null;
  protected unitsToMove: Set<number> = new Set();

  constructor(protected game: Game) {
    game.worldObservable.subscribe(this.onWorldUpdate.bind(this));
  }

  protected onWorldUpdate(
    { state, action }: { state: State; action: GameEvent },
    done: ObservableSubscriptionDone
  ) {
    switch (action.type) {
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
        // Remove the unit that just moved from the units to move
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
    this.game.add(this.player);
    this.game.add(this.wolfPlayer);

    this.game.spawnInSection(this.player, new Hero(), "spawn_a");
    this.game.spawnInSection(this.player, new Hero(), "spawn_b");
    this.game.spawnInSection(this.wolfPlayer, new PackLeader(), "wolf_1");
    this.game.spawnInSection(this.wolfPlayer, new PackFollower(), "wolf_2");
    this.game.spawnInSection(this.wolfPlayer, new PackFollower(), "wolf_3");

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

    if (player.id === this.wolfPlayer.id) {
      new PackBehavior(store, this.packMemory).takeActions();
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
