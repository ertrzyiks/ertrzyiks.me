import image from "../assets/sprites/board1-0.png";
import data from "../assets/sprites/board1-0.json";
import unitsImage from "../assets/sprites/units-0.png";
import unitsData from "../assets/sprites/units-0.json";
import { Spritesheet, Assets } from "pixi.js";

export async function preload() {
  Assets.add({ alias: "board1", src: image.src });
  const boardTexture = await Assets.load("board1");
  const sheet = new Spritesheet(boardTexture.source, data);
  await sheet.parse();

  // Dedicated units sheet (gh #192: hero, wanderer, wolf, bandit,
  // banditCaptain). Returned alongside `sheet` and read directly via
  // `unitsSheet.textures[name]` — not through Texture.from(name)'s global
  // Cache, which never gets populated for a manually-constructed/parsed
  // Spritesheet like this one (that only happens via the real
  // Assets.load(".json") pipeline).
  const unitsTexture = await Assets.load(unitsImage.src);
  const unitsSheet = new Spritesheet(unitsTexture.source, unitsData);
  await unitsSheet.parse();

  return { sheet, unitsSheet };
}
