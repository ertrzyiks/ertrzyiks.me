import { GameWorld } from "../shared/game_world";
import { Tileable } from "../shared/renderable/tileable";
import TWEEN from "@tweenjs/tween.js";
import { Point, EventEmitter, type EventSystem, Spritesheet } from "pixi.js";
import { GridSpreadAnimation } from "./grid/spreading_animation";
import type { CubeCoordinates } from "honeycomb-grid";
import type { GameTileHex, Board } from "../core";
import { Scenario } from "./scenario";

export class IntroWorld extends GameWorld {
  public emitter: EventEmitter;

  protected scenario: Scenario;
  protected currentAnimation: GridSpreadAnimation | null = null;

  constructor(
    protected board: Board,
    protected events: EventSystem,
    protected sheet: Spritesheet
  ) {
    // The intro's single atlas (intro-0) carries both its terrain (water)
    // and its "ship" unit frame, so it doubles as its own units sheet — see
    // shared/game_world.ts's constructor comment for why Spawn needs one
    // passed directly rather than relying on Texture.from(name).
    super(board, events, sheet, sheet);
    this.emitter = new EventEmitter();
    this.scenario = new Scenario(this.game);
  }

  setup(point: Point) {
    // Convert screen coordinates to viewport-relative coordinates
    const localPoint = this.viewport.toLocal(new Point(point.x, point.y));

    // Find the tile that contains this point
    let clickedTile: Tileable | null = null;
    for (const tile of this.viewport.children) {
      if (tile instanceof Tileable) {
        const bounds = tile.getBounds();
        if (bounds.containsPoint(localPoint.x, localPoint.y)) {
          clickedTile = tile;
          break;
        }
      }
    }

    if (clickedTile instanceof Tileable) {
      const coords = clickedTile.coordinates;

      this.currentAnimation = this.animateFrom(coords)
        .start()
        .onComplete(() => {
          this.scenario.start(coords);

          setTimeout(() => {
            this.emitter.emit("finish");
          }, 1000);
        });

      this.teardown();
    }
  }

  teardown() {
    this.viewport.once("clicked", () => {
      if (this.currentAnimation) {
        this.currentAnimation.stop();
      }

      this.fadeOut().start();
    });
  }

  protected createWorldTile(hex: GameTileHex) {
    const sprite = super.createWorldTile(hex);
    sprite.alpha = 0;
    return sprite;
  }

  // Fog-of-war (base GameWorld's renderFog/updateFog) is a real-gameplay
  // mechanic keyed on a unit's sight range — the intro's Ship has none (it's
  // a scripted cinematic, not a player unit with hidden information to
  // reveal), so every fog tile would otherwise stay permanently visible at
  // its full 85% black opacity for the whole scene. Skip building fog tiles
  // at all; updateFog() is then naturally a no-op against an empty
  // fogTiles map.
  protected renderFog() {}

  private fadeOut() {
    let state = { alpha: 1 };
    return new TWEEN.Tween(state, true)
      .to({ alpha: 0 }, 100)
      .onUpdate(() => {
        this.alpha = state.alpha;
      })
      .onComplete(() => {
        this.emitter.emit("exit");
      });
  }

  private animateFrom(coords: CubeCoordinates) {
    return new GridSpreadAnimation({
      startCube: coords,
      terrainTiles: this.terrainTiles,
      duration: 80,
    });
  }
}
