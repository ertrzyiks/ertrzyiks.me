import { Application } from "pixi.js";
import { EditorWorld } from "./game_world";
import { preload } from "./preload";

export async function create(app: Application) {
  await preload();

  const world = new EditorWorld(app.renderer.events);

  return world;
}
