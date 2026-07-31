import type { Application } from "pixi.js";

import { preload } from "./preload";
import { StageManager } from "./stage_manager";

export async function create(app: Application) {
  const { sheet, unitsSheet } = await preload();

  return new StageManager(app.renderer.events, sheet, unitsSheet);
}
