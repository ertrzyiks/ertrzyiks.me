import { describe, expect, test } from "vitest";
import { PackLeader, PackFollower } from "./wolf";
import { isWolf, isPackLeader, isPackFollower, isDamaging } from "../../core/units";

describe("PackFollower unit", () => {
  test("has sightRange of 1", () => {
    expect(new PackFollower().sightRange).toBe(1);
  });

  test("is tagged as a follower wolf", () => {
    const follower = new PackFollower();
    expect(isWolf(follower)).toBe(true);
    expect(isPackFollower(follower)).toBe(true);
    expect(isPackLeader(follower)).toBe(false);
  });

  test("cannot move before replenish", () => {
    expect(new PackFollower().canMove()).toBe(false);
  });

  test("is not alive before replenish", () => {
    expect(new PackFollower().isAlive()).toBe(false);
  });

  test("can move and is alive after replenish", () => {
    const wolf = new PackFollower();
    wolf.replenish();
    expect(wolf.canMove()).toBe(true);
    expect(wolf.isAlive()).toBe(true);
  });

  test("has 2 movement points per turn (exhausted after 2 steps)", () => {
    const wolf = new PackFollower();
    wolf.replenish();
    wolf.step(1);
    expect(wolf.canMove()).toBe(true);
    wolf.step(1);
    expect(wolf.canMove()).toBe(false);
  });

  test("is not alive after taking lethal damage (15 HP)", () => {
    const wolf = new PackFollower();
    wolf.replenish();
    wolf.takeDamage(15);
    expect(wolf.isAlive()).toBe(false);
  });

  test("survives non-lethal damage", () => {
    const wolf = new PackFollower();
    wolf.replenish();
    wolf.takeDamage(14);
    expect(wolf.isAlive()).toBe(true);
  });

  test("each instance has a unique id", () => {
    expect(new PackFollower().id).not.toBe(new PackFollower().id);
  });

  test("bites for 5 and can attack once per turn after replenish", () => {
    const wolf = new PackFollower();
    expect(isDamaging(wolf)).toBe(true);
    expect(wolf.damage).toBe(5);
    expect(wolf.canAttack()).toBe(false); // not until replenish
    wolf.replenish();
    expect(wolf.canAttack()).toBe(true);
    wolf.useAttack();
    expect(wolf.canAttack()).toBe(false);
  });
});

describe("PackLeader unit", () => {
  test("has a wider sightRange of 2", () => {
    expect(new PackLeader().sightRange).toBe(2);
  });

  test("is tagged as a leader wolf", () => {
    const leader = new PackLeader();
    expect(isWolf(leader)).toBe(true);
    expect(isPackLeader(leader)).toBe(true);
    expect(isPackFollower(leader)).toBe(false);
  });

  test("is tougher than a follower (20 HP)", () => {
    const leader = new PackLeader();
    leader.replenish();
    leader.takeDamage(15);
    expect(leader.isAlive()).toBe(true); // a follower would be dead here
    leader.takeDamage(5);
    expect(leader.isAlive()).toBe(false);
  });

  test("has 2 movement points per turn", () => {
    const leader = new PackLeader();
    leader.replenish();
    leader.step(1);
    expect(leader.canMove()).toBe(true);
    leader.step(1);
    expect(leader.canMove()).toBe(false);
  });

  test("bites harder than a follower (7 damage)", () => {
    const leader = new PackLeader();
    expect(isDamaging(leader)).toBe(true);
    expect(leader.damage).toBe(7);
  });
});
