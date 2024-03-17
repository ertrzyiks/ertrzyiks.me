import type { DisplayObject } from "pixi.js";
import RecursiveTween from "../../lib/recursive_tween";
import { Tween, Easing } from "@tweenjs/tween.js";
import { getNextSpreadingWave } from "./get_spreading_wave";
import type { CubeCoordinates, PointLike } from "honeycomb-grid";
import { TerrainTiles } from "../../shared/terrain_tiles";
import { Tile } from "../../shared/renderable/tile";

export interface GridSpreadAnimationOptions {
  startCube: CubeCoordinates;
  terrainTiles: TerrainTiles<Tile>;
  duration: number;
}

export type CompleteCallback = () => void;

export class GridSpreadAnimation {
  get duration() {
    return this.options.duration;
  }

  get from() {
    return { alpha: 0 };
  }

  get to() {
    return { alpha: 1 };
  }

  get startCube() {
    return this.options.startCube;
  }
  get terrainTiles() {
    return this.options.terrainTiles;
  }

  private state: any;
  private subject: Array<DisplayObject> = [];
  private waveCache: { [wave: number]: Array<DisplayObject> } = {};
  private tween: RecursiveTween;
  private onCompleteCallback?: CompleteCallback | null = null;

  constructor(private options: GridSpreadAnimationOptions) {
    this.state = { ...this.from };

    this.tween = new RecursiveTween();
    this.tween.onCycle(this.handleCycle.bind(this));
    this.tween.onUpdate(this.handleUpdate.bind(this));
  }

  start() {
    this.tween.start();
    return this;
  }

  stop() {
    this.tween.stop();
    return this;
  }

  onComplete(callback: CompleteCallback) {
    this.onCompleteCallback = callback;
    return this;
  }

  hexToElement(coords: PointLike) {
    return this.terrainTiles.get(coords);
  }

  nextWave(currentCycle: number, last: boolean) {
    if (last) {
      return Array.from(this.terrainTiles.keys())
        .filter((hex) => {
          const element = this.hexToElement(hex);
          return element && element.alpha < 0.1;
        })
        .map((hex) => this.hexToElement(hex));
    }

    return getNextSpreadingWave(this.startCube, currentCycle)
      .map((point) => (point ? this.terrainTiles.get(point) : null))
      .filter((sprite) => sprite != null);
  }

  createTween(_: number) {
    return new Tween(this.state).easing(Easing.Sinusoidal.InOut);
  }

  handleUpdate() {
    for (let i = 0; i < this.subject.length; i++) {
      this.applyUpdate(this.subject[i], this.state);
    }
  }

  protected applyUpdate(element: DisplayObject, values: { alpha: number }) {
    element.alpha = values.alpha;
  }

  handleCycle(_: Tween | null, currentCycle: number) {
    const cycles = 15;

    this.state = { ...this.from };
    if (currentCycle > cycles) {
      this.onCompleteCallback && this.onCompleteCallback();
      return false;
    }

    const tween = this.createTween(currentCycle);
    tween.to(this.to, Math.max(this.duration - 5 * currentCycle, 10));
    const isLast = currentCycle >= cycles;
    this.waveCache[currentCycle] =
      this.waveCache[currentCycle] || this.nextWave(currentCycle, isLast);
    this.subject = this.waveCache[currentCycle];
    return tween;
  }
}
