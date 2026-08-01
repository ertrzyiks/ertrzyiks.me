import {
  Container,
  EventBoundary,
  Graphics,
  type DestroyOptions,
  Sprite,
  Spritesheet,
  type EventSystem,
  ColorMatrixFilter,
} from "pixi.js";
import { GameViewport } from "./viewport";
import { Tile } from "./renderable/tile";
import TWEEN, { type Tween } from "@tweenjs/tween.js";
import type { Board, State, GameTileHex } from "../core";
import { Game, GameEventType } from "../core";
import { PlayerColor } from "../core/player/player";
import type { CubeCoordinates } from "honeycomb-grid";
import { cubeToCartesian, cubeKey } from "../core/grid/helpers";
import { moveSucceeded } from "../core/player/movement";
import { TerrainTiles } from "./terrain_tiles";
import type { ObservableSubscriptionDone } from "./observable";
import { type GameEvent } from "../core";
import type { Unit } from "../core/units";
import type { IRenderable } from "./renderable/renderable";

// Duck-typed rather than a static `Unit & IRenderable` param type: not every
// `Unit` is guaranteed Renderable — e.g. main/harness/interaction_harness.ts's
// HarnessTarget is a plain Damageable(Unit) test stand-in with no icon of its
// own — and core/game_event.ts can't import shared's IRenderable without
// inverting the core->shared layering.
function isRenderable(unit: Unit): unit is Unit & IRenderable {
  return typeof (unit as Partial<IRenderable>).textureName === "string";
}

const FOG_HEX_SIZE = 50;
const FOG_HEX_Y_OFFSET = 4;

function buildFogGraphic(): Graphics {
  const g = new Graphics();
  const points: number[] = [];
  for (let side = 0; side < 7; side++) {
    points.push(
      FOG_HEX_SIZE * Math.cos((side * 2 * Math.PI) / 6),
      FOG_HEX_Y_OFFSET + FOG_HEX_SIZE * Math.sin((side * 2 * Math.PI) / 6)
    );
  }
  g.poly(points);
  g.fill({ color: 0x000000, alpha: 0.85 });
  return g;
}

export class GameWorld extends Container {
  protected game: Game;
  protected viewport: GameViewport;
  protected boundary: EventBoundary;
  protected currentTween: Tween | null = null;
  // True for the ~600ms a unit's move tween is in flight (see the Move case
  // in onWorldUpdate below). Subclasses read this to gate input — spec 03
  // "Clicks during... an animation... are ignored".
  protected isUnitMoving = false;
  // Set once destroy() runs (e.g. StageManager swapping in the next stage's
  // MainWorld — main/stage_manager.ts's onStageEnded). A subclass method
  // suspended mid-`await` (a multi-step move, an auto-attack's highlight
  // delay) can resume after this instance — and its Pixi Container tree —
  // has already been torn down; every such resume point must check this
  // before touching any Pixi object again, or risk exactly the kind of
  // internal PixiJS crash (a destroyed Container's renderPipeId no longer
  // resolving) issue #175 reported.
  protected isDestroyed = false;
  protected tickerFunction = () => this.cull();
  protected terrainTiles: TerrainTiles<Tile> = new TerrainTiles();
  protected unitSprites: Map<number, Container> = new Map();
  protected fogTiles: Map<string, Graphics> = new Map();
  protected unitContainer: Container = new Container();
  protected fogContainer: Container = new Container();
  // Holds every tile/unit/fog/highlight sprite, offset by (-minX, -minY) so
  // the board's true top-left corner sits at local (0, 0) — see the
  // constructor's own comment for why pixi-viewport needs that to be true.
  protected worldContainer: Container = new Container();

  constructor(
    protected board: Board,
    protected events: EventSystem,
    protected sheet: Spritesheet,
    // Units' own atlas (gh #192). Passed and read directly — like `sheet` is
    // for terrain — rather than relying on Texture.from(name)'s global Cache
    // lookup: that lookup only ever resolves for Spritesheets registered
    // through the real Assets.load(".json") pipeline (its CacheParser
    // extension is what expands one cache entry into one per frame name).
    // preload.ts manually constructs `new Spritesheet(texture, data)` +
    // `.parse()`, which never touches Cache.set() at all, so Texture.from()
    // here always warned "not found in the Cache" and rendered no icon.
    protected unitsSheet: Spritesheet
  ) {
    super();
    this.game = new Game(board);

    const state = this.game.world.getState();
    // Flat-top hexes at col/row 0 extend into negative X/Y (state.minX/minY
    // — see core/grid/get_grid_bounding_box.ts), but pixi-viewport's clamp
    // plugin (shared/viewport.ts's worldClamp) and its automatic "underflow"
    // re-centering (whenever the board is smaller than the screen — the
    // common case) both hard-assume the rendered world spans [0, worldWidth]
    // x [0, worldHeight], with no way to tell them otherwise. worldContainer
    // shifts every tile/unit/fog/highlight sprite by (-minX, -minY) so that
    // assumption is actually true, and everything downstream — clamp,
    // moveCenter, cull() — can use the simple zero-based math it expects.
    const shiftedWidth = state.worldWidth - state.minX;
    const shiftedHeight = state.worldHeight - state.minY;

    this.viewport = new GameViewport({
      worldWidth: shiftedWidth,
      worldHeight: shiftedHeight,
      events,
    });

    this.worldContainer.position.set(-state.minX, -state.minY);
    this.viewport.addChild(this.worldContainer);

    this.boundary = new EventBoundary(this.viewport);

    this.renderTerrain();
    this.worldContainer.addChild(this.unitContainer);
    this.worldContainer.addChild(this.fogContainer);
    this.renderFog();
    this.observeWorldUpdates();

    this.addChild(this.viewport);
  }

  protected observeWorldUpdates() {
    this.game.worldObservable.subscribe(this.onWorldUpdate.bind(this));
  }

  protected onWorldUpdate(
    { state, action }: { state: State; action: GameEvent },
    done: ObservableSubscriptionDone
  ) {
    switch (action.type) {
      case GameEventType.Spawn: {
        const tile = this.getTerrainAt(action.position);
        if (tile) {
          // Create a container for the multi-layer unit
          const unitContainer = new Container();
          unitContainer.x = tile.x;
          unitContainer.y = tile.y;

          // Layer 1: Colored hexagon background
          const bgHex = new Graphics();
          const hexColor =
            action.owner.color === PlayerColor.RED
              ? 0xff3333
              : action.owner.color === PlayerColor.GREEN
                ? 0x33cc55
                : 0x3366ff;
          bgHex.poly(this.createHexPoints(50));
          bgHex.fill(hexColor);
          bgHex.alpha = 0.6;
          unitContainer.addChild(bgHex);

          // Layer 2: unit sprite on top, picked by type (gh #192) — each
          // concrete unit class sets its own textureName via the Renderable
          // mixin (shared/renderable). Non-Renderable units (e.g. harness
          // test stand-ins) render with just the colored hex background —
          // there's no per-type icon to fall back to since gh #194 removed
          // the old shared "ship" placeholder.
          if (isRenderable(action.unit)) {
            const unitTexture = this.unitsSheet.textures[action.unit.textureName];
            const unitSprite = new Tile(unitTexture, action.position);
            unitContainer.addChild(unitSprite);
          }

          this.unitSprites.set(action.unit.id, unitContainer);
          this.unitContainer.addChild(unitContainer);
        }
        this.updateFog(state);
        done();
        break;
      }

      case GameEventType.Move: {
        const unitSprite = this.unitSprites.get(action.unit.id);
        const moveTile = this.getTerrainAt(action.position);
        this.updateFog(state);
        // The reducer silently no-ops an invalid move (occupied destination,
        // zero budget, out of bounds) rather than throwing — dispatch still
        // notifies subscribers with the attempted action either way. Without
        // this check, a rejected move would still animate the sprite onto the
        // (already-occupied) destination, visually desyncing it from its real
        // logical position. See specs/02-movement-system.md.
        if (unitSprite && moveTile && moveSucceeded(action.unit, action.position, state)) {
          this.isUnitMoving = true;
          this.currentTween = new TWEEN.Tween(unitSprite, true)
            .to({ x: moveTile.x, y: moveTile.y }, 500)
            .delay(100)
            .onComplete(() => {
              // The unit sprite is now a multi-layer Container positioned via
              // x/y (tweened above); it has no Tile `coordinates` to update.
              this.isUnitMoving = false;
              done();
            });
          this.currentTween.start();
        } else {
          done();
        }
        break;
      }

      case GameEventType.TakeDamage: {
        // The reducer removes a unit that died from this hit. If its sprite is
        // no longer backed by a live unit, tear it down so it doesn't linger.
        const stillAlive = state.units.some(
          (u) => u.unit.id === action.target.id
        );
        if (!stillAlive) {
          const sprite = this.unitSprites.get(action.target.id);
          if (sprite) {
            this.unitContainer.removeChild(sprite);
            sprite.destroy();
            this.unitSprites.delete(action.target.id);
          }
        }
        done();
        break;
      }

      case GameEventType.Reset: {
        // Stage reload (specs/08-stage-system.md "Stage Load"): the reducer
        // clears every unit from state, but nothing else tells the renderer
        // to tear down their sprites — without this they'd linger as ghosts.
        // Stop any in-flight move tween first so it doesn't keep animating a
        // sprite that's about to be destroyed.
        if (this.currentTween) {
          this.currentTween.stop();
          this.currentTween = null;
        }
        // .stop() above does not fire the Move tween's onComplete, so
        // isUnitMoving would otherwise stay stuck true forever.
        this.isUnitMoving = false;
        this.unitSprites.forEach((sprite) => {
          this.unitContainer.removeChild(sprite);
          sprite.destroy();
        });
        this.unitSprites.clear();
        this.updateFog(state);
        done();
        break;
      }

      default:
        done();
        break;
    }
  }

  protected updateFog(state: State) {
    const observedPlayerId = state.players[0]?.id;
    if (!observedPlayerId) return;

    const revealed = state.revealedTiles[observedPlayerId] || {};
    this.fogTiles.forEach((fog, key) => {
      fog.visible = !(key in revealed);
    });
  }

  protected renderFog() {
    this.game.world.getState().tiles.forEach((hex: GameTileHex) => {
      const terrainTile = this.terrainTiles.get(hex.coordinates());
      if (!terrainTile) return;

      const fog = buildFogGraphic();
      fog.position.set(terrainTile.x, terrainTile.y);

      const key = cubeKey(hex.cube());
      this.fogTiles.set(key, fog);
      this.fogContainer.addChild(fog);
    });
  }

  protected createWorldTile(hex: GameTileHex) {
    const { x, y } = hex.toPoint();

    const coords = hex.cube();

    const sprite = new Tile(this.sheet.textures[hex.textureName], coords);

    sprite.position.set(x, y);
    sprite.eventMode = "dynamic";

    return sprite;
  }

  protected renderTerrain() {
    this.game.world.getState().tiles.forEach((hex: GameTileHex) => {
      const sprite = this.createWorldTile(hex);
      const coords = hex.coordinates();
      this.terrainTiles.set(coords, sprite);
      this.worldContainer.addChild(sprite);
    });
  }

  protected getTerrainAt(pos: CubeCoordinates) {
    const point = cubeToCartesian(pos);
    return this.terrainTiles.get(point);
  }

  /**
   * Real on-screen position of a tile, accounting for the viewport's current
   * pan/zoom. For callers outside PixiJS's own event system that need to
   * interact with the board as a real click would (e.g. driving a mouse
   * click at this coordinate) rather than dispatching game actions directly.
   */
  public getTileScreenPosition(pos: CubeCoordinates): { x: number; y: number } | null {
    const tile = this.getTerrainAt(pos);
    if (!tile) return null;
    const global = tile.getGlobalPosition();
    return { x: global.x, y: global.y };
  }

  public getTileScreenPositionBySection(sectionName: string): { x: number; y: number } | null {
    return this.getTileScreenPosition(this.game.world.tileBySection(sectionName).cube());
  }

  public getState(): State {
    return this.game.world.getState();
  }

  cull() {
    const viewport = this.viewport;
    const corner = viewport.corner;
    // Sprites live in worldContainer's frame (shifted by (-minX, -minY) from
    // viewport's own frame — see the constructor's comment), so the
    // viewport-frame corner is translated into that same frame before
    // comparing it against each child's own (worldContainer-local) position.
    const offsetX = this.worldContainer.x;
    const offsetY = this.worldContainer.y;
    const length = this.worldContainer.children.length;
    const margin = 150;

    const left = corner.x - offsetX - margin;
    const top = corner.y - offsetY - margin;
    const right = corner.x - offsetX + viewport.screenWidth + margin;
    const bottom = corner.y - offsetY + viewport.screenHeight + margin;

    for (let i = 0; i < length; i++) {
      const child = this.worldContainer.children[i];

      if (!(child instanceof Sprite)) continue;

      child.visible =
        child.x >= left &&
        child.y >= top &&
        child.x + child.width <= right &&
        child.y + child.height <= bottom;
    }
  }

  protected createHexPoints(size: number): number[] {
    const points: number[] = [];
    const yOffset = 4;
    for (let side = 0; side < 6; side++) {
      points.push(
        size * Math.cos((side * 2 * Math.PI) / 6),
        yOffset + size * Math.sin((side * 2 * Math.PI) / 6)
      );
    }
    return points;
  }

  destroy(options?: DestroyOptions | boolean) {
    if (this.currentTween) {
      this.currentTween.stop();
    }

    this.isDestroyed = true;
    this.game.finish();
    super.destroy(options);
  }
}
