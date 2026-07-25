import { GUI } from "dat.gui";
import {
  Container,
  EventBoundary,
  type DisplayObject,
  type EventSystem,
  type Spritesheet,
} from "pixi.js";
import type { PointLike } from "honeycomb-grid";
import { GameViewport } from "../../shared/viewport";
import { Tile } from "../../shared/renderable/tile";
import { TerrainTiles } from "../../shared/terrain_tiles";
import { createStore, Store } from "../../core/store";
import { cubeToCartesian } from "../../core/grid/helpers";
import { EditorEventType, type EditorEvent } from "../../editor/editor_event";
import { editorReducer } from "../../editor/reducer";
import { getTile } from "../../editor/utils";
import type { State } from "../../core/world";
import type { Board, GameTileHex } from "../../core/board";
import type { StageRosterData } from "./stage_roster";

const DEFAULT_ROWS = 6;
const DEFAULT_COLS = 8;
const AVAILABLE_TEXTURES = ["water", "grass"];

/** Turns the store's Honeycomb `GameTileHex[]` back into the plain `Board` shape `/api/stage-editor/save` (and board{1,2,3}.json) expect. */
function boardFromState(state: State): Board {
  return {
    rows: state.rows,
    cols: state.cols,
    tiles: state.tiles.map((hex: GameTileHex) => {
      const { x, y } = hex.coordinates();
      return { x, y, type: hex.type, textureName: hex.textureName, sectionName: hex.sectionName };
    }),
  };
}

interface StageEditorGuiData {
  name: string;
  save: () => void;
  tile: { textureName: string; sectionName: string };
}

/**
 * The dev-only Stage Editor's board-tile half (issue #170). Deliberately
 * built on the plain viewport + `Store<EditorEvent, State>` pattern the now-
 * dead `src/game/editor/game_world.ts` used — not on `shared/game_world.ts`'s
 * `GameWorld`, which wraps a live `Game`/turn-loop (spawns, moves, combat)
 * this authoring tool has no use for (issue: "no live playtest... the editor
 * never boots a real Scenario/turn loop against in-progress edits"). Reuses
 * `editor_event.ts`/`reducer.ts` unmodified for board-tile authoring — see
 * roster_editor_reducer.ts's own module comment for why stage-roster
 * authoring (spawns/rosters/win section) is instead a *separate* reducer,
 * not added here.
 *
 * Roster authoring (spawn/roster/win-section pickers, wired to
 * `rosterEditorReducer`) is a follow-up slice — Save here writes an empty
 * `StageRosterData`, so only the board half of a saved stage is meaningful
 * until that lands.
 */
export class StageEditorWorld extends Container {
  protected store: Store<EditorEvent, State>;
  protected viewport: GameViewport;
  protected gui: GUI = new GUI({ hideable: false });
  protected tileFolder: GUI | null = null;
  protected terrainTiles: TerrainTiles<Tile> = new TerrainTiles();
  protected selectedTile: PointLike | null = null;

  protected data: StageEditorGuiData = {
    name: "",
    save: () => void this.save(),
    tile: { textureName: "water", sectionName: "none" },
  };

  constructor(
    protected events: EventSystem,
    protected sheet: Spritesheet
  ) {
    super();

    this.store = createStore(editorReducer, {
      players: [],
      currentPlayerIndex: null,
      currentPlayer: null,
      turn: 0,
      tiles: [],
      units: [],
      revealedTiles: {},
      outcome: null,
      worldWidth: 1000,
      worldHeight: 1000,
      cols: 0,
      rows: 0,
    });

    this.viewport = new GameViewport({
      worldWidth: this.store.getState().worldWidth,
      worldHeight: this.store.getState().worldHeight,
      events,
    });

    // Not the anti-pattern docs/adr/0002 warns about: that ADR's problem is a
    // sprite's own `pointertap` listener never firing, because GameViewport's
    // `.drag()` sets the viewport's `hitArea` to the whole world and Pixi's
    // automatic event dispatch never independently hit-tests children
    // underneath a container's own hitArea. `EventBoundary.hitTest(x, y)` is
    // a different mechanism — an explicit geometric query run *after* the
    // viewport's own "clicked" event already fired (unaffected by the same
    // hitArea, since it's the viewport's own custom event), not a listener
    // depending on automatic per-sprite dispatch. Confirmed working via a
    // real browser click in a Playwright smoke test (tile selection,
    // texture/section edits, and Save all round-tripped correctly).
    const boundary = new EventBoundary(this.viewport);
    this.viewport.on("clicked", (e) => {
      const target = boundary.hitTest(e.screen.x, e.screen.y);
      this.onClick(target);
    });

    this.setupGui();

    this.store.subscribe((state, action) => {
      if (action.type === EditorEventType.SetSize || action.type === EditorEventType.LoadBoard) {
        this.renderTerrain();
        this.viewport.resize(
          window.innerWidth,
          window.innerHeight,
          state.worldWidth,
          state.worldHeight
        );
      } else if (action.type === EditorEventType.SetTileTexture) {
        this.updateTileSprite(action.x, action.y);
      }
    });

    this.addChild(this.viewport);

    this.store.dispatch({ type: EditorEventType.SetSize, rows: DEFAULT_ROWS, cols: DEFAULT_COLS });
  }

  protected setupGui() {
    const stageFolder = this.gui.addFolder("Stage");
    stageFolder.open();
    stageFolder.add(this.data, "name");
    stageFolder.add(this.data, "save").name("Save");
  }

  protected onClick(el: DisplayObject) {
    if (el instanceof Tile) {
      this.setupTileFolder(cubeToCartesian(el.coordinates));
    } else if (this.tileFolder) {
      this.gui.removeFolder(this.tileFolder);
      this.tileFolder = null;
      this.selectedTile = null;
    }
  }

  protected setupTileFolder(point: PointLike) {
    this.selectedTile = point;

    if (!this.tileFolder) {
      this.tileFolder = this.gui.addFolder("Tile settings");
      this.tileFolder
        .add(this.data.tile, "textureName", AVAILABLE_TEXTURES)
        .onChange(this.onTextureNameChange.bind(this));
      this.tileFolder.add(this.data.tile, "sectionName").onChange(this.onSectionNameChange.bind(this));
    }

    const tile = getTile(this.store.getState().tiles, point.x, point.y);
    if (!tile) {
      throw new Error(`No tile found at ${point.x}, ${point.y}`);
    }
    this.data.tile.textureName = tile.textureName;
    this.data.tile.sectionName = tile.sectionName;
    this.tileFolder.updateDisplay();
    this.tileFolder.open();
  }

  protected onTextureNameChange() {
    if (!this.selectedTile) return;
    this.store.dispatch({
      type: EditorEventType.SetTileTexture,
      x: this.selectedTile.x,
      y: this.selectedTile.y,
      textureName: this.data.tile.textureName,
    });
  }

  protected onSectionNameChange() {
    if (!this.selectedTile) return;
    this.store.dispatch({
      type: EditorEventType.SetTileSectionName,
      x: this.selectedTile.x,
      y: this.selectedTile.y,
      sectionName: this.data.tile.sectionName,
    });
  }

  protected renderTerrain() {
    this.terrainTiles.allValues().forEach((sprite) => {
      if (sprite) this.viewport.removeChild(sprite);
    });
    this.terrainTiles.clear();

    this.store.getState().tiles.forEach((hex: GameTileHex) => {
      const sprite = this.createWorldTile(hex);
      this.terrainTiles.set(hex.coordinates(), sprite);
      this.viewport.addChild(sprite);
    });
  }

  protected updateTileSprite(x: number, y: number) {
    const sprite = this.terrainTiles.get({ x, y });
    const tile = getTile(this.store.getState().tiles, x, y);
    if (sprite && tile) {
      sprite.texture = this.sheet.textures[tile.textureName];
    }
  }

  protected createWorldTile(hex: GameTileHex) {
    const { x, y } = hex.toPoint();
    const sprite = new Tile(this.sheet.textures[hex.textureName], hex.cube());
    sprite.position.set(x, y);
    sprite.eventMode = "dynamic";
    return sprite;
  }

  protected async save() {
    const board = boardFromState(this.store.getState());
    const stageRoster: StageRosterData = { playerSpawns: [], enemies: [], winSection: "" };

    try {
      const res = await fetch("/api/stage-editor/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.data.name, board, stageRoster }),
      });

      if (!res.ok) {
        this.reportError(await res.text());
        return;
      }

      this.reportSuccess(`Saved "${this.data.name}"`);
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : "Save failed");
    }
  }

  protected reportError(message: string) {
    alert(`Save failed: ${message}`);
  }

  protected reportSuccess(message: string) {
    alert(message);
  }
}
