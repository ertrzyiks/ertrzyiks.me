import type { PlayerAction } from "../player_action";
import type { State } from "../world";
import type { GameEvent } from "../game_event";
import { StoreProxy } from "../store";

export class Behavior {
  protected store: StoreProxy<GameEvent, State, PlayerAction>;

  constructor(store: StoreProxy<GameEvent, State, PlayerAction>) {
    this.store = store;
  }

  takeActions() {
    throw new Error("not implemented");
  }
}
