import image from "../assets/sprites/intro-0.png";
import data from "../assets/sprites/intro-0.json";
import { Assets, Spritesheet } from "pixi.js";

export async function preload() {
  Assets.add({
    alias: "intro",
    src: image.src,
  });

  const texture = await Assets.load("intro");

  const sheet = new Spritesheet(texture.baseTexture, data);

  await sheet.parse();

  return { sheet };
}
