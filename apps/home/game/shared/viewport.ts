import 'pixi.js'
import {DestroyOptions} from 'pixi.js'
import {Viewport} from 'pixi-viewport'

export class GameViewport extends Viewport {
  protected hexSize = 100
  protected offset = this.hexSize * 0.75

  constructor(options?: any) {
    super({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      ...options
    })

    this.drag()
    this.worldClamp(options.worldWidth, options.worldHeight)

    this.onResize = this.onResize.bind(this)

    this.on('added', () => {
      window.addEventListener('resize', this.onResize)
    })

    this.on('removed', () => {
      window.removeEventListener('resize', this.onResize)
    })
  }

  worldClamp(width: number, height: number) {
    return this
      .clamp({
        left: this.offset,
        top: this.offset,
        right: width - this.offset,
        bottom: height - this.offset
      })
  }

  onResize() {
    this.resize(window.innerWidth, window.innerHeight, this.worldWidth, this.worldHeight)
  }

  resize(screenWidth: number, screenHeight: number, worldWidth?: number, worldHeight?: number) {
    super.resize(screenWidth, screenHeight, worldWidth, worldHeight)

    if (worldWidth !== null && worldHeight !== null) {
      this.plugins.remove('clamp')
      this.worldClamp(worldWidth, worldHeight)
    }
  }

  destroy (options?: DestroyOptions) {
    window.removeEventListener('resize', this.onResize)
    super.destroy(options)
  }
}
