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

  // Load the dedicated units sheet (gh #192) to make its textures (hero,
  // wanderer, wolf, bandit, banditCaptain) available globally the same way —
  // game_world.ts's Spawn handling looks them up via Texture.from(name).
  const unitsTexture = await Assets.load(unitsImage.src);
  const unitsSheet = new Spritesheet(unitsTexture.source, unitsData);
  await unitsSheet.parse();

  return { sheet };
}
