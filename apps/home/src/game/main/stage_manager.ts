import { Container, type EventSystem, type Spritesheet } from "pixi.js";
import type { GameOutcome } from "../core/game_event";
import { MainWorld } from "./game_world";
import { STAGE_SEQUENCE, nextStageIndex, type StageSequenceEntry } from "./stages/sequence";

/**
 * Issue #152 "stage progression": sequences `MainWorld` through
 * `stages/sequence.ts`'s ordered stages, reacting to the `"stageEnded"`
 * event each `MainWorld` emits once its win/lose indicator has finished
 * (see game_world.ts's own comment on that emit).
 *
 * Lose reloads the *same* `MainWorld` instance with a freshly-built
 * definition (`MainWorld.reloadStage` — board-preserving, matches
 * `Scenario.reload`'s own board-preserving contract). Win to a *different*
 * board cannot reuse that path: `Game`/`World`'s grid is fixed at
 * construction (confirmed in core/game.ts — `createGrid(board)` runs once,
 * and the `Reset` event never touches tiles), so advancing constructs a
 * whole new `MainWorld` and swaps it in as this container's child, mirroring
 * the destroy-old/mount-new pattern `game_loader.ts` already uses for the
 * intro -> main handoff.
 *
 * On the final stage's win, `nextStageIndex` returns `null` and this class
 * shows `MainWorld`'s completion screen instead of advancing (issue #159,
 * specs/08-stage-system.md "Stage Completed State").
 */
export class StageManager extends Container {
  protected currentIndex = 0;
  protected mainWorld: MainWorld;

  constructor(
    protected events: EventSystem,
    protected sheet: Spritesheet
  ) {
    super();
    this.mainWorld = this.mountStage(this.currentIndex);
  }

  protected currentEntry(): StageSequenceEntry {
    return STAGE_SEQUENCE[this.currentIndex];
  }

  protected mountStage(index: number): MainWorld {
    const entry = STAGE_SEQUENCE[index];
    // humanId is read off the freshly-built definition, not hardcoded, to
    // match the same pattern MainWorld's own constructor default uses
    // (`createStage1Narrative(definition.player.id, "wanderer")`) — every
    // stage's human player id happens to be "human" today, but this stays
    // correct if that ever varied per stage.
    const definition = entry.createDefinition();
    const world = new MainWorld(
      entry.board,
      this.events,
      this.sheet,
      definition,
      entry.createNarrative(definition.player.id, "wanderer")
    );
    world.emitter.on("stageEnded", this.onStageEnded.bind(this));
    this.addChild(world);
    return world;
  }

  protected onStageEnded({ outcome }: { outcome: GameOutcome }) {
    if (outcome === "lose") {
      this.mainWorld.reloadStage(this.currentEntry().createDefinition());
      return;
    }

    const next = nextStageIndex(this.currentIndex);
    if (next === null) {
      // Issue #159: final stage won, no further stage loads (spec 08
      // acceptance criteria) — show the completion state instead.
      this.mainWorld.showCompletionScreen();
      return;
    }

    // No `texture`/`baseTexture` here (unlike game_loader.ts's own destroy
    // call for the intro viewport): board tiles and unit sprites read from
    // the shared `sheet`/global "ship" texture the *next* MainWorld reuses —
    // destroying those would break its rendering, not just this one's.
    this.removeChild(this.mainWorld);
    this.mainWorld.destroy({ children: true });

    this.currentIndex = next;
    this.mainWorld = this.mountStage(this.currentIndex);
  }
}
