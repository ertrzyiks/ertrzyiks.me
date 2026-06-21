import { Unit } from "./unit";

export interface ISightful {
  sightRange: number;
}

export function isSightful(arg: any): arg is ISightful {
  return !!(arg && typeof arg.sightRange === "number");
}

export function Sightful<TBase extends Constructor<Unit>>(
  Base: TBase,
  range: number
) {
  return class extends Base implements ISightful {
    readonly sightRange: number = range;
  };
}
