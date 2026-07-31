// Real (non-throwaway) unit art, wired into the dedicated "units" atlas —
// gh #192. Drawing logic ported unmodified from the approved
// unit_preview.prototype.ts (gh #190); this module is the source of truth
// going forward.
//
// Frame names match shared/renderable's Renderable mixin's `textureName`
// values set on each concrete unit class (main/units/*.ts) — game_world.ts's
// Spawn handling looks a unit's texture up by that name.
import {
  createPixelGrid,
  setPixel,
  toRgbaImage,
  type Palette,
  type PixelGrid,
} from "./pixel_grid";
import { upscaleNearestNeighbor } from "./hex_mask";
import type { RgbaImage } from "./png";
import type { NamedSprite } from "./atlas";

// 32px native authoring grid (ADR-0005), upscaled x3 nearest-neighbor ->
// 96x96 — the exact dimensions already reviewed/approved in gh #190's
// preview montage.
const NATIVE = 32;
const SCALE = 3;

type PixelPredicate = (x: number, y: number) => boolean;
interface Layer {
  test: PixelPredicate;
  key: string;
}

const rect = (x0: number, y0: number, w: number, h: number): PixelPredicate => (x, y) =>
  x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;

const circle = (cx: number, cy: number, r: number): PixelPredicate => (x, y) =>
  (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;

const points = (pts: [number, number][], size = 1): PixelPredicate => (x, y) =>
  pts.some(([px, py]) => Math.abs(px - x) < size && Math.abs(py - y) < size);

const and = (a: PixelPredicate, b: PixelPredicate): PixelPredicate => (x, y) => a(x, y) && b(x, y);

// Expands the silhouette by 1 native px into a dark outline — the standard
// low-res pixel-art readability trick.
function outlineSilhouette(grid: PixelGrid, key: string): PixelGrid {
  const height = grid.length;
  const width = height === 0 ? 0 : grid[0].length;
  const result = grid.map((row) => row.slice());

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== null) continue;
      const touchesFilled =
        (x > 0 && grid[y][x - 1] !== null) ||
        (x < width - 1 && grid[y][x + 1] !== null) ||
        (y > 0 && grid[y - 1][x] !== null) ||
        (y < height - 1 && grid[y + 1][x] !== null);
      if (touchesFilled) result[y][x] = key;
    }
  }

  return result;
}

function renderSprite(palette: Palette, layers: Layer[]): RgbaImage {
  let grid: PixelGrid = createPixelGrid(NATIVE, NATIVE, null);

  for (let y = 0; y < NATIVE; y++) {
    for (let x = 0; x < NATIVE; x++) {
      let key: string | null = null;
      for (const layer of layers) {
        if (layer.test(x, y)) key = layer.key;
      }
      if (key !== null) setPixel(grid, x, y, key);
    }
  }

  grid = outlineSilhouette(grid, "outline");
  const scaled = upscaleNearestNeighbor(grid, SCALE);
  return toRgbaImage(scaled, palette);
}

// ---- Unit archetype definitions ---------------------------------------

export const hero = () =>
  renderSprite(
    {
      outline: "#1a1410",
      skin: "#e8b98a",
      hair: "#8a5a28",
      tunic: "#2f6fb0",
      tunicShade: "#24567f",
      belt: "#6b4a2c",
      pants: "#3a3a3a",
      boot: "#4a2f1a",
      steel: "#c9cdd6",
      gold: "#c9a227",
    },
    [
      { test: rect(11, 22, 3, 7), key: "pants" },
      { test: rect(17, 22, 3, 7), key: "pants" },
      { test: rect(10, 27, 4, 3), key: "boot" },
      { test: rect(16, 27, 4, 3), key: "boot" },
      { test: rect(10, 13, 12, 10), key: "tunic" },
      { test: rect(10, 20, 12, 2), key: "belt" },
      { test: rect(19, 13, 3, 10), key: "tunicShade" },
      { test: rect(7, 14, 3, 7), key: "tunic" },
      { test: rect(7, 20, 3, 2), key: "skin" },
      { test: points([[21,14],[22,13],[23,12],[24,11],[25,10],[26,9]], 1), key: "tunic" },
      { test: rect(26, 7, 2, 2), key: "skin" },
      { test: points([[26,7],[27,8]], 1), key: "gold" },
      { test: points([[27,6],[28,5],[28,4],[29,3],[29,2],[30,1]], 1), key: "steel" },
      { test: circle(16, 8, 4), key: "skin" },
      { test: and(circle(16, 8, 4), rect(11, 4, 10, 3)), key: "hair" },
      { test: rect(15, 11, 2, 2), key: "skin" },
    ],
  );

export const wanderer = () =>
  renderSprite(
    {
      outline: "#161410",
      skin: "#d9ab7c",
      hood: "#4a5a3f",
      hoodShade: "#394630",
      cloak: "#5a6b4a",
      cloakShade: "#465538",
      stick: "#6b4a2c",
      shadow: "#241f18",
    },
    [
      { test: rect(13, 14, 6, 4), key: "cloak" },
      { test: rect(11, 18, 10, 5), key: "cloak" },
      { test: rect(9, 23, 14, 6), key: "cloak" },
      { test: rect(9, 23, 3, 6), key: "cloakShade" },
      { test: rect(20, 23, 3, 6), key: "cloakShade" },
      { test: points([[8,10],[8,11],[8,12],[8,13],[8,14],[8,15],[8,16],[8,17],[8,18],[8,19],[8,20]], 1), key: "stick" },
      { test: circle(16, 9, 5), key: "hood" },
      { test: and(circle(16, 9, 5), rect(11, 11, 10, 3)), key: "hoodShade" },
      { test: rect(14, 10, 4, 3), key: "shadow" },
      { test: rect(15, 11, 1, 1), key: "skin" },
    ],
  );

export const wolf = () =>
  renderSprite(
    {
      outline: "#141312",
      fur: "#9a9a94",
      furShade: "#78786f",
      belly: "#c8c8be",
      nose: "#2a2a26",
      eye: "#e8d24a",
    },
    [
      // Kept inside x=[3,27] — the hex tint background is only full-width at
      // mid-height and tapers to half that at top/bottom (see hex_mask.ts's
      // doc comment), so this quadruped has to stay narrower than its
      // bounding box would suggest to avoid poking past the hex silhouette
      // (gh #190 review feedback).
      { test: rect(7, 15, 16, 8), key: "fur" },
      { test: rect(7, 20, 16, 3), key: "belly" },
      { test: points([[3,13],[4,14],[5,15]], 1), key: "furShade" },
      { test: rect(3, 12, 4, 4), key: "fur" },
      { test: rect(8, 22, 3, 6), key: "furShade" },
      { test: rect(13, 22, 3, 6), key: "furShade" },
      { test: rect(18, 22, 3, 6), key: "fur" },
      { test: rect(21, 22, 3, 6), key: "fur" },
      { test: circle(21, 13, 4), key: "fur" },
      { test: rect(23, 14, 4, 3), key: "fur" },
      { test: rect(26, 15, 1, 1), key: "nose" },
      { test: rect(21, 9, 2, 3), key: "furShade" },
      { test: rect(22, 12, 1, 1), key: "eye" },
    ],
  );

export const bandit = () =>
  renderSprite(
    {
      outline: "#100d0a",
      leather: "#3a3025",
      leatherShade: "#2b2319",
      skin: "#c99a6e",
      mask: "#241f1a",
      pants: "#2e2a24",
      boot: "#20180f",
      blade: "#9aa0a8",
    },
    [
      { test: rect(11, 22, 3, 7), key: "pants" },
      { test: rect(17, 22, 3, 7), key: "pants" },
      { test: rect(10, 27, 4, 3), key: "boot" },
      { test: rect(16, 27, 4, 3), key: "boot" },
      { test: rect(10, 13, 12, 10), key: "leather" },
      { test: rect(19, 13, 3, 10), key: "leatherShade" },
      { test: rect(7, 14, 3, 7), key: "leather" },
      { test: rect(21, 14, 3, 7), key: "leather" },
      { test: points([[23,20],[24,21],[25,22]], 1), key: "blade" },
      { test: rect(22, 19, 2, 2), key: "skin" },
      { test: circle(16, 8, 4), key: "leather" },
      { test: rect(13, 8, 6, 3), key: "mask" },
    ],
  );

export const banditCaptain = () =>
  renderSprite(
    {
      outline: "#0d0a08",
      armor: "#4a2323",
      armorShade: "#331717",
      spike: "#8a8680",
      skin: "#c99a6e",
      mask: "#1a1512",
      pants: "#241d1a",
      boot: "#1a130c",
      blade: "#b0b6bc",
      sash: "#8a1f1f",
    },
    [
      { test: rect(9, 23, 4, 7), key: "pants" },
      { test: rect(19, 23, 4, 7), key: "pants" },
      { test: rect(8, 28, 5, 3), key: "boot" },
      { test: rect(19, 28, 5, 3), key: "boot" },
      { test: rect(8, 13, 16, 11), key: "armor" },
      { test: rect(20, 13, 4, 11), key: "armorShade" },
      { test: rect(9, 20, 15, 2), key: "sash" },
      { test: rect(5, 12, 5, 5), key: "armor" },
      { test: rect(23, 12, 5, 5), key: "armor" },
      { test: points([[5,11],[6,9],[7,11]], 1), key: "spike" },
      { test: points([[27,11],[28,9],[29,11]], 1), key: "spike" },
      { test: points([[25,14],[26,13],[27,12],[28,11]], 1), key: "armor" },
      { test: rect(27, 6, 5, 5), key: "blade" },
      { test: rect(28, 5, 2, 1), key: "spike" },
      { test: circle(16, 8, 5), key: "armor" },
      { test: rect(12, 8, 8, 3), key: "mask" },
    ],
  );

// Canonical roster: frame name -> drawing function. "wolf" is shared by both
// PackLeader and PackFollower — the AI-role distinction between them isn't
// visual (see the map's Notes).
export const UNIT_ROSTER: { name: string; draw: () => RgbaImage }[] = [
  { name: "hero", draw: hero },
  { name: "wanderer", draw: wanderer },
  { name: "wolf", draw: wolf },
  { name: "bandit", draw: bandit },
  { name: "banditCaptain", draw: banditCaptain },
];

export const UNIT_TEXTURE_NAMES: string[] = UNIT_ROSTER.map((u) => u.name);

export function buildUnitSprites(): NamedSprite[] {
  return UNIT_ROSTER.map(({ name, draw }) => ({ name, image: draw() }));
}
