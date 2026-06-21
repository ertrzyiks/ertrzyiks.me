import { describe, expect, test } from "vitest";
import { Movable } from "./movable";
import { Unit } from "./unit";

function makeUnit(budget: number) {
  return new (Movable(Unit, budget))();
}

describe("Movable.canMove", () => {
  test("returns false before replenish", () => {
    expect(makeUnit(3).canMove()).toBe(false);
  });

  test("returns true after replenish when budget > 0", () => {
    const unit = makeUnit(3);
    unit.replenish();
    expect(unit.canMove()).toBe(true);
  });

  test("returns false when budget is 0", () => {
    const unit = makeUnit(0);
    unit.replenish();
    expect(unit.canMove()).toBe(false);
  });
});

describe("Movable.step", () => {
  test("subtracts cost from movement points", () => {
    const unit = makeUnit(3);
    unit.replenish();
    unit.step(1);
    expect(unit.canMove()).toBe(true);
  });

  test("canMove returns false after budget is exhausted", () => {
    const unit = makeUnit(2);
    unit.replenish();
    unit.step(1);
    unit.step(1);
    expect(unit.canMove()).toBe(false);
  });

  test("a single step equal to full budget exhausts it", () => {
    const unit = makeUnit(3);
    unit.replenish();
    unit.step(3);
    expect(unit.canMove()).toBe(false);
  });

  test("step with cost 0 does not consume budget", () => {
    const unit = makeUnit(1);
    unit.replenish();
    unit.step(0);
    expect(unit.canMove()).toBe(true);
  });

  test("step can exceed remaining points (goes negative)", () => {
    const unit = makeUnit(1);
    unit.replenish();
    unit.step(5);
    expect(unit.canMove()).toBe(false);
  });
});

describe("Movable.replenish", () => {
  test("restores full budget after exhaustion", () => {
    const unit = makeUnit(2);
    unit.replenish();
    unit.step(1);
    unit.step(1);
    expect(unit.canMove()).toBe(false);
    unit.replenish();
    expect(unit.canMove()).toBe(true);
  });
});
