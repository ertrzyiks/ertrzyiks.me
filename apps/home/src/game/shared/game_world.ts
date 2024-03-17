import {
  Container,
  EventBoundary,
  type IDestroyOptions,
  Sprite,
  Spritesheet,
  type EventSystem,
} from "pixi.js";
import { GameViewport } from "./viewport";
import { Tile } from "./renderable/tile";
import TWEEN from "@tweenjs/tween.js";
import type { Board, State, GameTileHex } from "../core";
import { Game, GameEventType } from "../core";
import type { CubeCoordinates } from "honeycomb-grid";
import { cubeToCartesian } from "../core/grid/helpers";
import { TerrainTiles } from "./terrain_tiles";
import type { ObservableSubscriptionDone } from "./observable";
import { type GameEvent } from "../core";

export class GameWorld extends Container {
  protected game: Game;
  protected viewport: GameViewport;
  protected boundary: EventBoundary;
  protected currentTween: TWEEN.Tween | null = null;
  protected tickerFunction = () => this.cull();
  protected terrainTiles: TerrainTiles<Tile> = new TerrainTiles();

  protected ship: Tile | null = null;

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

    // ticker.add(this.tickerFunction);

    this.renderTerrain();
    this.observeWorldUpdates();

    this.addChild(this.viewport);
  }

  protected observeWorldUpdates() {
    this.game.worldObservable.subscribe(this.onWorldUpdate.bind(this));
  }

  protected onWorldUpdate(
    { action }: { state: State; action: GameEvent },
    done: ObservableSubscriptionDone
  ) {
    switch (action.type) {
      case GameEventType.Spawn:
        const tile = this.getTerrainAt(action.position);

        if (tile) {
          // this.ship = new Tile(Texture.fromFrame("ship"), action.position);
          this.ship = new Tile(
            this.sheet.textures["ship.png"],
            action.position
          );
          this.ship.scale.x = -1;
          this.ship.x = tile.x;
          this.ship.y = tile.y;
          this.viewport.addChild(this.ship);
        }

        done();
        break;

      case GameEventType.Move:
        const tile1 = this.getTerrainAt(action.position);

        if (tile1) {
          this.currentTween = new TWEEN.Tween(this.ship)
            .to({ x: tile1.x, y: tile1.y }, 1000)
            .delay(300)
            .onComplete(() => {
              if (this.ship) {
                this.ship.coordinates = action.position;
              }
              done();
            });

          this.currentTween.start();
        }

        break;

      default:
        done();
        break;
    }
  }

  protected createWorldTile(hex: GameTileHex) {
    const { x, y } = hex.toPoint();

    const coords = hex.cube();

    const sprite = new Tile(this.sheet.textures[hex.textureName], coords);

    sprite.position.set(x, y);
    sprite.eventMode = "dynamic";
    // sprite.buttonMode = false;

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

    // this.ticker.remove(this.tickerFunction);
    this.game.finish();
    super.destroy(options);
  }
}
