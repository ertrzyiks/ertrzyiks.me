import type { Application } from "pixi.js";

import board from "./boards/board1.json";
import { preload } from "./preload";
import { MainWorld } from "./game_world";

export async function create(app: Application) {
  const { sheet } = await preload();

  const world = new MainWorld(board, app.renderer.events, sheet);

  return world;
}