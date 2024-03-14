import { GameWorld } from "../shared/game_world";
import type { Board, Player } from "../core";
import { Scenario } from "./scenario";
import type { EventSystem, Spritesheet } from "pixi.js";

export class MainWorld extends GameWorld {
  protected player: Player | null = null;

  protected scenario: Scenario;

  constructor(protected board: Board, protected events: EventSystem, protected sheet: Spritesheet) {
    super(board, events, sheet);

    this.scenario = new Scenario(this.game);

    this.scenario.start();
  }
}
