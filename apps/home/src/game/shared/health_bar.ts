import { Graphics } from "pixi.js";

// Color thresholds for the unit health bar (issue #220): green while HP is
// comfortably high, yellow in the mid-range, red once critically low —
// two warning steps before a unit dies, not just a healthy/dying binary.
const HIGH_HEALTH_THRESHOLD = 0.5;
const MEDIUM_HEALTH_THRESHOLD = 0.2;

export const HEALTH_BAR_COLOR_HIGH = 0x33cc55;
export const HEALTH_BAR_COLOR_MEDIUM = 0xffcc33;
export const HEALTH_BAR_COLOR_LOW = 0xff3333;
export const HEALTH_BAR_BACKGROUND_COLOR = 0x000000;

export const HEALTH_BAR_WIDTH = 40;
export const HEALTH_BAR_HEIGHT = 6;

/**
 * Green above HIGH_HEALTH_THRESHOLD, yellow above MEDIUM_HEALTH_THRESHOLD,
 * red at or below it. `fraction` is current HP / max HP, expected in [0, 1]
 * (see drawHealthBar's clamp) — a value at or below 0 still resolves to red.
 */
export function healthBarColor(fraction: number): number {
  if (fraction > HIGH_HEALTH_THRESHOLD) return HEALTH_BAR_COLOR_HIGH;
  if (fraction > MEDIUM_HEALTH_THRESHOLD) return HEALTH_BAR_COLOR_MEDIUM;
  return HEALTH_BAR_COLOR_LOW;
}

/**
 * Redraws `g` in place as a health bar: a dark background track plus a
 * color-coded fill scaled to `fraction` (see healthBarColor). Centered
 * horizontally on the Graphics' local origin, growing rightward from
 * (-HEALTH_BAR_WIDTH / 2, 0) — the caller positions that origin above the
 * unit sprite. `fraction` is clamped to [0, 1] so a not-yet-replenished
 * (0 HP) or stale over-heal reading never draws outside the track.
 */
export function drawHealthBar(g: Graphics, fraction: number): void {
  const clamped = Math.max(0, Math.min(1, fraction));
  g.clear();
  g.rect(-HEALTH_BAR_WIDTH / 2, 0, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
  g.fill({ color: HEALTH_BAR_BACKGROUND_COLOR, alpha: 0.5 });
  if (clamped <= 0) return;
  g.rect(-HEALTH_BAR_WIDTH / 2, 0, HEALTH_BAR_WIDTH * clamped, HEALTH_BAR_HEIGHT);
  g.fill({ color: healthBarColor(clamped) });
}
