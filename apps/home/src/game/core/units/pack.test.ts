import { describe, expect, test } from "vitest";
import { Unit } from "./unit";
import { Movable } from "./movable";
import { Leader, Follower, isWolf, isPackLeader, isPackFollower } from "./pack";

const LeaderUnit = Leader(Movable(Unit, 2));
const FollowerUnit = Follower(Movable(Unit, 2));

describe("pack roles", () => {
  test("Leader mixin tags the unit as a leader", () => {
    const u = new LeaderUnit();
    expect(u.packRole).toBe("leader");
    expect(isPackLeader(u)).toBe(true);
    expect(isPackFollower(u)).toBe(false);
    expect(isWolf(u)).toBe(true);
  });

  test("Follower mixin tags the unit as a follower", () => {
    const u = new FollowerUnit();
    expect(u.packRole).toBe("follower");
    expect(isPackFollower(u)).toBe(true);
    expect(isPackLeader(u)).toBe(false);
    expect(isWolf(u)).toBe(true);
  });

  test("a plain unit is not a wolf", () => {
    const u = new Unit();
    expect(isWolf(u)).toBe(false);
    expect(isPackLeader(u)).toBe(false);
    expect(isPackFollower(u)).toBe(false);
  });

  test("guards are null-safe", () => {
    expect(isWolf(null)).toBe(false);
    expect(isWolf(undefined)).toBe(false);
    expect(isPackLeader(null)).toBe(false);
  });

  test("role does not interfere with other mixin behaviour", () => {
    const u = new FollowerUnit();
    expect(u.canMove()).toBe(false);
    u.replenish();
    expect(u.canMove()).toBe(true);
  });
});
