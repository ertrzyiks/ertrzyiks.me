import { GameWorld } from "../shared/game_world";
import type { Board, Player } from "../core";
import { Scenario } from "./scenario";
import type { EventSystem, Spritesheet } from "pixi.js";
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

  constructor(protected board: Board, protected events: EventSystem, protected sheet: Spritesheet) {
    super(board, events, sheet);

    this.scenario = new Scenario(this.game);

    this.scenario.emitter.on("playerTurn", (data: { units: UnitPosition[] }) => {
      this.isPlayerTurn = true;
      this.playerUnits = data.units;
      this.selectedUnit = data.units[0] || null;
      this.showTurnIndicator("Your Turn - Move Your Units");
    });

    this.scenario.emitter.on("wolfTurn", () => {
      this.isPlayerTurn = false;
      this.showTurnIndicator("Wolves' Turn");
    });

    this.scenario.start();
  }

  protected showTurnIndicator(text: string) {
    console.log("Turn:", text);
    // Remove old indicator if exists
    const oldIndicator = document.getElementById("turn-indicator");
    if (oldIndicator) {
      oldIndicator.remove();
    }

    // Create indicator
    const indicator = document.createElement("div");
    indicator.id = "turn-indicator";
    indicator.textContent = text;

    const bgColor = text.includes("Your") ? "rgba(74, 173, 214, 0.2)" : "rgba(255, 85, 85, 0.2)";
    const textColor = text.includes("Your") ? "#4aadd6" : "#ff5555";
    const borderColor = text.includes("Your") ? "#4aadd6" : "#ff5555";

    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      color: ${textColor};
      padding: 15px 30px;
      border-radius: 8px;
      font-size: 20px;
      font-weight: bold;
      z-index: 1000;
      font-family: Arial, sans-serif;
      border: 2px solid ${borderColor};
      box-shadow: 0 0 10px ${borderColor}40;
    `;
    document.body.appendChild(indicator);

    // Remove after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 3000);
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
