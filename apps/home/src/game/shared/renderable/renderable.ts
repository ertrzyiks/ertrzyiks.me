import { Unit } from "../../core/units";

export interface IRenderable {
  textureName: string;
}

// textureName is fixed per concrete unit type at mixin-application time (see
// main/units/*.ts) — game_world.ts's Spawn handling reads it to pick a
// sprite from the units atlas (gh #192) instead of always drawing "ship".
export function Renderable<TBase extends Constructor<Unit>>(Base: TBase, textureName: string) {
  return class extends Base implements IRenderable {
    public textureName: string = textureName;
  };
}
