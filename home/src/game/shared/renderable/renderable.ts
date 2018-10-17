import {Unit} from '../../../core/unit/unit'

export interface IRenderable {
  textureName: string
}

export function Renderable<TBase extends Constructor<Unit>>(Base: TBase) {
  return class extends Base implements IRenderable {
    public textureName: string
  }
}
