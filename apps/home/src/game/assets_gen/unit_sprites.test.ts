import { describe, expect, test } from "vitest";
import { packAtlas } from "./atlas";
import { UNIT_ROSTER, UNIT_TEXTURE_NAMES, buildUnitSprites } from "./unit_sprites";

describe("unit sprites", () => {
  test("has exactly the 5-sprite roster from the #190 preview (wolf shared by both pack roles)", () => {
    expect(UNIT_TEXTURE_NAMES).toEqual([
      "hero",
      "wanderer",
      "wolf",
      "bandit",
      "banditCaptain",
    ]);
  });

  test("every sprite renders a same-sized, non-empty RGBA image", () => {
    for (const { name, draw } of UNIT_ROSTER) {
      const image = draw();
      expect(image.width, `${name} width`).toBe(96);
      expect(image.height, `${name} height`).toBe(96);
      expect(image.pixels.length, `${name} pixel buffer length`).toBe(
        image.width * image.height * 4,
      );

      const hasOpaquePixel = image.pixels.some((_, i) => i % 4 === 3 && image.pixels[i] > 0);
      expect(hasOpaquePixel, `${name} should not be fully transparent`).toBe(true);
    }
  });

  test("packs cleanly into a single dedicated units atlas via the #188 generator", () => {
    const sprites = buildUnitSprites();
    const { json } = packAtlas(sprites, { imageName: "units-0.png" });

    expect(Object.keys(json.frames).sort()).toEqual([...UNIT_TEXTURE_NAMES].sort());
  });
});
