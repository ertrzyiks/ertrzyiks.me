import image from "../assets/sprites/board1-0.png";
import data from "../assets/sprites/board1-0.json";
import introImage from "../assets/sprites/intro-0.png";
import introData from "../assets/sprites/intro-0.json";
import { Spritesheet, Assets } from "pixi.js";

export async function preload() {
  Assets.add({ alias: "board1", src: image.src });
  const boardTexture = await Assets.load("board1");
  const sheet = new Spritesheet(boardTexture.baseTexture, data);
  await sheet.parse();

  // Load intro sheet to make unit textures (ship) available globally
  const introTexture = await Assets.load(introImage.src);
  const introSheet = new Spritesheet(introTexture.baseTexture, introData);
  await introSheet.parse();

  return { sheet };
}
