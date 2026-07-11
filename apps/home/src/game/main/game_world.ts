import { GameWorld } from "../shared/game_world";
import type { Board, Player } from "../core";
import { Scenario } from "./scenario";
import type { EventSystem, Spritesheet } from "pixi.js";
import { Text, Container } from "pixi.js";
import TWEEN from "@tweenjs/tween.js";
import { directionBetween } from "../core/grid/helpers";
import type { Tileable } from "../shared/renderable/tileable";
import type { GameTileHex } from "../core";
import type { UnitPosition } from "../core/board";
import type { GameEvent } from "../core/game_event";
import type { State } from "../core/world";
import type { ObservableSubscriptionDone } from "../shared/observable";
import { NarrativeEngine, type NarrativeEvent } from "../core/narrative";
import { createStage1Narrative } from "./narrative/stage1";
import { DialogBox } from "../shared/dialog_box";

export class MainWorld extends GameWorld {
  protected player: Player | null = null;

  protected scenario: Scenario;

  protected isPlayerTurn = false;
  protected playerUnits: UnitPosition[] = [];
  protected selectedUnit: UnitPosition | null = null;

  protected turnIndicatorContainer: Container | null = null;
  protected turnIndicatorTween: TWEEN.Tween | null = null;

  // Narrative: the engine (pure) decides which beats fire; MainWorld presents
  // them as modal dialogs. While a dialog is open the whole world observable is
  // held (see setupNarrative) so no queued action — including a pending win/lose
  // GameEnd — resolves until the player has read the beat. See specs/07.
  protected narrative = new NarrativeEngine(
    createStage1Narrative("human", "wanderer")
  );
  protected dialogQueue: NarrativeEvent[] = [];
  protected currentDialog: DialogBox | null = null;
  protected pendingNarrativeDone: ObservableSubscriptionDone | null = null;
  protected dialogActive = false;

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

    this.scenario.emitter.on("gameEnd", (data: { outcome: "win" | "lose" }) => {
      // Terminal state: block all board input and announce the result. The store
      // already rejects gameplay actions; this just stops the click handler.
      this.isPlayerTurn = false;
      this.selectedUnit = null;
      if (data.outcome === "win") {
        this.showTurnIndicator("Victory! You reached the village", 0x4ad66a);
      } else {
        this.showTurnIndicator("Defeated...", 0xff5555);
      }
    });

    // Subscribe the narrative controller before start() so it observes the very
    // first StartTurn (the "Turn 1" beat). It is a peer world-observable
    // subscriber: by not calling done() until the dialog is dismissed it pauses
    // the serial observable pipeline, which is exactly spec 07's "game is fully
    // paused while dialog is active" and "the game ends after the dialog is
    // dismissed" (the GameEnd the Game queues behind a winning Move waits here).
    this.game.worldObservable.subscribe(this.onNarrativeUpdate.bind(this));

    this.scenario.start();
  }

  protected onNarrativeUpdate(
    { state, action }: { state: State; action: GameEvent },
    done: ObservableSubscriptionDone
  ) {
    const events = this.narrative.evaluate(state, action);
    if (events.length === 0) {
      done();
      return;
    }

    // Hold the pipeline open until every queued beat for this action is read.
    this.dialogQueue.push(...events);
    this.pendingNarrativeDone = done;
    this.dialogActive = true;
    this.selectedUnit = null;

    if (!this.currentDialog) {
      this.showNextDialog();
    }
  }

  protected showNextDialog() {
    const event = this.dialogQueue.shift();

    if (!event) {
      // All beats read: resume the game from where it paused.
      this.dialogActive = false;
      const done = this.pendingNarrativeDone;
      this.pendingNarrativeDone = null;
      if (done) {
        done();
      }
      return;
    }

    this.currentDialog = new DialogBox(event.lines, () => {
      if (this.currentDialog) {
        this.removeChild(this.currentDialog);
        this.currentDialog.destroy({ children: true });
        this.currentDialog = null;
      }
      this.showNextDialog();
    });
    this.addChild(this.currentDialog);
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
      // Ignore board clicks during a dialog (spec 03/07: input is locked while a
      // narrative dialog is active). The DialogBox backdrop also swallows taps,
      // so this is a second line of defence.
      if (this.isPlayerTurn && !this.dialogActive) {
        this.handleTileClick(sprite as Tileable);
      }
    });

    return sprite;
  }

  protected handleTileClick(tile: Tileable) {
    if (this.dialogActive) {
      return;
    }

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
