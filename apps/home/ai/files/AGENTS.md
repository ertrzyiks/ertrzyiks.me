## Build & Run

- Dev server: `npm run dev` (or `npm start`) — Astro dev server with HMR
- Build: `npm run build` — runs `astro check` (TypeScript + Astro diagnostics) then `astro build`
- Preview built output: `npm run preview`
- Sprites: `npm run generate:sprites` — regenerates sprite atlases from raw assets in `src/game/assets/`

All commands run from `apps/home/` (not the `ai/files/` dir that holds these docs).

## Validation

Run these after implementing to get immediate feedback:

- Tests: `npm test` (vitest, watch mode) or `npx vitest run` (single pass)
- Typecheck: prefer `npx tsc --noEmit` (fast, low memory). `npm run build` runs `astro check` first.
- `astro check` is memory-hungry and OOMs with the default heap on this box. Run it as
  `NODE_OPTIONS="--max-old-space-size=6144" npx astro check`. It also scans `dist/` and emits
  noisy warnings/hints on generated bundles — only the `Result (...) - N errors` line matters.
- Lint: no ESLint configured; rely on TypeScript strict mode

## Environment

- Dependencies were installed on macOS but the runner is **linux/arm64**, so the platform esbuild
  binary is missing and vitest/vite fail with "installed esbuild for another platform". Fix once per
  fresh checkout by adding the linux binary for the in-use esbuild version (currently 0.21.5):
  download `@esbuild/linux-arm64@<ver>`, extract into
  `node_modules/.pnpm/@esbuild+linux-arm64@<ver>/node_modules/@esbuild/linux-arm64`, then symlink it
  into `node_modules/.pnpm/esbuild@<ver>/node_modules/@esbuild/linux-arm64`.

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
- Enemy AI: `Behavior` subclasses in `src/game/core/player/` consume a per-player `StoreProxy` and
  dispatch `PlayerAction`s. Shared movement math lives in `core/player/movement.ts`. NOTE: the proxy
  only exposes the current player's units — behaviors that need enemy positions are blocked until
  that changes (tracked in IMPLEMENTATION_PLAN.md).
