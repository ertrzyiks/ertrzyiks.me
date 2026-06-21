import { describe, expect, test } from "vitest";
import { Wolf } from "./wolf";

describe("Wolf unit", () => {
  test("has sightRange of 1", () => {
    expect(new Wolf().sightRange).toBe(1);
  });

  test("cannot move before replenish", () => {
    expect(new Wolf().canMove()).toBe(false);
  });

  test("is not alive before replenish", () => {
    expect(new Wolf().isAlive()).toBe(false);
  });

  test("can move and is alive after replenish", () => {
    const wolf = new Wolf();
    wolf.replenish();
    expect(wolf.canMove()).toBe(true);
    expect(wolf.isAlive()).toBe(true);
  });

  test("has 2 movement points per turn (exhausted after 2 steps)", () => {
    const wolf = new Wolf();
    wolf.replenish();
    wolf.step(1);
    expect(wolf.canMove()).toBe(true);
    wolf.step(1);
    expect(wolf.canMove()).toBe(false);
  });

  test("is not alive after taking lethal damage", () => {
    const wolf = new Wolf();
    wolf.replenish(); // hp = 15
    wolf.takeDamage(15);
    expect(wolf.isAlive()).toBe(false);
  });

  test("survives non-lethal damage", () => {
    const wolf = new Wolf();
    wolf.replenish();
    wolf.takeDamage(14);
    expect(wolf.isAlive()).toBe(true);
  });

  test("replenish restores hp after damage", () => {
    const wolf = new Wolf();
    wolf.replenish();
    wolf.takeDamage(10);
    wolf.replenish();
    expect(wolf.isAlive()).toBe(true);
  });

  test("each Wolf instance has a unique id", () => {
    const a = new Wolf();
    const b = new Wolf();
    expect(a.id).not.toBe(b.id);
  });
});
