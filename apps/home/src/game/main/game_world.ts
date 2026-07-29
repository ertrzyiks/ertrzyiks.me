import { GameWorld } from "../shared/game_world";
import type { Board, Player } from "../core";
import { Scenario } from "./scenario";
import { createStage1Definition } from "./stages/stage1";
import type { EventSystem, Spritesheet } from "pixi.js";
import { Text, Container, Graphics, Rectangle, utils } from "pixi.js";
import TWEEN from "@tweenjs/tween.js";
import { pointToCube, directionBetween } from "../core/grid/helpers";
import { cubeKey } from "../core/grid";
import { validMoveDestinations, validAttackTargets } from "../core/player/movement";
import type { Tileable } from "../shared/renderable/tileable";
import type { UnitPosition } from "../core/board";
import type { GameEvent, GameOutcome } from "../core/game_event";
import type { State } from "../core/world";
import type { ObservableSubscriptionDone } from "../shared/observable";
import { NarrativeEngine, type NarrativeEvent, type NarrativeScript } from "../core/narrative";
import { createStage1Narrative } from "./narrative/stage1";
import { DialogBox } from "../shared/dialog_box";
import type { StageDefinition } from "./stages/stage";

export class MainWorld extends GameWorld {
  // Public, unlike `scenario.emitter` (which MainWorld consumes internally
  // for presentation): this is the seam StageManager listens on to know when
  // it's safe to act on a finished stage — after the "Victory!"/"Defeated..."
  // indicator has actually been read, not the instant GameEnd fires (specs/08
  // requires progression to be automatic, not that it can't let the player
  // see the outcome first — see the "stageEnded" emit below).
  public emitter = new utils.EventEmitter();

  protected player: Player | null = null;

  protected scenario: Scenario;

  protected isPlayerTurn = false;
  protected playerUnits: UnitPosition[] = [];
  protected selectedUnit: UnitPosition | null = null;

  // World-space layer for the selected unit's valid-move highlights (spec 03).
  // Lives in the viewport so highlights pan/zoom with the board.
  protected highlightContainer: Container = new Container();

  // Screen-space "End Turn" control (spec 03): the human turn ends only when the
  // player asks, never automatically. Shown only during the human's turn.
  protected endTurnButton: Container | null = null;

  protected turnIndicatorContainer: Container | null = null;
  protected turnIndicatorTween: TWEEN.Tween | null = null;

  // Narrative: the engine (pure) decides which beats fire; MainWorld presents
  // them as modal dialogs. While a dialog is open the whole world observable is
  // held (see setupNarrative) so no queued action — including a pending win/lose
  // GameEnd — resolves until the player has read the beat. See specs/07.
  protected narrative: NarrativeEngine;
  protected dialogQueue: NarrativeEvent[] = [];
  protected currentDialog: DialogBox | null = null;
  protected pendingNarrativeDone: ObservableSubscriptionDone | null = null;
  protected dialogActive = false;

  constructor(
    protected board: Board,
    protected events: EventSystem,
    protected sheet: Spritesheet,
    // Injectable so callers other than the real site (e.g. the interaction
    // test harness, docs/adr/0001) can boot MainWorld against a minimal
    // definition/script instead of always mounting Stage 1 in full.
    definition: StageDefinition = createStage1Definition(),
    narrativeScript: NarrativeScript = createStage1Narrative(definition.player.id, "wanderer")
  ) {
    super(board, events, sheet);

    this.narrative = new NarrativeEngine(narrativeScript);
    this.scenario = new Scenario(this.game, definition);

    // Highlights render above the board terrain/fog but move with the viewport.
    this.viewport.addChild(this.highlightContainer);
    this.createEndTurnButton();

    // Board clicks are resolved here, not via per-tile pointertap listeners:
    // pixi-viewport's drag plugin sets the viewport's own hitArea to the
    // whole world (needed for panning), and PixiJS's hit-testing treats a
    // container's own hitArea as an override that its children are never
    // checked against — no tile or unit sprite can ever receive a pointer
    // event underneath it. "clicked" is pixi-viewport's own click-vs-drag
    // disambiguation, carrying the world-space point to resolve manually.
    this.viewport.on("clicked", (e) => this.handleViewportClicked(e.world));

    this.scenario.emitter.on("playerTurn", (data: { units: UnitPosition[] }) => {
      this.isPlayerTurn = true;
      this.playerUnits = data.units;
      this.selectedUnit = data.units[0] || null;
      this.showTurnIndicator("Your Turn - Move Your Units", 0x4aadd6);
      // Only offer end-turn when no opening dialog is holding the pipeline.
      this.setEndTurnButtonVisible(!this.dialogActive);
      this.updateHighlights();
    });

    this.scenario.emitter.on("wolfTurn", () => {
      this.isPlayerTurn = false;
      this.selectedUnit = null;
      this.setEndTurnButtonVisible(false);
      this.updateHighlights();
      this.showTurnIndicator("Wolves' Turn", 0xff5555);
    });

    this.scenario.emitter.on("gameEnd", (data: { outcome: GameOutcome }) => {
      // Terminal state: block all board input and announce the result. The store
      // already rejects gameplay actions; this just stops the click handler.
      this.isPlayerTurn = false;
      this.selectedUnit = null;
      this.setEndTurnButtonVisible(false);
      this.updateHighlights();
      // Both outcomes wait for the indicator's own fade-out to finish before
      // telling StageManager the stage is over — timed off that completion
      // rather than a second, independently-tuned delay, so the player has
      // read "Victory!"/"Defeated..." before anything changes underneath it
      // (spec 08 "Stage Sequence": progression/reload happens automatically,
      // not instantly). MainWorld only presents the outcome; StageManager
      // decides what "over" means (advance vs. reload) — see its own module
      // comment.
      if (data.outcome === "win") {
        this.showTurnIndicator("Victory! You reached the village", 0x4ad66a, () =>
          this.emitter.emit("stageEnded", { outcome: "win" })
        );
      } else {
        this.showTurnIndicator("Defeated...", 0xff5555, () =>
          this.emitter.emit("stageEnded", { outcome: "lose" })
        );
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
    // A dialog locks all input (spec 07): drop the highlight and hide end-turn.
    this.setEndTurnButtonVisible(false);
    this.updateHighlights();

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
      // Restore the human-turn controls the dialog suspended.
      if (this.isPlayerTurn) {
        if (!this.selectedUnit) {
          this.selectedUnit = this.playerUnits[0] || null;
        }
        this.setEndTurnButtonVisible(true);
        this.updateHighlights();
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

  /**
   * Reloads the current stage from scratch with a freshly-built `definition`
   * (spec 08 "Stage Sequence": "the current stage reloads from its initial
   * state"). `Scenario.reload()` only resets game/world state; the narrative
   * controller is owned separately by MainWorld, so its fired-beat history
   * must be cleared here too — otherwise the Turn 1 opener (and every other
   * once-only beat) couldn't replay on the fresh playthrough.
   *
   * Takes `definition` rather than rebuilding it here: MainWorld doesn't know
   * which stage-N factory produced the definition it was constructed with
   * (only `StageManager`, via `stages/sequence.ts`, does), and a fresh
   * instance — not the already-consumed one from construction — is required
   * so per-playthrough state (Player identities, pack memory) resets too.
   * Same board only: a different board needs a whole new MainWorld, which is
   * StageManager's job, not this method's.
   */
  public reloadStage(definition: StageDefinition) {
    this.narrative.reset();
    this.scenario.reload(definition);
  }

  // `onComplete` fires once, after this indicator's fade-out finishes — both
  // the "Victory!" and "Defeated..." calls in the gameEnd listener use it, to
  // emit "stageEnded" once the player has actually read the outcome.
  // IMPORTANT: TWEEN.js's `.stop()` below does NOT invoke `onComplete`, so a
  // second showTurnIndicator() call before the first one's fade-out
  // completes silently drops the pending callback — no
  // error, it just never fires. This is safe today only because nothing else
  // calls showTurnIndicator() once the game has reached a terminal outcome
  // (the reducer rejects every action that could trigger one). If a future
  // change adds another indicator call reachable from the terminal state,
  // this coupling breaks silently — reconsider whether onComplete should
  // survive an interruption before relying on it again.
  protected showTurnIndicator(
    text: string,
    color: number,
    onComplete?: () => void
  ) {
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
            onComplete?.();
          })
          .start();
      })
      .start();
  }

  /**
   * Whether the human may currently act on the board or the End Turn control
   * (spec 03 "Active Turn Requirement": "Clicks during an enemy turn, an
   * animation, or a dialog are ignored"). Single source of truth for every
   * input entry point below, so a future one can't forget a check the way
   * this one omitted the animation guard until it was added here.
   */
  protected canAcceptInput(): boolean {
    return this.isPlayerTurn && !this.dialogActive && !this.isUnitMoving;
  }

  protected handleViewportClicked(worldPoint: { x: number; y: number }) {
    if (!this.canAcceptInput()) {
      return;
    }

    const tile = this.getTerrainAt(pointToCube(worldPoint));
    if (!tile) {
      return;
    }

    this.handleTileClick(tile);
  }

  protected handleTileClick(tile: Tileable) {
    // The DialogBox backdrop also swallows taps, so the dialogActive part of
    // canAcceptInput() is a second line of defence here, not the only one.
    if (!this.canAcceptInput()) {
      return;
    }

    const state = this.game.world.getState();
    const player = state.currentPlayer;

    if (!player || player.id !== "human") {
      return;
    }

    // Check if clicking on a unit tile
    const unitOnTile = state.units.find(u =>
      u.position.q === tile.coordinates.q &&
      u.position.r === tile.coordinates.r &&
      u.position.s === tile.coordinates.s
    );

    if (unitOnTile) {
      if (unitOnTile.owner.id === "human") {
        this.selectedUnit = unitOnTile;
        this.updateHighlights();
        return;
      }

      // Enemy/NPC unit clicked: attack only if it is a legal target for the
      // selected unit's remaining attack charge — validAttackTargets applies
      // the same adjacency + Damageable + charge checks the reducer enforces
      // (spec 03 "Click on an Enemy Unit").
      if (this.selectedUnit) {
        const targets = validAttackTargets(this.selectedUnit.unit, this.selectedUnit.position, "human", state);
        if (targets.some(t => cubeKey(t) === cubeKey(unitOnTile.position))) {
          this.scenario.attackUnit(this.selectedUnit.unit, unitOnTile.position);
        }
      }
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

    // After moving, keep the same unit selected if it still has budget (so the
    // player can spend a multi-point move step by step); otherwise fall back to
    // the next unit that has not moved yet. The turn no longer ends on its own —
    // the player ends it explicitly via the End Turn button (spec 03).
    const postMoveState = this.game.world.getState();
    const moved = postMoveState.units.find(u => u.unit.id === this.selectedUnit!.unit.id);
    const validDests = moved
      ? validMoveDestinations(moved.unit, moved.position, postMoveState)
      : [];
    if (moved && validDests.length > 0) {
      this.selectedUnit = moved;
    } else {
      const unitsToMove = this.scenario.getUnitsToMove();
      const nextUnit = this.playerUnits.find(u => unitsToMove.has(u.unit.id));
      this.selectedUnit = nextUnit || null;
    }
    this.updateHighlights();
  }

  // Redraw the valid-move highlights for the currently selected unit. Highlights
  // are absent when it is not the human's turn, a dialog is up, nothing is
  // selected, or the unit has no remaining budget (spec 03 "Visual Feedback").
  protected updateHighlights() {
    this.highlightContainer.removeChildren().forEach(child => child.destroy());

    if (!this.isPlayerTurn || this.dialogActive || !this.selectedUnit) {
      return;
    }

    const state = this.game.world.getState();
    // Re-read the live unit from state: its position/budget may have changed
    // since selection (e.g. right after a move).
    const live = state.units.find(u => u.unit.id === this.selectedUnit!.unit.id);
    if (!live) {
      return;
    }

    for (const dest of validMoveDestinations(live.unit, live.position, state)) {
      const tile = this.getTerrainAt(dest);
      if (!tile) continue;
      const marker = new Graphics();
      marker.lineStyle(3, 0x4ad66a, 0.9);
      marker.beginFill(0x4ad66a, 0.25);
      marker.drawPolygon(this.createHexPoints(50));
      marker.endFill();
      marker.position.set(tile.x, tile.y);
      this.highlightContainer.addChild(marker);
    }
  }

  protected createEndTurnButton() {
    const width = 140;
    const height = 48;

    const button = new Container();
    button.position.set(
      window.innerWidth - width - 24,
      window.innerHeight - height - 24
    );

    const bg = new Graphics();
    bg.beginFill(0x1a1a2e, 0.95);
    bg.lineStyle(2, 0x4aadd6, 1);
    bg.drawRoundedRect(0, 0, width, height, 10);
    bg.endFill();
    button.addChild(bg);

    const label = new Text("End Turn", {
      fontSize: 18,
      fontWeight: "bold",
      fill: 0xffffff,
      fontFamily: "Arial",
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(width / 2, height / 2);
    button.addChild(label);

    button.eventMode = "static";
    button.cursor = "pointer";
    button.hitArea = new Rectangle(0, 0, width, height);
    button.on("pointertap", () => this.onEndTurnClicked());

    button.visible = false;
    this.endTurnButton = button;
    this.addChild(button);
  }

  protected setEndTurnButtonVisible(visible: boolean) {
    if (this.endTurnButton) {
      this.endTurnButton.visible = visible;
    }
  }

  protected onEndTurnClicked() {
    // After ending, input is locked until the next human turn.
    if (!this.canAcceptInput()) {
      return;
    }
    this.isPlayerTurn = false;
    this.selectedUnit = null;
    this.setEndTurnButtonVisible(false);
    this.updateHighlights();
    this.scenario.endPlayerTurn();
  }
}
