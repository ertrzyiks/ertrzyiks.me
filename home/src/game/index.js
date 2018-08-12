import('babel-polyfill')
import {Application, Container, Sprite, Point, loader, ticker, utils} from 'pixi.js'
import TWEEN from '@tweenjs/tween.js'
import {create as createIntro} from './intro'

ticker.shared.autoStart = false
ticker.shared.stop()

const app = new Application({transparent: true, resolution: window.devicePixelRatio})
app.ticker.add(() => {
  TWEEN.update()
})

loader.add('plain_tile', require('../assets/intro/plain-tile.png'))
// loader.add('ship', require('../assets/intro/ship.png'))
// loader.add('tile', require('../assets/tile.svg'))
// loader.add('marker', require('../assets/mark.svg'))

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

  const el = document.getElementById('game')
  el.parentNode.replaceChild(app.view, el)

  window.addEventListener('resize', resize)

  function resize() {
    app.renderer.resize(window.innerWidth, window.innerHeight)
  }

  return viewport
})

const launch = () => new Promise(resolve => {
  emitter.once('launch', coordinates => {
    resolve(coordinates)
  })
})

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
