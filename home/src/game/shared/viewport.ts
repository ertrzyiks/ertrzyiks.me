import 'pixi.js'
import {DestroyOptions} from 'pixi.js'
import * as Viewport from 'pixi-viewport'

export class GameViewport extends Viewport {
  constructor(options?: Viewport.Options) {
    const hexSize = 100
    super({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      ...options
    })

    const offset = hexSize * 0.75
    this
      .clamp({
        left: offset,
        top: offset,
        right: options.worldWidth - offset,
        bottom: options.worldHeight - offset
      })
      .drag()

    this.onResize = this.onResize.bind(this)

    this.on('added', () => {
      window.addEventListener('resize', this.onResize)
    })

    this.on('removed', () => {
      window.removeEventListener('resize', this.onResize)
    })
  }

  onResize() {
    this.resize(window.innerWidth, window.innerHeight, this.worldWidth, this.worldHeight)
  }

  destroy (options?: DestroyOptions) {
    window.removeEventListener('resize', this.onResize)
    super.destroy(options)
  }
}
