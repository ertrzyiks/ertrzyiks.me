import type { Application, Point } from "pixi.js";
import { IntroWorld } from "./game_world";
import { preload } from "./preload";

import board from "./board.json";

export async function create(app: Application, startingPoint: Point) {
  const { sheet } = await preload();

  // @ts-ignore
  const world = new IntroWorld(board, app.renderer.events, sheet);

  setTimeout(() => {
    world.setup(startingPoint);
  }, 100);

  return world;
}
