import { describe, expect, it } from "vitest";
import { packAtlas } from "./atlas";
import { decodePngToRgba } from "./png-test-helpers";
import type { RgbaImage } from "./png";

function solidImage(width: number, height: number, rgba: number[]): RgbaImage {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels.set(rgba, i * 4);
  }
  return { width, height, pixels };
}

describe("packAtlas", () => {
  it("throws when given no sprites", () => {
    expect(() => packAtlas([], { imageName: "atlas-0.png" })).toThrow();
  });

  it("throws on duplicate sprite names", () => {
    const image = solidImage(1, 1, [255, 0, 0, 255]);
    expect(() =>
      packAtlas(
        [
          { name: "a", image },
          { name: "a", image },
        ],
        { imageName: "atlas-0.png" },
      ),
    ).toThrow(/duplicate/i);
  });

  it("reproduces the exact layout of the existing board1-0 atlas for two 100x87 sprites", () => {
    // board1-0.json (TexturePacker-generated) packs grass/water this way —
    // matching it exactly is the strongest signal our hand-rolled packer is
    // format-compatible with what preload.ts/Spritesheet already expect.
    const grass = solidImage(100, 87, [0, 200, 0, 255]);
    const water = solidImage(100, 87, [0, 0, 200, 255]);

    const { json } = packAtlas(
      [
        { name: "grass", image: grass },
        { name: "water", image: water },
      ],
      { imageName: "board1-0.png" },
    );

    expect(json.frames.grass.frame).toEqual({ x: 1, y: 1, w: 100, h: 87 });
    expect(json.frames.water.frame).toEqual({ x: 103, y: 1, w: 100, h: 87 });
    expect(json.meta.size).toEqual({ w: 204, h: 89 });
  });

  it("places a single sprite inset by padding on all sides", () => {
    const image = solidImage(10, 6, [1, 2, 3, 255]);
    const { json } = packAtlas([{ name: "solo", image }], {
      imageName: "atlas-0.png",
      padding: 2,
    });

    expect(json.frames.solo.frame).toEqual({ x: 2, y: 2, w: 10, h: 6 });
    expect(json.meta.size).toEqual({ w: 14, h: 10 });
  });

  it("fills out frame metadata matching the TexturePacker manifest shape", () => {
    const image = solidImage(4, 3, [1, 2, 3, 255]);
    const { json } = packAtlas([{ name: "solo", image }], {
      imageName: "atlas-0.png",
    });

    expect(json.frames.solo).toEqual({
      frame: { x: 1, y: 1, w: 4, h: 3 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 4, h: 3 },
      sourceSize: { w: 4, h: 3 },
    });
    expect(json.meta.image).toBe("atlas-0.png");
    expect(json.meta.format).toBe("RGBA8888");
    expect(json.meta.scale).toBe("1");
  });

  it("wraps sprites onto a new row once maxWidth is exceeded", () => {
    const a = solidImage(10, 5, [1, 0, 0, 255]);
    const b = solidImage(10, 5, [0, 1, 0, 255]);

    const { json } = packAtlas(
      [
        { name: "a", image: a },
        { name: "b", image: b },
      ],
      { imageName: "atlas-0.png", padding: 1, maxWidth: 15 },
    );

    expect(json.frames.a.frame).toEqual({ x: 1, y: 1, w: 10, h: 5 });
    expect(json.frames.b.frame).toEqual({ x: 1, y: 8, w: 10, h: 5 });
    expect(json.meta.size).toEqual({ w: 12, h: 14 });
  });

  it("produces a PNG whose decoded pixels match each sprite at its frame position, transparent elsewhere", () => {
    const red = solidImage(2, 2, [255, 0, 0, 255]);
    const blue = solidImage(2, 2, [0, 0, 255, 255]);

    const { png, json } = packAtlas(
      [
        { name: "red", image: red },
        { name: "blue", image: blue },
      ],
      { imageName: "atlas-0.png" },
    );

    const decoded = decodePngToRgba(png);
    expect(decoded.width).toBe(json.meta.size.w);
    expect(decoded.height).toBe(json.meta.size.h);

    function pixelAt(x: number, y: number): number[] {
      const offset = (y * decoded.width + x) * 4;
      return [...decoded.pixels.subarray(offset, offset + 4)];
    }

    const redFrame = json.frames.red.frame;
    const blueFrame = json.frames.blue.frame;

    expect(pixelAt(redFrame.x, redFrame.y)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(blueFrame.x, blueFrame.y)).toEqual([0, 0, 255, 255]);
    // The padding pixel just left of the red frame must stay transparent.
    expect(pixelAt(redFrame.x - 1, redFrame.y)).toEqual([0, 0, 0, 0]);
  });
});
