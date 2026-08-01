import { describe, expect, test } from "vitest";
import {
  healthBarColor,
  drawHealthBar,
  HEALTH_BAR_COLOR_HIGH,
  HEALTH_BAR_COLOR_MEDIUM,
  HEALTH_BAR_COLOR_LOW,
  HEALTH_BAR_WIDTH,
} from "./health_bar";
import { Graphics } from "pixi.js";

describe("healthBarColor", () => {
  test("full health is green", () => {
    expect(healthBarColor(1)).toBe(HEALTH_BAR_COLOR_HIGH);
  });

  test("just above the high threshold is green", () => {
    expect(healthBarColor(0.51)).toBe(HEALTH_BAR_COLOR_HIGH);
  });

  test("at the high threshold is yellow, not green (threshold is exclusive)", () => {
    expect(healthBarColor(0.5)).toBe(HEALTH_BAR_COLOR_MEDIUM);
  });

  test("mid-range is yellow", () => {
    expect(healthBarColor(0.3)).toBe(HEALTH_BAR_COLOR_MEDIUM);
  });

  test("at the medium threshold is red, not yellow (threshold is exclusive)", () => {
    expect(healthBarColor(0.2)).toBe(HEALTH_BAR_COLOR_LOW);
  });

  test("low health is red", () => {
    expect(healthBarColor(0.1)).toBe(HEALTH_BAR_COLOR_LOW);
  });

  test("zero or negative fraction is red", () => {
    expect(healthBarColor(0)).toBe(HEALTH_BAR_COLOR_LOW);
    expect(healthBarColor(-0.5)).toBe(HEALTH_BAR_COLOR_LOW);
  });
});

describe("drawHealthBar", () => {
  test("does not throw for a mid-range fraction", () => {
    const g = new Graphics();
    expect(() => drawHealthBar(g, 0.6)).not.toThrow();
  });

  test("clamps a fraction above 1 down to a full-width fill", () => {
    const g = new Graphics();
    expect(() => drawHealthBar(g, 1.5)).not.toThrow();
    // Full bounds should not exceed the track width once clamped.
    expect(g.width).toBeLessThanOrEqual(HEALTH_BAR_WIDTH + 1);
  });

  test("clamps a negative fraction to an empty (background-only) fill", () => {
    const g = new Graphics();
    expect(() => drawHealthBar(g, -1)).not.toThrow();
  });

  test("can be redrawn repeatedly without accumulating geometry (clears each call)", () => {
    const g = new Graphics();
    drawHealthBar(g, 1);
    const contextSizeAfterFirst = g.context.instructions.length;
    drawHealthBar(g, 0.1);
    // Without the clear() inside drawHealthBar, each redraw would append more
    // fill instructions instead of replacing them.
    expect(g.context.instructions.length).toBe(contextSizeAfterFirst);
  });
});
