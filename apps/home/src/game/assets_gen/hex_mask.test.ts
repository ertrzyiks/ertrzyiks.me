import { describe, expect, it } from "vitest";
import {
  flatTopHexMask,
  isInsideFlatTopHex,
  upscaleNearestNeighbor,
} from "./hex-mask";

describe("isInsideFlatTopHex", () => {
  const width = 32;
  const height = 28;

  it("is true at the center", () => {
    expect(isInsideFlatTopHex(width / 2, height / 2, width, height)).toBe(
      true,
    );
  });

  it("is false at every corner of the bounding box", () => {
    expect(isInsideFlatTopHex(0, 0, width, height)).toBe(false);
    expect(isInsideFlatTopHex(width - 1, 0, width, height)).toBe(false);
    expect(isInsideFlatTopHex(0, height - 1, width, height)).toBe(false);
    expect(isInsideFlatTopHex(width - 1, height - 1, width, height)).toBe(
      false,
    );
  });

  it("is true along the middle of the flat top and bottom edges", () => {
    expect(isInsideFlatTopHex(width / 2, 0.5, width, height)).toBe(true);
    expect(
      isInsideFlatTopHex(width / 2, height - 0.5, width, height),
    ).toBe(true);
  });
});

describe("flatTopHexMask", () => {
  it("returns a height x width grid matching isInsideFlatTopHex per pixel", () => {
    const width = 16;
    const height = 14;
    const mask = flatTopHexMask(width, height);

    expect(mask.length).toBe(height);
    expect(mask.every((row) => row.length === width)).toBe(true);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(mask[y][x]).toBe(
          isInsideFlatTopHex(x + 0.5, y + 0.5, width, height),
        );
      }
    }
  });

  it("is a strict subset of the bounding box (hex corners are cut off)", () => {
    const mask = flatTopHexMask(16, 14);
    const insideCount = mask.flat().filter(Boolean).length;
    expect(insideCount).toBeGreaterThan(0);
    expect(insideCount).toBeLessThan(16 * 14);
  });

  it("is horizontally and vertically symmetric", () => {
    const width = 16;
    const height = 14;
    const mask = flatTopHexMask(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(mask[y][x]).toBe(mask[y][width - 1 - x]);
        expect(mask[y][x]).toBe(mask[height - 1 - y][x]);
      }
    }
  });
});

describe("upscaleNearestNeighbor", () => {
  it("replicates each cell into a scale x scale block", () => {
    const grid = [
      ["a", "b"],
      ["c", "d"],
    ];

    expect(upscaleNearestNeighbor(grid, 2)).toEqual([
      ["a", "a", "b", "b"],
      ["a", "a", "b", "b"],
      ["c", "c", "d", "d"],
      ["c", "c", "d", "d"],
    ]);
  });

  it("is a no-op copy at scale 1", () => {
    const grid = [["a", "b"]];
    const scaled = upscaleNearestNeighbor(grid, 1);
    expect(scaled).toEqual(grid);
    expect(scaled).not.toBe(grid);
  });

  it("throws for a non-positive or non-integer scale", () => {
    expect(() => upscaleNearestNeighbor([["a"]], 0)).toThrow();
    expect(() => upscaleNearestNeighbor([["a"]], -1)).toThrow();
    expect(() => upscaleNearestNeighbor([["a"]], 1.5)).toThrow();
  });
});
