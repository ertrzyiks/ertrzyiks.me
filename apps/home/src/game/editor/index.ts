import { Application } from "pixi.js";
import { EditorWorld } from "./game_world";
import { preload } from "./preload";
import type { Board } from "../core";

export async function create(app: Application) {
  const resources = await preload();

  const world = new EditorWorld(app.renderer.events);

  return world;
}
