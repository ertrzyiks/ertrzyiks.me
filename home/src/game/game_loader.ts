import {Application, Point, ticker, utils} from 'pixi.js'
import * as TWEEN from '@tweenjs/tween.js'
import {create as createIntro} from './intro'
import {GameViewport} from './shared/viewport'

ticker.shared.autoStart = false
ticker.shared.stop()

const app = new Application({transparent: true, resolution: window.devicePixelRatio})
app.ticker.add(() => {
  TWEEN.update()
})

window.addEventListener('resize', resize)

function resize() {
  app.renderer.resize(window.innerWidth, window.innerHeight)
}

function initGame(): Promise<Point> {
  const warriors = document.getElementById('warriors')

  return new Promise((resolve) => {
    function onClick(e: MouseEvent) {
      warriors.removeEventListener('click', onClick)
      resolve(new Point(e.clientX, e.clientY))
    }
    warriors.addEventListener('click', onClick)
  })
}

const emitter = new utils.EventEmitter()

const loadIntro = (startingPoint: Point) => createIntro(app, startingPoint).then(viewport => {
  app.stage.addChild(viewport)
  resize()

  if (!document.body.contains(app.view)) {
    const el = document.getElementById('game')
    el.parentNode.replaceChild(app.view, el)
  }

  app.start()
  app.view.style.display = ''

  viewport.emitter.on('exit', () => {
    close()
  })

  return viewport
})

const launch = () => new Promise(resolve => {
  emitter.once('launch', (coordinates: Point) => {
    resolve(coordinates)
  })
})

function close() {
  app.stop()
  app.view.style.display = 'none'
  app.loader.reset()

  while (app.stage.children[0]) {
    const child = app.stage.children[0] as GameViewport
    app.stage.removeChild(child)
    child.destroy({children: true, texture: true, baseTexture: true})
  }

  reinitialize()
}

function reinitialize() {
  initGame().then(startingPoint => loadIntro(startingPoint))
}

export function initialize(x: number, y: number) {
  loadIntro(new Point(x, y))

  // .then(({viewport, newViewport}) => {
  //   newViewport.moveCenter(viewport.center)
  //   app.stage.removeChild(viewport)
  //   app.stage.addChild(newViewport)
  // })
}
