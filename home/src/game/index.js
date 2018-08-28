import 'core-js/es6/promise'
import {Application, Point, Loader, ticker, utils} from 'pixi.js'
import TWEEN from '@tweenjs/tween.js'
import {create as createIntro} from './intro'
import './styles.sass'

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

function initGame() {
  const warriors = document.getElementById('warriors')

  return new Promise((resolve) => {
    function onClick(e) {
      warriors.removeEventListener('click', onClick)
      resolve(new Point(e.clientX, e.clientY))
    }
    warriors.addEventListener('click', onClick)
  })
}

const emitter = new utils.EventEmitter()

const loadIntro = (startingPoint) => createIntro(app, startingPoint, emitter).then(viewport => {
  app.stage.addChild(viewport)
  resize()

  if (!document.body.contains(app.view)) {
    const el = document.getElementById('game')
    el.parentNode.replaceChild(app.view, el)
  }

  app.start()
  app.view.style.display = ''
  return viewport
})

const launch = () => new Promise(resolve => {
  emitter.once('launch', coordinates => {
    resolve(coordinates)
  })
})

function initialize() {
  initGame()
    .then(startingPoint => Promise.all([loadIntro(startingPoint), launch()]))
    .then(data => ({viewport: data[0], coordinates: data[1]}))
    .then(({viewport, coordinates}) => {
      return import('./main')
        .then(m => m.create(app, emitter, coordinates))
        .then((newViewport) => ({viewport, newViewport}))
    })
    .then(({viewport, newViewport}) => {
      newViewport.moveCenter(viewport.center)
      app.stage.removeChild(viewport)
      app.stage.addChild(newViewport)
    })
}

initialize()

emitter.on('exit', () => {
  app.stop()
  app.view.style.display = 'none'
  app.loader.reset()

  while (app.stage.children[0]) {
    const child = app.stage.children[0]
    app.stage.removeChild(child)
    child.destroy({children: true, texture: true, baseTexture: true})
  }

  initialize()
})
