import {GameWorld} from '../shared/game_world'
import * as dat from 'dat.gui'
import {interaction, loaders, ticker} from "pixi.js";
import {Board} from '../core'

interface GameEditorData {
  level: string,
  name: string,
  rows: number,
  columns: number,
  save: () => void
  create: () => void
}

export class EditorWorld extends GameWorld {
  protected gui: dat.GUI
  protected setupFolder: dat.GUI
  protected game_data: GameEditorData

  constructor(protected board: Board, protected resources: loaders.ResourceDictionary, protected ticker: ticker.Ticker, protected interaction: interaction.InteractionManager) {
    super(board, resources, ticker, interaction)

    this.game_data = {
      level: '',
      name: '',
      rows: 0,
      columns: 0,
      save: () => this.save(),
      create: () => this.create()
    }

    this.gui = new dat.GUI({
      hideable: false
    })

    this.setupFolder = this.gui.addFolder('Setup')
    this.setupFolder.open()
    this.setupFolder.add(this.game_data, 'name')
    this.setupFolder.add(this.game_data, 'create')

    fetch('/levels').then(res => res.json()).then(data => {
      const levels = data.levels as string[]

      const levelController = this.setupFolder.add(this.game_data, 'level', levels)

      levelController.name('or select')
      levelController.onChange((value: string) => {
        this.gui.removeFolder(this.setupFolder)
        this.onLevelSelect(value)
      })
    })
  }

  onLevelSelect(name: string) {
    fetch(`/levels/${name}`).then(res => res.json()).then(data => {
      this.game_data.rows = data.rows
      this.game_data.columns = data.cols

      const settingsFolder = this.gui.addFolder('Main settings')
      settingsFolder.open()
      settingsFolder.add(this.game_data, 'save')
      settingsFolder.add(this.game_data, 'rows', 0, 100)
      settingsFolder.add(this.game_data, 'columns', 0, 100)
    })
  }

  create() {
    const name = this.game_data.name

    fetch(`/levels/${name}`, {method: 'PUT'})
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert(data.error)
        } else {
          this.gui.removeFolder(this.setupFolder)
          this.onLevelSelect(name)
        }
      })
      .catch(e => {
        alert(e.message)
      })
  }

  save() {
    console.log('SAVE!')
  }
}
