import image from "../assets/sprites/board1-0.png";
import data from "../assets/sprites/board1-0.json";
import { Spritesheet, Assets } from "pixi.js";

export async function preload() {
  Assets.add({ alias: "board1", src: image.src });

  const texture = await Assets.load("board1");

  const sheet = new Spritesheet(texture.baseTexture, data);

  await sheet.parse();

  return { sheet };
}
