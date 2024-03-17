import TWEEN from '@tweenjs/tween.js'
import {Application} from 'pixi.js'
import {create} from './editor'

 // @ts-ignore
const app = new Application({transparent: true, resolution: window.devicePixelRatio})

app.ticker.add(() => {
  TWEEN.update()
})

window.addEventListener('resize', resize)

function resize() {
  app.renderer.resize(window.innerWidth, window.innerHeight)
}

const el = document.getElementById('game')
 // @ts-ignore
el.parentNode.replaceChild(app.view, el)

create(app).then(viewport => {
  resize()
  app.stage.addChild(viewport)
})
