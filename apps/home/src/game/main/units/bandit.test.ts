import { describe, expect, test } from "vitest";
import { Bandit, BanditCaptain } from "./bandit";
import { isDamaging, isDamageable, isMovable, isSightful } from "../../core/units";

describe("Bandit unit", () => {
  test("has sightRange of 1", () => {
    expect(new Bandit().sightRange).toBe(1);
  });

  test("is Movable, Damageable, Damaging, and Sightful", () => {
    const bandit = new Bandit();
    expect(isMovable(bandit)).toBe(true);
    expect(isDamageable(bandit)).toBe(true);
    expect(isDamaging(bandit)).toBe(true);
    expect(isSightful(bandit)).toBe(true);
  });

  test("cannot move or attack before replenish", () => {
    const bandit = new Bandit();
    expect(bandit.canMove()).toBe(false);
    expect(bandit.canAttack()).toBe(false);
  });

  test("is not alive before replenish", () => {
    expect(new Bandit().isAlive()).toBe(false);
  });

  test("can move and attack and is alive after replenish", () => {
    const bandit = new Bandit();
    bandit.replenish();
    expect(bandit.canMove()).toBe(true);
    expect(bandit.canAttack()).toBe(true);
    expect(bandit.isAlive()).toBe(true);
  });

  test("has 2 movement points per turn (exhausted after 2 steps)", () => {
    const bandit = new Bandit();
    bandit.replenish();
    bandit.step(1);
    expect(bandit.canMove()).toBe(true);
    bandit.step(1);
    expect(bandit.canMove()).toBe(false);
  });

  // Stage 2 spec: "Bandits have measurably higher HP and damage values than
  // wolves" — PackLeader tops out at 20 HP / 7 damage (see wolf.test.ts).
  test("has higher HP than the wolf pack leader (25 vs 20 HP)", () => {
    const bandit = new Bandit();
    bandit.replenish();
    bandit.takeDamage(20);
    expect(bandit.isAlive()).toBe(true); // a PackLeader would be dead here
    bandit.takeDamage(5);
    expect(bandit.isAlive()).toBe(false);
  });

  test("deals more damage than the wolf pack leader (8 damage)", () => {
    const bandit = new Bandit();
    expect(bandit.damage).toBe(8);
  });

  test("attacks once per turn after replenish", () => {
    const bandit = new Bandit();
    bandit.replenish();
    expect(bandit.canAttack()).toBe(true);
    bandit.useAttack();
    expect(bandit.canAttack()).toBe(false);
  });

  test("each instance has a unique id", () => {
    expect(new Bandit().id).not.toBe(new Bandit().id);
  });
});

describe("BanditCaptain unit", () => {
  test("has sightRange of 2 (wider than a standard bandit's 1)", () => {
    expect(new BanditCaptain().sightRange).toBe(2);
  });

  test("is Movable, Damageable, Damaging, and Sightful", () => {
    const captain = new BanditCaptain();
    expect(isMovable(captain)).toBe(true);
    expect(isDamageable(captain)).toBe(true);
    expect(isDamaging(captain)).toBe(true);
    expect(isSightful(captain)).toBe(true);
  });

  test("cannot move or attack before replenish", () => {
    const captain = new BanditCaptain();
    expect(captain.canMove()).toBe(false);
    expect(captain.canAttack()).toBe(false);
  });

  test("is not alive before replenish", () => {
    expect(new BanditCaptain().isAlive()).toBe(false);
  });

  test("has 2 movement points per turn (exhausted after 2 steps)", () => {
    const captain = new BanditCaptain();
    captain.replenish();
    captain.step(1);
    expect(captain.canMove()).toBe(true);
    captain.step(1);
    expect(captain.canMove()).toBe(false);
  });

  // Spec 11 "Unit Specifications": "Hit points: higher than a standard
  // bandit." Bandit tops out at 25 HP (see bandit.test.ts above).
  test("has higher HP than a standard Bandit (40 vs 25 HP)", () => {
    const captain = new BanditCaptain();
    captain.replenish();
    captain.takeDamage(25);
    expect(captain.isAlive()).toBe(true); // a standard Bandit would be dead here
    captain.takeDamage(15);
    expect(captain.isAlive()).toBe(false);
  });

  // Spec 11: "Damage per attack: higher than a standard bandit." Bandit deals 8.
  test("deals more damage than a standard Bandit (12 vs 8)", () => {
    const captain = new BanditCaptain();
    expect(captain.damage).toBe(12);
  });

  test("attacks once per turn after replenish", () => {
    const captain = new BanditCaptain();
    captain.replenish();
    expect(captain.canAttack()).toBe(true);
    captain.useAttack();
    expect(captain.canAttack()).toBe(false);
  });

  test("each instance has a unique id", () => {
    expect(new BanditCaptain().id).not.toBe(new BanditCaptain().id);
  });
});
