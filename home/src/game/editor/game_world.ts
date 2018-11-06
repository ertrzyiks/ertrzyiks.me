import * as dat from 'dat.gui'
import {Container, interaction, loaders, ticker} from 'pixi.js'
import {Grid} from 'honeycomb-grid'
import {World, Board, createGrid} from '../core'
import Api from './api_service'
import {GameViewport} from '../shared/viewport'
import {BoardTerrain, Terrain} from "../core/board";

interface GameEditorData {
  level: string,
  name: string,
  rows: number,
  columns: number,
  save: () => void
  create: () => void
}

export class EditorWorld extends Container {
  protected grid: Grid
  protected world: World

  protected viewport: GameViewport
  protected gui: dat.GUI = new dat.GUI({ hideable: false })
  protected setupFolder: dat.GUI

  protected game_data: GameEditorData = {
    level: '',
    name: '',
    rows: 1,
    columns: 1,
    save: () => this.save(),
    create: () => this.create()
  }

  constructor(protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super()

    const board = {
      cols: 1,
      rows: 1,
      tiles: [{x: 0, y: 0, type: Terrain.WATER, textureName: 'PixelHex_zeshio_tile-988'}]
    }

    this.grid = createGrid(board)
    this.world = new World(this.grid)

    this.viewport = new GameViewport({
      worldWidth: this.world.width,
      worldHeight: this.world.height,
      ticker,
      interaction
    })

    this.setupGui()

    this.addChild(this.viewport)
  }

  setupGui() {
    this.setupFolder = this.gui.addFolder('Setup')
    this.setupFolder.open()
    this.setupFolder.add(this.game_data, 'name')
    this.setupFolder.add(this.game_data, 'create')

    Api.getList().then(levels => {
      const levelController = this.setupFolder.add(this.game_data, 'level', levels)

      levelController.name('or select')
      levelController.onChange((value: string) => {
        this.gui.removeFolder(this.setupFolder)
        this.onLevelSelect(value)
      })
    })
  }

  onLevelSelect(name: string) {
    this.game_data.name = name

    Api.get(name).then(data => {
      this.game_data.rows = data.rows || this.game_data.rows
      this.game_data.columns = data.cols || this.game_data.columns

      const settingsFolder = this.gui.addFolder('Main settings')
      settingsFolder.open()
      settingsFolder.add(this.game_data, 'save')
      settingsFolder.add(this.game_data, 'rows', 1, 100)
      settingsFolder.add(this.game_data, 'columns', 1, 100)
    })
  }

  create() {
    const name = this.game_data.name

    Api.create(name)
      .then(() => {
        this.gui.removeFolder(this.setupFolder)
        this.onLevelSelect(name)
      })
      .catch(e => {
        this.reportError(e.message)
      })
  }

  save() {
    const name = this.game_data.name

    const payload = {
      rows: Math.round(this.game_data.rows),
      cols: Math.round(this.game_data.columns)
    }

    Api.save(name, payload).catch(e => {
      this.reportError(e.message)
    })
  }

  reportError(message: string) {
    alert(message)
  }
}
