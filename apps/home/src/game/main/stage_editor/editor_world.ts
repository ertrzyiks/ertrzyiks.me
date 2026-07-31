import { GUI } from "dat.gui";
import {
  Container,
  EventBoundary,
  type EventSystem,
  type Spritesheet,
} from "pixi.js";
import type { Point as PointLike } from "honeycomb-grid";
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
import { UNIT_CATALOG, BEHAVIOR_CATALOG, FACTION_CATALOG, type UnitKey, type BehaviorKey, type FactionKey } from "./catalog";
import {
  createRosterEditorState,
  loadRosterEditorState,
  refreshValidSections,
  rosterEditorReducer,
  toStageRosterData,
  validateAgainstBoard,
  type RosterEditorState,
} from "./roster_editor_reducer";
import { RosterEditorEventType, type RosterEditorEvent } from "./roster_editor_event";
import type { StageRosterData } from "./stage_roster";
import { TERRAIN_TEXTURE_NAMES } from "../../assets_gen/terrain_sprites";

const DEFAULT_ROWS = 6;
const DEFAULT_COLS = 8;
// Every terrain texture packed into the board atlases (gh #191) — see
// assets_gen/terrain_sprites.ts for the roster.
const AVAILABLE_TEXTURES = TERRAIN_TEXTURE_NAMES;

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
  load: () => void;
  tile: { textureName: string; sectionName: string };
}

/**
 * The dev-only Stage Editor's board-tile half (issue #170). Deliberately
 * built on a plain viewport + `Store<EditorEvent, State>` — the pattern the
 * dead `EditorWorld`/`board_editor.ts`/`Api./levels` scaffolding used before
 * it was deleted as fully superseded by this class (that history is why
 * `editor_event.ts`/`reducer.ts` still live under `src/game/editor/`, reused
 * unmodified below) — not on `shared/game_world.ts`'s `GameWorld`, which
 * wraps a live `Game`/turn-loop (spawns, moves, combat)
 * this authoring tool has no use for (issue: "no live playtest... the editor
 * never boots a real Scenario/turn loop against in-progress edits"). Reuses
 * `editor_event.ts`/`reducer.ts` unmodified for board-tile authoring — see
 * roster_editor_reducer.ts's own module comment for why stage-roster
 * authoring (spawns/rosters/win section) is instead a *separate* reducer,
 * not added here.
 *
 * Roster authoring (spawn/enemy-roster/win-section pickers) composes the
 * board-tile reducer above with `rosterEditorReducer` — kept as two separate
 * `Store`-like pieces of state, not merged into one, per that reducer's own
 * module comment: `RosterEditorState`'s `validSections` is refreshed here
 * (via `refreshValidSections`, not a dispatched `RosterEditorEvent`)
 * whenever a board-tile action could have changed section names, since
 * section-renaming stays the board-tile reducer's concern.
 */
export class StageEditorWorld extends Container {
  protected store: Store<EditorEvent, State>;
  protected viewport: GameViewport;
  protected gui: GUI = new GUI({ hideable: false });
  protected tileFolder: GUI | null = null;
  protected rosterFolder: GUI | null = null;
  protected terrainTiles: TerrainTiles<Tile> = new TerrainTiles();
  protected selectedTile: PointLike | null = null;
  protected rosterState: RosterEditorState = createRosterEditorState({ rows: 0, cols: 0, tiles: [] });

  protected data: StageEditorGuiData = {
    name: "",
    save: () => void this.save(),
    load: () => void this.load(),
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

      // Section names can change under any board-tile action (a fresh
      // SetSize/LoadBoard reseeds every tile to "none"; SetTileSectionName
      // renames one) — keep the roster reducer's view of "sections that
      // exist" in sync so its pickers/validation never lag the real board.
      if (
        action.type === EditorEventType.SetSize ||
        action.type === EditorEventType.LoadBoard ||
        action.type === EditorEventType.SetTileSectionName
      ) {
        this.rosterState = refreshValidSections(this.rosterState, boardFromState(state));
        this.refreshRosterGui();
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
    stageFolder.add(this.data, "load").name("Load");

    this.refreshRosterGui();
  }

  /**
   * Rebuilds the whole "Roster" folder from scratch every time — dat.gui has
   * no API for changing an existing dropdown's option list or diffing a
   * dynamic list of items, so a full rebuild (cheap at this scale: at most a
   * handful of spawns/rosters in a dev tool) is simpler and more reliable
   * than trying to patch individual controllers in place. Called after every
   * roster dispatch and after any board-tile action that could have changed
   * section names.
   */
  protected refreshRosterGui() {
    if (this.rosterFolder) {
      this.gui.removeFolder(this.rosterFolder);
    }
    this.rosterFolder = this.gui.addFolder("Roster");
    this.rosterFolder.open();

    this.buildErrorDisplay(this.rosterFolder);
    this.buildWinSectionControl(this.rosterFolder);
    this.buildAddPlayerSpawnForm(this.rosterFolder);
    this.buildPlayerSpawnList(this.rosterFolder);
    this.buildAddEnemyRosterForm(this.rosterFolder);
    this.buildEnemyRosterList(this.rosterFolder);
  }

  protected dispatchRoster(action: RosterEditorEvent) {
    this.rosterState = rosterEditorReducer(this.rosterState, action);
    this.refreshRosterGui();
  }

  protected validSectionOptions(): string[] {
    const sections = Array.from(this.rosterState.validSections);
    return sections.length > 0 ? sections : ["none"];
  }

  protected buildErrorDisplay(folder: GUI) {
    if (!this.rosterState.error) return;
    const display = { error: this.rosterState.error };
    folder.add(display, "error").name("⚠ error");
  }

  protected buildWinSectionControl(folder: GUI) {
    // Defaulting the displayed value to validSectionOptions()[0] when
    // winSection is still "" would make the dropdown *look* like a section
    // is chosen when nothing has actually been dispatched — the author
    // could walk away believing Save will write a real win section when it
    // will write "". NOT_SET is a distinguishable, honest placeholder
    // instead, only offered while winSection really is unset.
    const NOT_SET = "(not set)";
    const options = this.rosterState.winSection
      ? this.validSectionOptions()
      : [NOT_SET, ...this.validSectionOptions()];
    const data = { winSection: this.rosterState.winSection || NOT_SET };

    folder
      .add(data, "winSection", options)
      .name("Win section")
      .onChange(() => {
        if (data.winSection === NOT_SET) return;
        this.dispatchRoster({ type: RosterEditorEventType.SetWinSection, section: data.winSection });
      });
  }

  protected buildAddPlayerSpawnForm(folder: GUI) {
    const sub = folder.addFolder("Add player spawn");
    sub.open();
    const data = {
      unitKey: Object.keys(UNIT_CATALOG)[0] as UnitKey,
      section: this.validSectionOptions()[0],
      add: () => {
        this.dispatchRoster({
          type: RosterEditorEventType.AddPlayerSpawn,
          section: data.section,
          unitKey: data.unitKey,
        });
      },
    };
    sub.add(data, "unitKey", Object.keys(UNIT_CATALOG));
    sub.add(data, "section", this.validSectionOptions());
    sub.add(data, "add").name("Add");
  }

  protected buildPlayerSpawnList(folder: GUI) {
    if (this.rosterState.playerSpawns.length === 0) return;
    const sub = folder.addFolder("Player spawns");
    sub.open();
    this.rosterState.playerSpawns.forEach((spawn, index) => {
      const data = {
        remove: () => this.dispatchRoster({ type: RosterEditorEventType.RemovePlayerSpawn, index }),
      };
      sub.add(data, "remove").name(`${spawn.section} (${spawn.unitKey}) — remove`);
    });
  }

  protected buildAddEnemyRosterForm(folder: GUI) {
    const sub = folder.addFolder("Add enemy roster");
    sub.open();
    const data = {
      factionKey: Object.keys(FACTION_CATALOG)[0] as FactionKey,
      behaviorKey: Object.keys(BEHAVIOR_CATALOG)[0] as BehaviorKey,
      turnEventName: "",
      add: () => {
        this.dispatchRoster({
          type: RosterEditorEventType.AddEnemyRoster,
          factionKey: data.factionKey,
          behaviorKey: data.behaviorKey,
          turnEventName: data.turnEventName,
        });
      },
    };
    sub.add(data, "factionKey", Object.keys(FACTION_CATALOG));
    sub.add(data, "behaviorKey", Object.keys(BEHAVIOR_CATALOG));
    sub.add(data, "turnEventName").name("Turn event name");
    sub.add(data, "add").name("Add");
  }

  protected buildEnemyRosterList(folder: GUI) {
    if (this.rosterState.enemies.length === 0) return;
    const sub = folder.addFolder("Enemy rosters");
    sub.open();

    this.rosterState.enemies.forEach((roster, rosterIndex) => {
      const rosterSub = sub.addFolder(`${rosterIndex}: ${roster.factionKey} (${roster.behaviorKey})`);
      rosterSub.open();

      const addData = {
        unitKey: Object.keys(UNIT_CATALOG)[0] as UnitKey,
        section: this.validSectionOptions()[0],
        add: () => {
          this.dispatchRoster({
            type: RosterEditorEventType.AddEnemyRosterSpawn,
            rosterIndex,
            section: addData.section,
            unitKey: addData.unitKey,
          });
        },
      };
      rosterSub.add(addData, "unitKey", Object.keys(UNIT_CATALOG));
      rosterSub.add(addData, "section", this.validSectionOptions());
      rosterSub.add(addData, "add").name("Add spawn");

      roster.spawns.forEach((spawn, spawnIndex) => {
        const removeData = {
          remove: () =>
            this.dispatchRoster({
              type: RosterEditorEventType.RemoveEnemyRosterSpawn,
              rosterIndex,
              spawnIndex,
            }),
        };
        rosterSub.add(removeData, "remove").name(`${spawn.section} (${spawn.unitKey}) — remove`);
      });

      const removeRosterData = {
        remove: () => this.dispatchRoster({ type: RosterEditorEventType.RemoveEnemyRoster, rosterIndex }),
      };
      rosterSub.add(removeRosterData, "remove").name("Remove this roster");
    });
  }

  protected onClick(el: Container) {
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

    // refreshValidSections only widens/narrows which sections a *new*
    // spawn/win-section pick can reference going forward — it deliberately
    // doesn't retroactively invalidate a spawn added before its section got
    // renamed out from under it (see roster_editor_reducer.ts's own doc
    // comments). validateAgainstBoard is the save-time gate that catches
    // that case, per issue #170 user story 12 ("save blocked ... if a
    // spawn/roster/win-section references a section name that doesn't exist
    // on the current board").
    const staleReferenceError = validateAgainstBoard(this.rosterState, board);
    if (staleReferenceError) {
      this.reportError(staleReferenceError);
      return;
    }

    const stageRoster = toStageRosterData(this.rosterState);

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

  /**
   * Issue #170 user story 16: "reopen a previously saved stage and see its
   * board/spawns/rosters/win section reflected in the editor." Sets
   * `rosterState` from the loaded data *before* dispatching `LoadBoard`, so
   * the board store's subscribe callback (which calls `refreshValidSections`
   * on every `LoadBoard`) refreshes `validSections` against the same,
   * already-correct roster data instead of racing a stale one — see that
   * callback in the constructor.
   */
  protected async load() {
    const name = this.data.name;

    try {
      const res = await fetch(`/api/stage-editor/load?name=${encodeURIComponent(name)}`);
      if (!res.ok) {
        this.reportError(await res.text());
        return;
      }

      const { board, stageRoster } = (await res.json()) as {
        board: Board;
        stageRoster: StageRosterData;
      };

      this.rosterState = loadRosterEditorState(stageRoster, board);
      this.store.dispatch({ type: EditorEventType.LoadBoard, data: board });

      this.reportSuccess(`Loaded "${name}"`);
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : "Load failed");
    }
  }

  protected reportError(message: string) {
    alert(message);
  }

  protected reportSuccess(message: string) {
    alert(message);
  }
}
