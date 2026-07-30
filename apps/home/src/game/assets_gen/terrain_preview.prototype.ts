// PROTOTYPE — throwaway. Answers gh issue #189: "what should the terrain
// tile family look like?" Renders a montage + a shore-transition strip to
// react to. Not wired into any board atlas — see #191 for that.
//
// Run with:
//   node ../../node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs \
//     src/game/assets_gen/terrain_preview.prototype.ts <output-dir>
import { writeFileSync, mkdirSync } from "node:fs";
import {
  createPixelGrid,
  setPixel,
  toRgbaImage,
  type Palette,
  type PixelGrid,
} from "./pixel_grid";
import { flatTopHexMask, upscaleNearestNeighbor } from "./hex_mask";
import { encodePng, type RgbaImage } from "./png";

// 32px native authoring grid (per ADR-0005 / the map's Notes), upscaled
// nearest-neighbor. 32x28 is the closest integer flat-top-hex bounding box
// to the real in-game ratio (board1-0's grass/water frames are 100x87,
// ratio 0.87); scale x3 lands close to that real size for review purposes.
// #191 picks the exact final pixel dimensions when wiring this for real.
const NATIVE_W = 32;
const NATIVE_H = 28;
const SCALE = 3;

// Deterministic pseudo-random in [0, 1) — no RNG dependency, reproducible
// output for a generator script.
function hash(x: number, y: number, seed: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

type Paint = (x: number, y: number, h: number) => string;

function renderTile(palette: Palette, paint: Paint): RgbaImage {
  const mask = flatTopHexMask(NATIVE_W, NATIVE_H);
  const grid: PixelGrid = createPixelGrid(NATIVE_W, NATIVE_H, null);

  for (let y = 0; y < NATIVE_H; y++) {
    for (let x = 0; x < NATIVE_W; x++) {
      if (!mask[y][x]) continue;
      setPixel(grid, x, y, paint(x, y, hash(x, y, 0)));
    }
  }

  const scaled = upscaleNearestNeighbor(grid, SCALE);
  return toRgbaImage(scaled, palette);
}

// ---- Terrain variant definitions ------------------------------------

const grass1 = () =>
  renderTile(
    { base: "#5fa646", fleck: "#4c8a37", light: "#79c25c" },
    (x, y, h) => {
      if (h < 0.08) return "light";
      if (h < 0.22) return "fleck";
      return "base";
    },
  );

const grass2 = () =>
  renderTile(
    { base: "#6bb43f", patch: "#4f8a2c" },
    (x, y) => {
      // blotchy 2x2-ish patches instead of grass1's fine stipple —
      // structurally different pattern, not just a recolor.
      const blockX = Math.floor(x / 3);
      const blockY = Math.floor(y / 3);
      return hash(blockX, blockY, 1) < 0.35 ? "patch" : "base";
    },
  );

const grass3 = () =>
  renderTile(
    { base: "#3f7a34", flower: "#e8d44d", shade: "#356929" },
    (x, y, h) => {
      if (h < 0.03) return "flower";
      if (h > 0.85) return "shade";
      return "base";
    },
  );

const water = () =>
  renderTile(
    { base: "#2b6fb0", wave: "#3a82c9", foam: "#bfe0f5" },
    (x, y, h) => {
      // clean horizontal ripple bands (period 6), gently undulating with a
      // slow sine offset so they read as waves rather than per-pixel noise.
      const waveOffset = Math.round(Math.sin(x * 0.35) * 1.5);
      const bandRow = ((y + waveOffset) % 6 + 6) % 6;
      if (h > 0.99) return "foam"; // rare sparkle, not a snowfall of dots
      return bandRow === 0 ? "wave" : "base";
    },
  );

const sand = () =>
  renderTile(
    { base: "#d9c58a", dark: "#c4ac6c", light: "#e8d9a8" },
    (x, y, h) => {
      if (h < 0.15) return "dark";
      if (h < 0.3) return "light";
      return "base";
    },
  );

const forest1 = () =>
  renderTile(
    {
      grass: "#4c8a37",
      canopy: "#2f5c22",
      trunk: "#6b4a2c",
    },
    (x, y, h) => {
      // three tree blobs at fixed offsets from tile center.
      const trees = [
        [11, 10],
        [20, 15],
        [15, 20],
      ];
      for (const [tx, ty] of trees) {
        const dx = x - tx;
        const dy = y - ty;
        if (dx * dx + dy * dy <= 6) return "canopy";
        if (dx === 0 && dy >= 3 && dy <= 4) return "trunk";
      }
      return h < 0.1 ? "canopy" : "grass";
    },
  );

const forest2 = () =>
  renderTile(
    {
      grass: "#3a6b2a",
      canopy: "#274d1c",
      trunk: "#5a3d24",
    },
    (x, y) => {
      // denser canopy coverage than forest1 — a visually distinct variant,
      // not just a tint swap.
      const trees = [
        [9, 8],
        [18, 9],
        [13, 15],
        [21, 18],
        [8, 19],
      ];
      for (const [tx, ty] of trees) {
        const dx = x - tx;
        const dy = y - ty;
        if (dx * dx + dy * dy <= 7) return "canopy";
        if (dx === 0 && dy >= 3 && dy <= 4) return "trunk";
      }
      return "grass";
    },
  );

const mountain1 = () =>
  renderTile(
    {
      rock: "#8a8680",
      crevice: "#615d58",
      facet: "#a8a49c",
      snow: "#e8e6e0",
    },
    (x, y, h) => {
      if (y < 8 && Math.abs(x - NATIVE_W / 2) < 8 - y) return "snow";
      if (h < 0.12) return "crevice";
      if (h > 0.8) return "facet";
      return "rock";
    },
  );

const mountain2 = () =>
  renderTile(
    {
      rock: "#7a6a58",
      crevice: "#4f4237",
      facet: "#95816c",
    },
    (x, y, h) => {
      // lower, browner, jaggier peak — no snow cap, distinct from mountain1.
      if (h < 0.18) return "crevice";
      if (h > 0.75) return "facet";
      return "rock";
    },
  );

// ---- Montage compositing ---------------------------------------------

const TILE_W = NATIVE_W * SCALE;
const TILE_H = NATIVE_H * SCALE;

function solidCanvas(width: number, height: number, hex: string): RgbaImage {
  const [r, g, b] = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels.set([r, g, b, 255], i * 4);
  }
  return { width, height, pixels };
}

function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcOffset = (y * src.width + x) * 4;
      if (src.pixels[srcOffset + 3] === 0) continue; // transparent, skip
      const dstOffset = ((dy + y) * dst.width + (dx + x)) * 4;
      dst.pixels.set(src.pixels.subarray(srcOffset, srcOffset + 4), dstOffset);
    }
  }
}

function montage(
  tiles: { name: string; image: RgbaImage }[],
  columns: number,
): RgbaImage {
  const padding = 12;
  const cellW = TILE_W + padding;
  const cellH = TILE_H + padding;
  const rows = Math.ceil(tiles.length / columns);
  const width = columns * cellW + padding;
  const height = rows * cellH + padding;

  const canvas = solidCanvas(width, height, "#2b2f36");

  tiles.forEach(({ image }, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = padding + col * cellW;
    const y = padding + row * cellH;
    blit(canvas, solidCanvas(TILE_W, TILE_H, "#454b54"), x, y);
    blit(canvas, image, x, y);
  });

  return canvas;
}

// Adjacent flat-top hexes overlap their bounding boxes — offset by 0.75x
// width horizontally, matching viewport.ts's real hex spacing, so the
// shore strip reads as an actual adjacent row, not a padded grid.
function adjacentRow(tiles: RgbaImage[]): RgbaImage {
  const stepX = Math.round(TILE_W * 0.75);
  const width = stepX * (tiles.length - 1) + TILE_W;
  const height = TILE_H;
  const canvas = solidCanvas(width, height, "#2b2f36");
  tiles.forEach((image, i) => blit(canvas, image, i * stepX, 0));
  return canvas;
}

// ---- Main ---------------------------------------------------------------

const outDir = process.argv[2];
if (!outDir) {
  throw new Error("usage: terrain_preview.prototype.ts <output-dir>");
}
mkdirSync(outDir, { recursive: true });

const family = [
  { name: "grass1", image: grass1() },
  { name: "grass2", image: grass2() },
  { name: "grass3", image: grass3() },
  { name: "water", image: water() },
  { name: "sand", image: sand() },
  { name: "forest1", image: forest1() },
  { name: "forest2", image: forest2() },
  { name: "mountain1", image: mountain1() },
  { name: "mountain2", image: mountain2() },
];

writeFileSync(
  `${outDir}/terrain_family.png`,
  encodePng(montage(family, 3)),
);

const byName = Object.fromEntries(family.map((t) => [t.name, t.image]));
writeFileSync(
  `${outDir}/shore_transition.png`,
  encodePng(
    adjacentRow([byName.water, byName.sand, byName.sand, byName.grass1, byName.grass1]),
  ),
);

console.log("wrote terrain_family.png (legend: " + family.map((t) => t.name).join(", ") + ")");
console.log("wrote shore_transition.png (water, sand, sand, grass1, grass1)");
