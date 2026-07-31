import { GameWorld } from "../shared/game_world";
import type { Board, Player } from "../core";
import { Scenario } from "./scenario";
import { createStage1Definition } from "./stages/stage1";
import type { EventSystem, Spritesheet } from "pixi.js";
import { Text, Container, Graphics, Rectangle, EventEmitter } from "pixi.js";
import TWEEN from "@tweenjs/tween.js";
import { pointToCube } from "../core/grid/helpers";
import { cubeKey } from "../core/grid";
import { moveRange, pathTo, validAttackTargets } from "../core/player/movement";
import type { Tileable } from "../shared/renderable/tileable";
import type { UnitPosition } from "../core/board";
import type { GameEvent, GameOutcome } from "../core/game_event";
import type { State } from "../core/world";
import type { ObservableSubscriptionDone } from "../shared/observable";
import { NarrativeEngine, type NarrativeEvent, type NarrativeScript } from "../core/narrative";
import { createStage1Narrative } from "./narrative/stage1";
import { DialogBox } from "../shared/dialog_box";
import { CompletionScreen } from "../shared/completion_screen";
import type { StageDefinition } from "./stages/stage";

// How long the attack-target frame is visible before an auto-attack's damage
// actually applies (ADR-0004) — long enough for the player to register which
// enemy is about to be hit, without feeling like a wait.
const ATTACK_HIGHLIGHT_DELAY_MS = 400;

export class MainWorld extends GameWorld {
  // Public, unlike `scenario.emitter` (which MainWorld consumes internally
  // for presentation): this is the seam StageManager listens on to know when
  // it's safe to act on a finished stage — after the "Victory!"/"Defeated..."
  // indicator has actually been read, not the instant GameEnd fires (specs/08
  // requires progression to be automatic, not that it can't let the player
  // see the outcome first — see the "stageEnded" emit below).
  public emitter = new EventEmitter();

  protected player: Player | null = null;

  protected scenario: Scenario;

  protected isPlayerTurn = false;
  protected playerUnits: UnitPosition[] = [];
  protected selectedUnit: UnitPosition | null = null;

  // True while a multi-step auto-path move (ADR-0003) is walking its
  // remaining steps one at a time. isUnitMoving alone isn't enough to gate
  // re-entrant clicks here: it clears briefly between each step's animation
  // while handleTileClick's loop is still awaiting the next one.
  protected isAutoPathing = false;

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
        // Generic on purpose: each stage's narrative script already plays a
        // stage-specific win dialog (e.g. "Open the gate!") *before* GameEnd
        // fires (narrative pauses the pipeline — see the constructor's
        // worldObservable subscribe comment), so this banner only needs to
        // acknowledge the mechanical outcome, not restate where the win
        // happened.
        this.showTurnIndicator("Victory!", 0x4ad66a, () =>
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

  /**
   * Issue #159 "game completion state" (specs/08 "Stage Completed State":
   * "the game displays an end screen and accepts no further gameplay
   * input"). Called by `StageManager` once it knows a win was on the final
   * stage — MainWorld itself has no notion of "final", only `StageManager`
   * does (via `stages/sequence.ts`'s `nextStageIndex`). Input is already
   * blocked by this point (the `gameEnd` listener above cleared
   * `isPlayerTurn`/the End Turn button before this is ever called, and the
   * store rejects gameplay actions in a terminal state regardless);
   * `CompletionScreen`'s own click-swallowing backdrop is the same second
   * line of defence `DialogBox` uses, not the only one.
   */
  public showCompletionScreen() {
    this.addChild(new CompletionScreen("Whirley's journey is complete."));
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
    const indicator = new Text({
      text,
      style: {
        fontSize: 24,
        fontWeight: "bold",
        fill: color,
        fontFamily: "Arial",
        align: "center",
      },
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
    return (
      !this.isDestroyed &&
      this.isPlayerTurn &&
      !this.dialogActive &&
      !this.isUnitMoving &&
      !this.isAutoPathing
    );
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

  // Resolves once the in-flight move animation (shared/game_world.ts's Move
  // case) has finished, so a multi-step auto-path can dispatch its steps one
  // at a time instead of starting several tweens on the same sprite at once.
  protected waitWhileUnitMoving(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        // destroy() (shared/game_world.ts) stops the current tween without
        // firing its onComplete, so isUnitMoving would otherwise never clear
        // once this instance is torn down mid-wait — resolve anyway so the
        // caller reaches its own isDestroyed check instead of hanging.
        if (!this.isUnitMoving || this.isDestroyed) {
          resolve();
        } else {
          setTimeout(check, 16);
        }
      };
      check();
    });
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected findUnitById(state: State, unitId: number): UnitPosition | undefined {
    return state.units.find(u => u.unit.id === unitId);
  }

  protected async handleTileClick(tile: Tileable) {
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
          // Redraw: the target may have died (its frame should disappear) or
          // the remaining eligible targets may have changed — the highlight
          // must reflect the post-attack state, not linger from selection
          // time (spec 03 "Visual Feedback").
          this.updateHighlights();
        }
      }
      return;
    }

    // Move the selected unit — possibly several steps in one click, to any
    // hex within its full remaining budget, not just an adjacent one
    // (ADR-0003, superseding spec 03's original "no multi-step pathfinding"
    // scope note).
    if (!this.selectedUnit) {
      return;
    }

    const path = pathTo(this.selectedUnit.unit, this.selectedUnit.position, tile.coordinates, state);
    if (!path) {
      return;
    }

    // Captured before dispatch: Observable.push() (shared/observable.ts) notifies
    // subscribers synchronously, so moveUnit() below can synchronously trigger a
    // narrative beat whose handler (onNarrativeUpdate) sets this.selectedUnit to
    // null before this function resumes — reading it again afterward isn't safe.
    const movedUnitId = this.selectedUnit.unit.id;
    const unit = this.selectedUnit.unit;

    this.isAutoPathing = true;
    try {
      for (const direction of path) {
        this.scenario.moveUnit(unit, direction);
        await this.waitWhileUnitMoving();
        if (this.isDestroyed) {
          // This instance was torn down mid-wait (e.g. StageManager already
          // swapped in the next stage's MainWorld — issue #175) — nothing
          // below is safe to touch on a destroyed Pixi Container tree.
          return;
        }
        if (!this.isPlayerTurn || this.dialogActive) {
          // A narrative dialog opened (or the stage ended) partway through —
          // don't keep walking the rest of the precomputed path underneath it.
          return;
        }
      }
    } finally {
      this.isAutoPathing = false;
    }

    // Auto-attack (ADR-0004): landing adjacent to exactly one eligible enemy
    // always attacks it — there's no way to end a move next to an
    // unambiguous target without attacking. With 2+ eligible enemies the
    // choice is genuinely ambiguous, so this doesn't auto-resolve; it keeps
    // this unit selected (regardless of remaining movement budget) and
    // highlighted so the player's next click — on one of the highlighted
    // enemies — resolves it via the existing manual click-to-attack path
    // above.
    const postMoveState = this.game.world.getState();
    const moved = this.findUnitById(postMoveState, movedUnitId);
    if (moved) {
      const targets = validAttackTargets(moved.unit, moved.position, "human", postMoveState);
      if (targets.length === 1) {
        this.selectedUnit = moved;
        this.updateHighlights(); // shows the attack-target frame before damage lands
        await this.delay(ATTACK_HIGHLIGHT_DELAY_MS);
        if (this.isDestroyed) {
          // Torn down while the highlight delay was in flight (issue #175) —
          // the reducer/scenario are still safe to call (they're plain
          // objects, not Pixi), but there's no world left to reflect the
          // result in, and nothing later in this method is safe to run.
          return;
        }
        this.scenario.attackUnit(moved.unit, targets[0]);
      } else if (targets.length > 1) {
        this.selectedUnit = moved;
        this.updateHighlights();
        return;
      }
    }

    // After moving (and any auto-attack), keep the same unit selected if it
    // still has movement budget (so the player can spend further remaining
    // budget); otherwise fall back to the next unit that has not moved yet.
    // The turn no longer ends on its own — the player ends it explicitly via
    // the End Turn button (spec 03).
    const finalState = this.game.world.getState();
    const finalUnit = this.findUnitById(finalState, movedUnitId);
    const range = finalUnit ? moveRange(finalUnit.unit, finalUnit.position, finalState) : [];
    if (finalUnit && range.length > 0) {
      this.selectedUnit = finalUnit;
    } else {
      const unitsToMove = this.scenario.getUnitsToMove();
      const nextUnit = this.playerUnits.find(u => unitsToMove.has(u.unit.id));
      this.selectedUnit = nextUnit || null;
    }
    this.updateHighlights();
  }

  // Redraw the valid-move highlights and attack-target highlights for the
  // currently selected unit. Both are absent when it is not the human's
  // turn, a dialog is up, or nothing is selected (spec 03 "Visual Feedback").
  protected updateHighlights() {
    // Guards a destroyed instance's Container tree (issue #175): an async
    // caller (handleTileClick, suspended on a move/attack-delay await) can
    // resume after StageManager has already destroyed this MainWorld, and
    // highlightContainer.removeChildren() below would throw on it.
    if (this.isDestroyed) {
      return;
    }

    this.highlightContainer.removeChildren().forEach(child => child.destroy());

    if (!this.isPlayerTurn || this.dialogActive || !this.selectedUnit) {
      return;
    }

    const state = this.game.world.getState();
    // Re-read the live unit from state: its position/budget may have changed
    // since selection (e.g. right after a move).
    const live = this.findUnitById(state, this.selectedUnit!.unit.id);
    if (!live) {
      return;
    }

    for (const dest of moveRange(live.unit, live.position, state)) {
      const tile = this.getTerrainAt(dest);
      if (!tile) continue;
      const marker = new Graphics();
      marker.poly(this.createHexPoints(50));
      marker.fill({ color: 0x4ad66a, alpha: 0.25 });
      marker.stroke({ width: 3, color: 0x4ad66a, alpha: 0.9 });
      marker.position.set(tile.x, tile.y);
      this.highlightContainer.addChild(marker);
    }

    // Attack-target highlight (ADR-0004 / spec 04): a frame around every
    // enemy this unit could attack right now, whether the player is about to
    // click one manually or an auto-attack is about to resolve against it.
    for (const target of validAttackTargets(live.unit, live.position, "human", state)) {
      const tile = this.getTerrainAt(target);
      if (!tile) continue;
      const frame = new Graphics();
      frame.poly(this.createHexPoints(50));
      frame.stroke({ width: 4, color: 0xff3333, alpha: 0.95 });
      frame.position.set(tile.x, tile.y);
      this.highlightContainer.addChild(frame);
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
    bg.roundRect(0, 0, width, height, 10);
    bg.fill({ color: 0x1a1a2e, alpha: 0.95 });
    bg.stroke({ width: 2, color: 0x4aadd6, alpha: 1 });
    button.addChild(bg);

    const label = new Text({
      text: "End Turn",
      style: {
        fontSize: 18,
        fontWeight: "bold",
        fill: 0xffffff,
        fontFamily: "Arial",
      },
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
