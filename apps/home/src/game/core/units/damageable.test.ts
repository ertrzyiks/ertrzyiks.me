import { describe, expect, test } from "vitest";
import { Unit } from "./unit";
import { Damageable, isDamageable } from "./damageable";

describe("Damageable", () => {
  test("starts at 0 hp until replenished, consistent with the other mixins (Movable, Damaging)", () => {
    const U = Damageable(Unit, 30);
    const u = new U();
    expect(u.currentHp()).toBe(0);
    expect(u.isAlive()).toBe(false);
  });

  test("replenish restores hp to the configured max", () => {
    const U = Damageable(Unit, 30);
    const u = new U();
    u.replenish();
    expect(u.currentHp()).toBe(30);
    expect(u.maxHp()).toBe(30);
    expect(u.isAlive()).toBe(true);
  });

  test("maxHp stays constant across damage and replenish", () => {
    const U = Damageable(Unit, 25);
    const u = new U();
    u.replenish();
    u.takeDamage(10);
    expect(u.maxHp()).toBe(25);
    u.replenish();
    expect(u.maxHp()).toBe(25);
  });

  test("takeDamage reduces currentHp by the given amount", () => {
    const U = Damageable(Unit, 30);
    const u = new U();
    u.replenish();
    u.takeDamage(12);
    expect(u.currentHp()).toBe(18);
  });

  test("isAlive is false once hp drops to 0 or below (overkill included)", () => {
    const U = Damageable(Unit, 10);
    const u = new U();
    u.replenish();
    u.takeDamage(25);
    expect(u.currentHp()).toBe(-15);
    expect(u.isAlive()).toBe(false);
  });

  test("isDamageable guards units that can take damage", () => {
    const U = Damageable(Unit, 10);
    expect(isDamageable(new U())).toBe(true);
    expect(isDamageable(new Unit())).toBe(false);
    expect(isDamageable(null)).toBe(false);
  });
});
