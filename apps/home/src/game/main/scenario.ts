import { Game } from "../core/game";
import { type Player, PlayerColor } from "../core/player/player";
import { Hero } from "./units";
import type { ObservableSubscriptionDone } from "../shared/observable";
import { type GameEvent, GameEventType } from "../core/game_event";
import type { State } from "../core/world";
import { createPlayerStore } from "../core/player_store";
import { StoreProxy } from "../core/store";
import type { PlayerAction } from "../core/player_action";
import { Explorer } from "../core/player/explorer";

export class Scenario {
  protected player: Player = {
    id: "human",
    name: "Adventurer",
    color: PlayerColor.BLUE,
  };

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
          createPlayerStore(this.game.world.store, state.currentPlayer)
        );
        break;
      default:
        done();
        break;
    }
  }

  public start() {
    this.game.add(this.player);
    this.game.spawnInSection(this.player, new Hero(), "spawn_a");
    this.game.nextTurn();
  }

  protected onTurnStart(
    _: Player,
    store: StoreProxy<GameEvent, State, PlayerAction>
  ) {
    const explorer = new Explorer(store);
    explorer.takeActions();
  }
}
