import { Polygon, Texture, Graphics } from "pixi.js";
import { Tileable } from "./tileable";
import type { CubeCoordinates } from "honeycomb-grid";

const DEBUG = false;

export interface TileDimensions {
  width: number;
  height: number;
}

export class Tile extends Tileable {
  constructor(
    texture: Texture,
    public coordinates: CubeCoordinates,
    dimensions?: TileDimensions
  ) {
    super(texture, coordinates);

    this.anchor.x = 0.5;
    this.anchor.y = 0.5;

    // Terrain callers pass the hex's own width/height getters (honeycomb-grid's
    // real corner-to-corner span) so the sprite is stretched to exactly that
    // size rather than the authored texture's native pixel size — the two
    // differ slightly (terrain_sprites.ts draws at 96x84, a hex at
    // TILE_SIZE=50 spans 100x86.6), and drawing at the texture's native size
    // left a visible gap between adjacent tiles. Unit sprites don't pass this
    // and keep their natural texture size.
    if (dimensions) {
      this.width = dimensions.width;
      this.height = dimensions.height;
    }

    const size = Math.round(this.width / 2);
    const points = [];

    const x = 0;
    const y = 4;

    for (let side = 0; side < 7; side++) {
      points.push(
        x + size * Math.cos((side * 2 * Math.PI) / 6),
        y + size * Math.sin((side * 2 * Math.PI) / 6)
      );
    }

    this.hitArea = new Polygon(points);

    if (DEBUG) {
      const graphics = new Graphics();
      graphics.poly(points);
      graphics.fill(0x121212);
      graphics.alpha = 0.5;
      this.addChild(graphics);
    }
  }
}
