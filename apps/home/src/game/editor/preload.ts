import image0 from "../../assets/sprites/editor-0.png";
import data0 from "../assets/sprites/editor-0.json";
// import * as image1 from '../../assets/sprites/editor-1.png'
// import data1 from '../../assets/sprites/editor-1.json'
// import * as image2 from '../../assets/sprites/editor-2.png'
// import data2 from '../../assets/sprites/editor-2.json'
import { Assets, Spritesheet } from "pixi.js";

export async function preload() {
  const images = [image0];
  const data = [data0];

  images.forEach((image, index) => {
    Assets.add({ src: image.src, alias: `editor${index}` });
  });

  await Assets.load(images.map((_, index) => `editor${index}`));

  const sheets = data.map((atlasData, index) => {
    return new Spritesheet(
      Assets.get(`editor${index}`).texture.baseTexture,
      atlasData
    );
  });

  await Promise.all(sheets.map((sheet) => sheet.parse()));
}
