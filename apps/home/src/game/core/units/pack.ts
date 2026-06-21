import { Unit } from "./unit";

/**
 * A wolf pack is exactly one Pack Leader plus one or more Pack Followers.
 * The role is intrinsic to the unit so the AI can tell leaders from followers
 * (and wolves from everything else) without reaching into the rendering/main
 * layer. See specs/06-enemy-ai.md.
 */
export type PackRole = "leader" | "follower";

export interface IPackMember extends Unit {
  readonly packRole: PackRole;
}

/** True for any wolf (leader or follower). Used to spot "non-wolf" attack targets. */
export function isWolf(arg: any): arg is IPackMember {
  return !!(arg && (arg.packRole === "leader" || arg.packRole === "follower"));
}

export function isPackLeader(arg: any): arg is IPackMember {
  return isWolf(arg) && arg.packRole === "leader";
}

export function isPackFollower(arg: any): arg is IPackMember {
  return isWolf(arg) && arg.packRole === "follower";
}

export function Leader<TBase extends Constructor<Unit>>(Base: TBase) {
  return class extends Base implements IPackMember {
    readonly packRole: PackRole = "leader";
  };
}

export function Follower<TBase extends Constructor<Unit>>(Base: TBase) {
  return class extends Base implements IPackMember {
    readonly packRole: PackRole = "follower";
  };
}
