import { Polygon, Texture } from "pixi.js";
import { Tileable } from "./tileable";
import { cartesianToCube } from "../../core/grid";
import type { CubeCoordinates } from "honeycomb-grid";

const DEBUG = false;

export class Tile extends Tileable {
  constructor(texture: Texture, public coordinates: CubeCoordinates) {
    super(texture, coordinates);

    this.anchor.x = 0.5;
    this.anchor.y = 0.5;

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
      const graphics = new PIXI.Graphics();
      graphics.beginFill(0x121212);
      graphics.drawPolygon(points);
      graphics.endFill();
      graphics.alpha = 0.5;
      this.addChild(graphics);
    }
  }
}
