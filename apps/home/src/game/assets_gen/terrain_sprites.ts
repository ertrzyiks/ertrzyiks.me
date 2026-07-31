// Real (non-throwaway) terrain art, wired into the board atlases — gh #191.
// Drawing logic ported unmodified from the approved terrain_preview.prototype.ts
// (gh #189); this module is the source of truth going forward.
//
// "grass" and "water" keep those exact frame names (rather than "grass1") so
// board1/board2/board3 — whose tile data already references "grass"/"water"
// literally — keep rendering without needing a re-paint. Re-authoring which
// tiles use which of the newly-added variants (grass2/grass3/sand/forest*/
// mountain*) is gh #193, not this ticket.
import {
  createPixelGrid,
  setPixel,
  toRgbaImage,
  type Palette,
  type PixelGrid,
} from "./pixel_grid";
import { flatTopHexMask, upscaleNearestNeighbor } from "./hex_mask";
import type { RgbaImage } from "./png";
import type { NamedSprite } from "./atlas";

// 32px native authoring grid (ADR-0005), upscaled x3 nearest-neighbor to
// 96x84 — the closest integer flat-top-hex bounding box to the real in-game
// ratio (see terrain_preview.prototype.ts), and the exact dimensions already
// reviewed/approved in gh #189's preview montage.
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

export const grass1 = () =>
  renderTile(
    { base: "#5fa646", fleck: "#4c8a37", light: "#79c25c" },
    (x, y, h) => {
      if (h < 0.08) return "light";
      if (h < 0.22) return "fleck";
      return "base";
    },
  );

export const grass2 = () =>
  renderTile(
    { base: "#6bb43f", patch: "#4f8a2c" },
    (x, y) => {
      const blockX = Math.floor(x / 3);
      const blockY = Math.floor(y / 3);
      return hash(blockX, blockY, 1) < 0.35 ? "patch" : "base";
    },
  );

export const grass3 = () =>
  renderTile(
    { base: "#3f7a34", flower: "#e8d44d", shade: "#356929" },
    (x, y, h) => {
      if (h < 0.03) return "flower";
      if (h > 0.85) return "shade";
      return "base";
    },
  );

export const water = () =>
  renderTile(
    { base: "#2b6fb0", wave: "#3a82c9", foam: "#bfe0f5" },
    (x, y, h) => {
      const waveOffset = Math.round(Math.sin(x * 0.35) * 1.5);
      const bandRow = ((y + waveOffset) % 6 + 6) % 6;
      if (h > 0.99) return "foam";
      return bandRow === 0 ? "wave" : "base";
    },
  );

export const sand = () =>
  renderTile(
    { base: "#d9c58a", dark: "#c4ac6c", light: "#e8d9a8" },
    (x, y, h) => {
      if (h < 0.15) return "dark";
      if (h < 0.3) return "light";
      return "base";
    },
  );

export const forest1 = () =>
  renderTile(
    {
      grass: "#4c8a37",
      canopy: "#2f5c22",
      trunk: "#6b4a2c",
    },
    (x, y, h) => {
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

export const forest2 = () =>
  renderTile(
    {
      grass: "#3a6b2a",
      canopy: "#274d1c",
      trunk: "#5a3d24",
    },
    (x, y) => {
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

export const mountain1 = () =>
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

export const mountain2 = () =>
  renderTile(
    {
      rock: "#7a6a58",
      crevice: "#4f4237",
      facet: "#95816c",
    },
    (x, y, h) => {
      if (h < 0.18) return "crevice";
      if (h > 0.75) return "facet";
      return "rock";
    },
  );

// Canonical roster: frame name -> drawing function. Order matches the #189
// preview montage (grass1/grass2/grass3/water/sand/forest1/forest2/
// mountain1/mountain2), except grass1/water are exposed under their
// back-compat frame names ("grass"/"water") — see module comment above.
export const TERRAIN_ROSTER: { name: string; draw: () => RgbaImage }[] = [
  { name: "grass", draw: grass1 },
  { name: "grass2", draw: grass2 },
  { name: "grass3", draw: grass3 },
  { name: "water", draw: water },
  { name: "sand", draw: sand },
  { name: "forest1", draw: forest1 },
  { name: "forest2", draw: forest2 },
  { name: "mountain1", draw: mountain1 },
  { name: "mountain2", draw: mountain2 },
];

export const TERRAIN_TEXTURE_NAMES: string[] = TERRAIN_ROSTER.map((t) => t.name);

export function buildTerrainSprites(): NamedSprite[] {
  return TERRAIN_ROSTER.map(({ name, draw }) => ({ name, image: draw() }));
}
