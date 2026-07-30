import { describe, expect, it } from "vitest";
import {
  createPixelGrid,
  fillRect,
  parseHexColor,
  setPixel,
  toRgbaImage,
} from "./pixel-grid";

describe("createPixelGrid", () => {
  it("creates height rows of width columns, filled with null by default", () => {
    const grid = createPixelGrid(3, 2);
    expect(grid.length).toBe(2);
    expect(grid.every((row) => row.length === 3)).toBe(true);
    expect(grid.flat().every((cell) => cell === null)).toBe(true);
  });

  it("fills with the given palette key", () => {
    const grid = createPixelGrid(2, 2, "bg");
    expect(grid.flat()).toEqual(["bg", "bg", "bg", "bg"]);
  });
});

describe("setPixel", () => {
  it("sets a single cell", () => {
    const grid = createPixelGrid(2, 2);
    setPixel(grid, 1, 0, "a");
    expect(grid[0]).toEqual([null, "a"]);
    expect(grid[1]).toEqual([null, null]);
  });

  it("throws when out of bounds", () => {
    const grid = createPixelGrid(2, 2);
    expect(() => setPixel(grid, 2, 0, "a")).toThrow();
    expect(() => setPixel(grid, 0, -1, "a")).toThrow();
  });
});

describe("fillRect", () => {
  it("fills a rectangular region and leaves the rest untouched", () => {
    const grid = createPixelGrid(4, 4);
    fillRect(grid, 1, 1, 2, 2, "a");

    expect(grid).toEqual([
      [null, null, null, null],
      [null, "a", "a", null],
      [null, "a", "a", null],
      [null, null, null, null],
    ]);
  });
});

describe("parseHexColor", () => {
  it("parses #RRGGBB as opaque", () => {
    expect(parseHexColor("#ff0080")).toEqual([255, 0, 128, 255]);
  });

  it("parses #RRGGBBAA", () => {
    expect(parseHexColor("#ff008040")).toEqual([255, 0, 128, 0x40]);
  });

  it("parses shorthand #RGB", () => {
    expect(parseHexColor("#f08")).toEqual([255, 0, 136, 255]);
  });

  it("is case-insensitive", () => {
    expect(parseHexColor("#FF0080")).toEqual([255, 0, 128, 255]);
  });

  it("throws on an invalid color string", () => {
    expect(() => parseHexColor("not-a-color")).toThrow();
  });
});

describe("toRgbaImage", () => {
  it("converts a pixel grid to an RGBA buffer using the palette", () => {
    const grid = createPixelGrid(2, 1);
    setPixel(grid, 0, 0, "red");
    setPixel(grid, 1, 0, null);

    const image = toRgbaImage(grid, { red: "#ff0000" });

    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect([...image.pixels]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
  });

  it("throws when the grid references a key missing from the palette", () => {
    const grid = createPixelGrid(1, 1, "missing");
    expect(() => toRgbaImage(grid, {})).toThrow(/missing/);
  });
});
