import { GameWorld } from "../shared/game_world";
import type { Board, Player } from "../core";
import { Scenario } from "./scenario";
import type { EventSystem, Spritesheet } from "pixi.js";
import { Text, Container } from "pixi.js";
import TWEEN from "@tweenjs/tween.js";
import { directionBetween } from "../core/grid/helpers";
import { PlayerActionType } from "../core/player_action";
import type { Tileable } from "../shared/renderable/tileable";
import type { GameTileHex } from "../core";
import type { UnitPosition } from "../core/world";

export class MainWorld extends GameWorld {
  protected player: Player | null = null;

  protected scenario: Scenario;

  protected isPlayerTurn = false;
  protected playerUnits: UnitPosition[] = [];
  protected selectedUnit: UnitPosition | null = null;

  protected turnIndicatorContainer: Container | null = null;
  protected turnIndicatorTween: TWEEN.Tween | null = null;

  constructor(protected board: Board, protected events: EventSystem, protected sheet: Spritesheet) {
    super(board, events, sheet);

    this.scenario = new Scenario(this.game);

    this.scenario.emitter.on("playerTurn", (data: { units: UnitPosition[] }) => {
      this.isPlayerTurn = true;
      this.playerUnits = data.units;
      this.selectedUnit = data.units[0] || null;
      this.showTurnIndicator("Your Turn - Move Your Units", 0x4aadd6);
    });

    this.scenario.emitter.on("wolfTurn", () => {
      this.isPlayerTurn = false;
      this.showTurnIndicator("Wolves' Turn", 0xff5555);
    });

    this.scenario.start();
  }

  protected showTurnIndicator(text: string, color: number) {
    // Remove old indicator if exists
    if (this.turnIndicatorContainer) {
      if (this.turnIndicatorTween) {
        this.turnIndicatorTween.stop();
      }
      this.removeChild(this.turnIndicatorContainer);
      this.turnIndicatorContainer.destroy();
    }

    // Create new container for indicator
    this.turnIndicatorContainer = new Container();
    this.turnIndicatorContainer.position.set(window.innerWidth / 2, 40);

    // Create text
    const indicator = new Text(text, {
      fontSize: 24,
      fontWeight: "bold",
      fill: color,
      fontFamily: "Arial",
      align: "center",
    });
    indicator.anchor.set(0.5, 0.5);

    this.turnIndicatorContainer.addChild(indicator);
    this.addChild(this.turnIndicatorContainer);

    // Fade in and out animation
    let state = { alpha: 0 };
    this.turnIndicatorContainer.alpha = 0;

    // Fade in
    this.turnIndicatorTween = new TWEEN.Tween(state)
      .to({ alpha: 1 }, 300)
      .onUpdate(() => {
        this.turnIndicatorContainer!.alpha = state.alpha;
      })
      .onComplete(() => {
        // Stay visible for 2.4 seconds, then fade out
        this.turnIndicatorTween = new TWEEN.Tween(state)
          .to({ alpha: 0 }, 300)
          .delay(2400)
          .onUpdate(() => {
            this.turnIndicatorContainer!.alpha = state.alpha;
          })
          .onComplete(() => {
            if (this.turnIndicatorContainer && this.turnIndicatorContainer.parent) {
              this.removeChild(this.turnIndicatorContainer);
              this.turnIndicatorContainer.destroy();
              this.turnIndicatorContainer = null;
            }
          })
          .start();
      })
      .start();
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

    // Check if clicking on a unit tile to select it
    const unitOnTile = state.units.find(u =>
      u.owner.id === "human" &&
      u.position.q === tile.coordinates.q &&
      u.position.r === tile.coordinates.r &&
      u.position.s === tile.coordinates.s
    );

    if (unitOnTile) {
      this.selectedUnit = unitOnTile;
      return;
    }

    // Move the selected unit
    if (!this.selectedUnit) {
      return;
    }

    const direction = directionBetween(this.selectedUnit.position, tile.coordinates);
    if (!direction) {
      return;
    }

    this.scenario.moveUnit(this.selectedUnit.unit, direction);

    // After moving, select the next unit that needs to move
    const unitsToMove = this.scenario.getUnitsToMove();
    const nextUnit = this.playerUnits.find(u => unitsToMove.has(u.unit.id));
    this.selectedUnit = nextUnit || null;
  }
}
