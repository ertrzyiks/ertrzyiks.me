import { describe, expect, test } from "vitest";
import { Unit } from "./unit";
import { Damaging, isDamaging } from "./damaging";
import { Movable } from "./movable";

describe("Damaging", () => {
  test("exposes the fixed damage value defined by its type", () => {
    const U = Damaging(Unit, 8);
    expect(new U().damage).toBe(8);
  });

  test("cannot attack until replenished (charges start empty)", () => {
    const U = Damaging(Unit, 8);
    expect(new U().canAttack()).toBe(false);
  });

  test("can attack after replenish, once per turn by default", () => {
    const U = Damaging(Unit, 8);
    const u = new U();
    u.replenish();
    expect(u.canAttack()).toBe(true);
    u.useAttack();
    expect(u.canAttack()).toBe(false);
  });

  test("honours a custom attacks-per-turn budget", () => {
    const U = Damaging(Unit, 8, 2);
    const u = new U();
    u.replenish();
    u.useAttack();
    expect(u.canAttack()).toBe(true);
    u.useAttack();
    expect(u.canAttack()).toBe(false);
  });

  test("useAttack never drops below zero", () => {
    const U = Damaging(Unit, 8);
    const u = new U();
    u.useAttack();
    u.useAttack();
    expect(u.canAttack()).toBe(false);
  });

  test("replenish restores charges at turn start", () => {
    const U = Damaging(Unit, 8);
    const u = new U();
    u.replenish();
    u.useAttack();
    expect(u.canAttack()).toBe(false);
    u.replenish();
    expect(u.canAttack()).toBe(true);
  });

  test("chains super.replenish so it composes with other mixins", () => {
    const U = Damaging(Movable(Unit, 3), 8);
    const u = new U();
    u.replenish();
    // Both the movement budget and the attack charge are restored.
    expect(u.canMove()).toBe(true);
    expect(u.canAttack()).toBe(true);
  });

  test("isDamaging guards units that can deal damage", () => {
    const U = Damaging(Unit, 8);
    expect(isDamaging(new U())).toBe(true);
    expect(isDamaging(new Unit())).toBe(false);
    expect(isDamaging(null)).toBe(false);
  });

  test("hasAttacked is false until useAttack is called", () => {
    const U = Damaging(Unit, 8);
    const u = new U();
    u.replenish();
    expect(u.hasAttacked()).toBe(false);
    u.useAttack();
    expect(u.hasAttacked()).toBe(true);
  });

  test("hasAttacked stays true even with remaining attack charges (issue #218)", () => {
    const U = Damaging(Unit, 8, 2);
    const u = new U();
    u.replenish();
    u.useAttack();
    expect(u.canAttack()).toBe(true); // one charge still left
    expect(u.hasAttacked()).toBe(true); // but the unit has already acted
  });

  test("replenish clears hasAttacked for the new turn", () => {
    const U = Damaging(Unit, 8);
    const u = new U();
    u.replenish();
    u.useAttack();
    expect(u.hasAttacked()).toBe(true);
    u.replenish();
    expect(u.hasAttacked()).toBe(false);
  });

  test("a wasted useAttack call (no charges left) does not set hasAttacked", () => {
    const U = Damaging(Unit, 8);
    const u = new U();
    u.useAttack();
    expect(u.hasAttacked()).toBe(false);
  });
});
