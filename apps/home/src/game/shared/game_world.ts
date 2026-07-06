import {
  Container,
  EventBoundary,
  Graphics,
  type IDestroyOptions,
  Sprite,
  Spritesheet,
  Texture,
  type EventSystem,
} from "pixi.js";
import { GameViewport } from "./viewport";
import { Tile } from "./renderable/tile";
import TWEEN from "@tweenjs/tween.js";
import type { Board, State, GameTileHex } from "../core";
import { Game, GameEventType } from "../core";
import { PlayerColor } from "../core/player/player";
import type { CubeCoordinates } from "honeycomb-grid";
import { cubeToCartesian, cubeKey } from "../core/grid/helpers";
import { TerrainTiles } from "./terrain_tiles";
import type { ObservableSubscriptionDone } from "./observable";
import { type GameEvent } from "../core";

const FOG_HEX_SIZE = 50;
const FOG_HEX_Y_OFFSET = 4;

function buildFogGraphic(): Graphics {
  const g = new Graphics();
  g.beginFill(0x000000, 0.85);
  const points: number[] = [];
  for (let side = 0; side < 7; side++) {
    points.push(
      FOG_HEX_SIZE * Math.cos((side * 2 * Math.PI) / 6),
      FOG_HEX_Y_OFFSET + FOG_HEX_SIZE * Math.sin((side * 2 * Math.PI) / 6)
    );
  }
  g.drawPolygon(points);
  g.endFill();
  return g;
}

export class GameWorld extends Container {
  protected game: Game;
  protected viewport: GameViewport;
  protected boundary: EventBoundary;
  protected currentTween: TWEEN.Tween | null = null;
  protected tickerFunction = () => this.cull();
  protected terrainTiles: TerrainTiles<Tile> = new TerrainTiles();
  protected unitSprites: Map<number, Tile> = new Map();
  protected fogTiles: Map<string, Graphics> = new Map();
  protected unitContainer: Container = new Container();
  protected fogContainer: Container = new Container();

  constructor(
    protected board: Board,
    protected events: EventSystem,
    protected sheet: Spritesheet
  ) {
    super();
    this.game = new Game(board);

    this.viewport = new GameViewport({
      worldWidth: this.game.world.getState().worldWidth,
      worldHeight: this.game.world.getState().worldHeight,
      events,
    });

    this.boundary = new EventBoundary(this.viewport);

    this.renderTerrain();
    this.viewport.addChild(this.unitContainer);
    this.viewport.addChild(this.fogContainer);
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
          const shipTexture = Texture.from("ship");

          // Create a container to hold both background and ship
          const unitGroup = new Container();
          unitGroup.position.set(tile.x, tile.y);

          // Create colored background circle
          const background = new Graphics();
          const bgColor = action.owner.color === PlayerColor.RED ? 0xff5555 : 0x5599ff;
          background.beginFill(bgColor, 0.8);
          background.drawCircle(0, 0, 35);
          background.endFill();

          // Add border
          background.lineStyle(2, bgColor, 1);
          background.drawCircle(0, 0, 35);

          // Create ship sprite
          const sprite = new Tile(shipTexture, action.position);
          sprite.scale.x = -1;
          sprite.position.set(0, 0);
          sprite.tint = 0xffffff;

          unitGroup.addChild(background);
          unitGroup.addChild(sprite);

          this.unitSprites.set(action.unit.id, sprite);
          this.unitContainer.addChild(unitGroup);
        }
        this.updateFog(state);
        done();
        break;
      }

      case GameEventType.Move: {
        const unitSprite = this.unitSprites.get(action.unit.id);
        const moveTile = this.getTerrainAt(action.position);
        this.updateFog(state);
        if (unitSprite && moveTile) {
          this.currentTween = new TWEEN.Tween(unitSprite)
            .to({ x: moveTile.x, y: moveTile.y }, 500)
            .delay(100)
            .onComplete(() => {
              unitSprite.coordinates = action.position;
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
      this.viewport.addChild(sprite);
    });
  }

  protected getTerrainAt(pos: CubeCoordinates) {
    const point = cubeToCartesian(pos);
    return this.terrainTiles.get(point);
  }

  cull() {
    const viewport = this.viewport;
    const corner = viewport.corner;
    const length = viewport.children.length;
    const margin = 150;

    const left = corner.x - margin;
    const top = corner.y - margin;
    const right = corner.x + viewport.screenWidth + margin;
    const bottom = corner.y + viewport.screenHeight + margin;

    for (let i = 0; i < length; i++) {
      const child = this.viewport.children[i];

      if (!(child instanceof Sprite)) continue;

      child.visible =
        child.x >= left &&
        child.y >= top &&
        child.x + child.width <= right &&
        child.y + child.height <= bottom;
    }
  }

  destroy(options?: IDestroyOptions | boolean) {
    if (this.currentTween) {
      this.currentTween.stop();
    }

    this.game.finish();
    super.destroy(options);
  }
}
