import { GameWorld } from "../shared/game_world";
import type { Board, Player } from "../core";
import { Scenario } from "./scenario";
import type { EventSystem, Spritesheet } from "pixi.js";
import { directionBetween } from "../core/grid/helpers";
import { PlayerActionType } from "../core/player_action";
import type { Tileable } from "../shared/renderable/tileable";
import type { GameTileHex } from "../core";

export class MainWorld extends GameWorld {
  protected player: Player | null = null;

  protected scenario: Scenario;

  protected isPlayerTurn = false;

  constructor(protected board: Board, protected events: EventSystem, protected sheet: Spritesheet) {
    super(board, events, sheet);

    this.scenario = new Scenario(this.game);

    this.scenario.emitter.on("playerTurn", () => {
      this.isPlayerTurn = true;
    });

    this.scenario.start();
  }

  protected createWorldTile(hex: GameTileHex) {
    const sprite = super.createWorldTile(hex);

    sprite.on("pointertap", () => {
      if (this.isPlayerTurn) {
        this.handleTileClick(sprite as Tileable);
      }
    });

    return sprite;
  }

  protected handleTileClick(tile: Tileable) {
    const state = this.game.world.getState();
    const player = state.currentPlayer;

    if (!player || player.id !== "human") {
      return;
    }

    // Find the player's unit
    const playerUnit = state.units.find(u => u.owner.id === "human");
    if (!playerUnit) return;

    const direction = directionBetween(playerUnit.position, tile.coordinates);
    if (!direction) {
      return;
    }

    this.scenario.moveUnit(playerUnit.unit, direction);
  }
}
