import * as dat from 'dat.gui'
import {Container, interaction, loaders, Texture, ticker} from 'pixi.js'
import {Grid} from 'honeycomb-grid'
import {World, Board, createGrid} from '../core'
import Api from './api_service'
import {GameViewport} from '../shared/viewport'
import {BoardTerrain, GameTileHex, Terrain} from "../core/board";
import {Tile} from "../shared/renderable/tile";
import {TerrainTiles} from "../shared/terrain_tiles";

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
  protected terrainTiles: TerrainTiles = new TerrainTiles()

  protected game_data: GameEditorData = {
    level: '',
    name: '',
    rows: 1,
    columns: 1,
    save: () => this.save(),
    create: () => this.create()
  }

  constructor(
    protected resources: loaders.ResourceDictionary,
    protected ticker: ticker.Ticker,
    protected interaction: interaction.InteractionManager
  ) {
    super()

    const board = {
      cols: 30,
      rows: 30,
      tiles: [{x: 0, y: 0, width: 30, height: 30, type: Terrain.WATER, textureName: 'water'}]
    }

    this.grid = createGrid(board)
    this.world = new World(this.grid)

    this.viewport = new GameViewport({
      worldWidth: this.world.getState().worldWidth,
      worldHeight: this.world.getState().worldHeight,
      ticker,
      interaction
    })

    this.setupGui()

    this.renderTerrain()

    this.addChild(this.viewport)
  }

  protected renderTerrain() {
    this.world.getState().tiles.forEach((hex: GameTileHex) => {
      const sprite = this.createWorldTile(hex)
      const coords = hex.coordinates()

      this.terrainTiles.set(coords, sprite)
      this.viewport.addChild(sprite)
    })
  }

  protected createWorldTile(hex: GameTileHex) {
    const {x, y} = hex.toPoint()

    const coords = hex.cube()

    const sprite = new Tile(Texture.fromFrame(hex.textureName), coords)

    sprite.position.set(x, y)
    sprite.interactive = true
    sprite.buttonMode = false

    return sprite
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
