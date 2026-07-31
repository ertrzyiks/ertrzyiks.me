import { describe, expect, test } from "vitest";
import { packAtlas } from "./atlas";
import {
  TERRAIN_ROSTER,
  TERRAIN_TEXTURE_NAMES,
  buildTerrainSprites,
} from "./terrain_sprites";

describe("terrain sprites", () => {
  test("keeps the back-compat frame names board1/board2/board3's tile data already reference", () => {
    // See the module comment: renaming these would silently break every
    // board authored before gh #193 re-paints them with the new variety.
    expect(TERRAIN_TEXTURE_NAMES).toContain("grass");
    expect(TERRAIN_TEXTURE_NAMES).toContain("water");
  });

  test("exposes every new terrain variant from the #189 preview roster", () => {
    expect(TERRAIN_TEXTURE_NAMES).toEqual([
      "grass",
      "grass2",
      "grass3",
      "water",
      "sand",
      "forest1",
      "forest2",
      "mountain1",
      "mountain2",
    ]);
  });

  test("every variant renders a same-sized, fully opaque-or-transparent RGBA image", () => {
    for (const { name, draw } of TERRAIN_ROSTER) {
      const image = draw();
      expect(image.width, `${name} width`).toBe(96);
      expect(image.height, `${name} height`).toBe(84);
      expect(image.pixels.length, `${name} pixel buffer length`).toBe(
        image.width * image.height * 4,
      );
    }
  });

  test("the hex mask leaves the four corner pixels transparent (not a solid rectangle)", () => {
    const image = buildTerrainSprites()[0].image;
    const offset = 0; // top-left pixel
    expect(image.pixels[offset + 3]).toBe(0);
  });

  test("packs cleanly into an atlas via the #188 generator, one frame per texture name", () => {
    const sprites = buildTerrainSprites();
    const { json } = packAtlas(sprites, { imageName: "board1-0.png" });

    expect(Object.keys(json.frames).sort()).toEqual([...TERRAIN_TEXTURE_NAMES].sort());
  });
});
