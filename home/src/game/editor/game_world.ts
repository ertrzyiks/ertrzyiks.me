import {GUI} from 'dat.gui'
import * as debounce from 'debounce'
import {Container, interaction, loaders, Texture, ticker} from 'pixi.js'
import {
  World,
  Board,
  BoardTerrain,
  GameTileHex,
  Terrain
} from '../core'
import Api from './api_service'
import {GameViewport} from '../shared/viewport'
import {Tile} from "../shared/renderable/tile";
import {TerrainTiles} from "../shared/terrain_tiles";
import {createStore, Store} from '../core/store'
import {EditorEvent, EditorEventType} from './editor_event'
import {State} from '../core/world'
import {editorReducer} from './reducer'

interface GameEditorData {
  level: string,
  name: string,
  rows: number,
  columns: number,
  save: () => void
  create: () => void
}

export class EditorWorld extends Container {
  protected store: Store<EditorEvent, State>


  protected viewport: GameViewport
  protected gui: GUI = new GUI({ hideable: false })
  protected setupFolder: GUI
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

    this.store = createStore(editorReducer, {
      players: [],
      currentPlayerIndex: null,
      currentPlayer: null,
      tiles: [],
      units: [],
      worldWidth: 1000,
      worldHeight: 1000
    })

    this.viewport = new GameViewport({
      worldWidth: this.store.getState().worldWidth,
      worldHeight: this.store.getState().worldHeight,
      ticker,
      interaction
    })

    this.setupGui()

    this.store.subscribe(state => {
      this.renderTerrain()

      this.viewport.resize(window.innerWidth, window.innerHeight, state.worldWidth, state.worldHeight)
    })

    this.addChild(this.viewport)
  }

  protected renderTerrain() {
    this.terrainTiles.allValues().forEach(sprite => {
      this.viewport.removeChild(sprite)
    })

    this.terrainTiles.clear()

    this.store.getState().tiles.forEach((hex: GameTileHex) => {
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

      const updateSize = debounce(this.updateSize.bind(this), 100)

      const settingsFolder = this.gui.addFolder('Main settings')
      settingsFolder.open()
      settingsFolder.add(this.game_data, 'save')
      settingsFolder.add(this.game_data, 'rows', 1, 100, 1).onChange(updateSize)
      settingsFolder.add(this.game_data, 'columns', 1, 100, 1).onChange(updateSize)

      this.store.dispatch({
        type: EditorEventType.LoadBoard,
        data
      })
    })
  }

  updateSize() {
    this.store.dispatch({
      type: EditorEventType.SetSize,
      cols: this.game_data.columns,
      rows: this.game_data.rows,
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
    const state = this.store.getState()

    const payload = {
      rows: this.game_data.rows,
      cols: this.game_data.columns,
      tiles: state.tiles
    }

    Api.save(name, payload).catch(e => {
      this.reportError(e.message)
    })
  }

  reportError(message: string) {
    alert(message)
  }
}
