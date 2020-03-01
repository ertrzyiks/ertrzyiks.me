import {Application, DisplayObject, Point, ticker, utils} from 'pixi.js'
import * as TWEEN from '@tweenjs/tween.js'
import {create as createIntro} from './intro'
import {GameViewport} from './shared/viewport'

const main = () => import('./main')

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

const loadMain = async function (app: Application) {
  const mainModule = await main()
  return mainModule.create(app)
}

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
  initGame()
    .then(startingPoint => initialize(startingPoint.x, startingPoint.y))

}

function fadeOut(viewport: DisplayObject) {
  let state = { alpha: 1}
  return new Promise(resolve => {
    const tween = new TWEEN.Tween(state).to({ alpha: 0 }, 700).onUpdate(() => {
      viewport.alpha = state.alpha
    }).onComplete(() => resolve())

    tween.start()
  })
}

export async function initialize(x: number, y: number) {
  const viewport = await loadIntro(new Point(x, y))
  const onIntroFinish = new Promise(resolve => {
    viewport.emitter.on('finish', () => resolve())
  })

  const [newViewport] = await Promise.all([
    loadMain(app),
    onIntroFinish
  ])

  // newViewport.moveCenter(viewport.center)
  app.stage.addChildAt(newViewport, 0)
  await fadeOut(viewport)
  app.stage.removeChild(viewport)
}
