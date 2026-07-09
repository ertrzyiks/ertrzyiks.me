import { describe, expect, test } from "vitest";
import { Wanderer } from "./wanderer";
import { isDamageable, isDamaging, isMovable, isSightful } from "../../core/units";

describe("Wanderer unit", () => {
  test("has a sightRange of 2", () => {
    expect(new Wanderer().sightRange).toBe(2);
  });

  test("is movable and sightful", () => {
    const w = new Wanderer();
    expect(isMovable(w)).toBe(true);
    expect(isSightful(w)).toBe(true);
  });

  test("is a non-combat unit: neither damageable nor damaging", () => {
    // This is what makes the Wanderer un-attackable — the player-store attack
    // translation and the wolves' bite both require a Damageable target.
    const w = new Wanderer();
    expect(isDamageable(w)).toBe(false);
    expect(isDamaging(w)).toBe(false);
  });

  test("cannot move before replenish", () => {
    expect(new Wanderer().canMove()).toBe(false);
  });

  test("has 3 movement points per turn (exhausted after 3 steps)", () => {
    const w = new Wanderer();
    w.replenish();
    w.step(1);
    w.step(1);
    expect(w.canMove()).toBe(true);
    w.step(1);
    expect(w.canMove()).toBe(false);
  });

  test("each instance has a unique id", () => {
    expect(new Wanderer().id).not.toBe(new Wanderer().id);
  });
});
