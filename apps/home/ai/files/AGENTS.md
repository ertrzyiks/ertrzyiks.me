## Build & Run

- Dev server: `npm run dev` (or `npm start`) — Astro dev server with HMR
- Build: `npm run build` — runs `astro check` (TypeScript + Astro diagnostics) then `astro build`
- Preview built output: `npm run preview`
- Sprites: `npm run generate:sprites` — regenerates sprite atlases from raw assets in `src/game/assets/`

## Validation

Run these after implementing to get immediate feedback:

- Tests: `npm test` (vitest, watch mode) or `npx vitest run` (single pass)
- Typecheck: `npm run build` includes `astro check`; for type-only: `npx tsc --noEmit`
- Lint: no ESLint configured; rely on TypeScript strict mode

## Operational Notes

### Project Structure

- `src/game/core/` — pure game logic (no Pixi.js); unit-testable
- `src/game/shared/` — Pixi.js rendering layer, shared across scenes
- `src/game/intro/` — intro scene (animated board reveal + wandering ship)
- `src/game/main/` — main game world (Hero unit, board1/board2 JSON)
- `src/game/editor/` — board editor (dev tool)
- `specs/` — behavioral specifications for the ralph loop

### Codebase Patterns

- Units use TypeScript mixin composition: `Renderable(Movable(Damageable(Unit, 100), 3))`
- Game state flows through `Store<GameEvent, State>` → `World` → `Game` → `GameWorld`
- Human player actions go through `StoreProxy` (PlayerAction → GameEvent translation)
- `Scenario` classes wire up players, spawn units, and subscribe to world updates
- Board layouts are JSON files in `src/game/main/boards/`; tiles have `sectionName` for named positions

### Known Stubs (do not treat as intended behavior)

- `World.tileBySection()` always returns `tiles[0]` regardless of sectionName — broken
- `Movable.step()` is a no-op — does not consume movement points
- `Explorer.takeActions()` does not call `replenish()` or check `canMove()` before moving
- `World.unitsOf()` returns all units regardless of player argument
