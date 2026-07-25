# Board clicks are resolved via the viewport's "clicked" event, not per-tile pointertap listeners

Discovered building the interaction test harness (ADR 0001): no tile or unit sprite could ever receive a click, in any browser, real or headless. `GameViewport` calls `pixi-viewport`'s `.drag()`, which unconditionally sets the viewport's own `hitArea` to a rectangle covering the whole world (needed for panning). PixiJS's hit-testing treats a container's own `hitArea` as authoritative for that container — matching pointer events resolve to the viewport itself and its children are never independently hit-tested underneath it. The previous per-sprite `sprite.on("pointertap", ...)` in `createWorldTile` was consequently dead code.

The fix: listen once on the viewport for its own `"clicked"` event (pixi-viewport's click-vs-drag disambiguation, carrying the click's world-space point) and resolve which tile was hit manually, via `pointToCube` (`core/grid/helpers.ts`) — reusing `handleTileClick`'s existing logic unchanged.

`pointToCube` itself needed a second fix: honeycomb-grid's `hex.toPoint()` (used to position rendered sprites) and `Grid.pointToHex()` (used to invert a pixel point back to a hex) are not true inverses — they use different coordinate origins (top-left vs. center), differing by exactly half a hex's width/height. A world click's coordinates arrive in `toPoint()`'s space (they come from a sprite's real rendered position), so that half-hex offset has to be added back before `pointToHex` resolves the correct hex. This is why `pointToCube` isn't a one-line call.

## Considered Options

- **`forceHitArea` on the viewport** — rejected: pixi-viewport's `forceHitArea` setter still always ends up setting *some* `hitArea` value (custom or the same full-world default); the hitArea-blocks-children behavior is a PixiJS hit-testing rule triggered by *any* hitArea being set, not by its specific bounds.
- **A custom `hitArea` with a `contains()` that always returns `false`** — would restore child hit-testing but breaks pixi-viewport's own drag/pan detection, which needs that hitArea to track pointer movement.
- **Duplicating a second, separately-sized `Hex` factory for `pointToCube`** — tried first; produced a systematically-wrong (always off by one neighboring hex) result even with matching `size`/`orientation`, because it didn't correct for the `toPoint()`/`pointToHex()` origin mismatch either. Fixed by reusing the exact grid factory `create_grid.ts` already builds, plus the explicit half-hex correction.

## Consequences

- Any future click-driven feature (attack targeting, etc.) must go through `handleViewportClicked`/`pointToCube`, not a new per-sprite listener — a new `sprite.on("pointertap", ...)` would silently never fire, exactly as this one didn't.
- `create_grid.ts` now exports its `Hex`/`Grid` factories (previously local to `createGrid()`) so `helpers.ts` can share the identical calibrated instance rather than risk a second, subtly different one.
