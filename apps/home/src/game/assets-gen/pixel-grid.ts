import type { RgbaImage } from "./png";

// A cell holds a palette key, or null for a fully transparent pixel.
export type PixelGrid = (string | null)[][];

export type Palette = Record<string, string>;

export function createPixelGrid(
  width: number,
  height: number,
  fill: string | null = null,
): PixelGrid {
  return Array.from({ length: height }, () => Array(width).fill(fill));
}

function assertInBounds(grid: PixelGrid, x: number, y: number): void {
  const height = grid.length;
  const width = height === 0 ? 0 : grid[0].length;

  if (y < 0 || y >= height || x < 0 || x >= width) {
    throw new Error(`pixel (${x}, ${y}) is out of bounds (${width}x${height})`);
  }
}

export function setPixel(
  grid: PixelGrid,
  x: number,
  y: number,
  key: string | null,
): void {
  assertInBounds(grid, x, y);
  grid[y][x] = key;
}

export function fillRect(
  grid: PixelGrid,
  x: number,
  y: number,
  width: number,
  height: number,
  key: string | null,
): void {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      setPixel(grid, x + dx, y + dy, key);
    }
  }
}

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_RGB = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_RGBA = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function parseHexColor(
  color: string,
): [number, number, number, number] {
  const shortMatch = HEX_SHORT.exec(color);
  if (shortMatch) {
    const [, r, g, b] = shortMatch;
    return [
      parseInt(r + r, 16),
      parseInt(g + g, 16),
      parseInt(b + b, 16),
      255,
    ];
  }

  const rgbaMatch = HEX_RGBA.exec(color);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), parseInt(a, 16)];
  }

  const rgbMatch = HEX_RGB.exec(color);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), 255];
  }

  throw new Error(`invalid hex color: ${color}`);
}

export function toRgbaImage(grid: PixelGrid, palette: Palette): RgbaImage {
  const height = grid.length;
  const width = height === 0 ? 0 : grid[0].length;
  const pixels = new Uint8Array(width * height * 4);
  const cache = new Map<string, [number, number, number, number]>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = grid[y][x];
      const offset = (y * width + x) * 4;

      if (key === null) {
        continue; // already zeroed: fully transparent
      }

      let rgba = cache.get(key);
      if (!rgba) {
        const hex = palette[key];
        if (hex === undefined) {
          throw new Error(`palette is missing key "${key}"`);
        }
        rgba = parseHexColor(hex);
        cache.set(key, rgba);
      }

      pixels.set(rgba, offset);
    }
  }

  return { width, height, pixels };
}
