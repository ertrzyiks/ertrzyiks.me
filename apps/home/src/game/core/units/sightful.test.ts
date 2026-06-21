import { describe, expect, test } from "vitest";
import { Sightful, isSightful } from "./sightful";
import { Movable } from "./movable";
import { Damageable } from "./damageable";
import { Unit } from "./unit";

describe("Sightful mixin", () => {
  test("assigns the configured sightRange", () => {
    const U = Sightful(Unit, 2);
    expect(new U().sightRange).toBe(2);
  });

  test("sightRange of 0 is valid", () => {
    const U = Sightful(Unit, 0);
    expect(new U().sightRange).toBe(0);
  });

  test("stacks with Movable — both properties present", () => {
    const U = Sightful(Movable(Unit, 3), 2);
    const unit = new U();
    expect(unit.sightRange).toBe(2);
    unit.replenish();
    expect(unit.canMove()).toBe(true);
  });

  test("stacks on top of Movable + Damageable", () => {
    const U = Sightful(Movable(Damageable(Unit, 15), 2), 1);
    const unit = new U();
    expect(unit.sightRange).toBe(1);
    unit.replenish();
    expect(unit.canMove()).toBe(true);
    expect(unit.isAlive()).toBe(true);
  });

  test("each instance has an independent id", () => {
    const U = Sightful(Unit, 1);
    const a = new U();
    const b = new U();
    expect(a.id).not.toBe(b.id);
  });
});

describe("isSightful", () => {
  test("returns true for units created with the Sightful mixin", () => {
    const unit = new (Sightful(Unit, 1))();
    expect(isSightful(unit)).toBe(true);
  });

  test("returns true regardless of sightRange value", () => {
    expect(isSightful(new (Sightful(Unit, 0))())).toBe(true);
    expect(isSightful(new (Sightful(Unit, 99))())).toBe(true);
  });

  test("returns false for a plain Unit", () => {
    expect(isSightful(new Unit())).toBe(false);
  });

  test("returns false for a Movable unit (no sight)", () => {
    const unit = new (Movable(Unit, 3))();
    expect(isSightful(unit)).toBe(false);
  });

  test("returns false for null and undefined", () => {
    expect(isSightful(null)).toBe(false);
    expect(isSightful(undefined)).toBe(false);
  });

  test("returns false for plain objects without sightRange", () => {
    expect(isSightful({})).toBe(false);
    expect(isSightful({ id: 1 })).toBe(false);
  });
});
