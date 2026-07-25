# Interaction tests drive MainWorld through real pixel clicks on an isolated dev-only harness

Existing tests (unit and scenario/wiring, e.g. `main/scenario.test.ts`) all dispatch store actions directly and never exercise the real PixiJS `pointertap` → `handleTileClick` path — which is exactly the code that broke for the click-to-select-then-move interaction while every test stayed green. We introduced a new **interaction test** tier (Playwright, `apps/home/interaction/*.spec.ts`) that drives real pixel clicks against actual PixiJS hit-testing, asserting outcomes via a `window.__test` hook the harness page exposes — not `MainWorld` itself. To avoid mounting all of Stage 1 (wolves, narrative dialogs) just to test input wiring, `MainWorld` gained a constructor seam accepting an injectable `StageDefinition`, and a new `import.meta.env.DEV`-gated Astro page boots it against a minimal 2-tile board: the real production class, minimal content.

## Considered Options

- **Synthetic event injection** (`window.__test.clickTile()` firing the handler directly) — rejected: bypasses PixiJS hit-testing, the exact layer that broke.
- **A separate test-only host class** reimplementing the click-to-move wiring — rejected: risks drifting from the real `MainWorld` code path, the same trap that let this bug through undetected.
- **A standalone server/toolchain** outside Astro for the harness — rejected: unnecessary second toolchain for a single-maintainer site; a dev-gated Astro page ships nothing meaningful to production.
- **Testing through real Stage 1** — rejected: mounts wolves, narrative, and dialogs irrelevant to input wiring, and dialogs actively block input, getting in the way of the test.

## Consequences

- `pnpm test:e2e` is a new required PR CI step (Chromium only), separate from the existing fast `pnpm test` (vitest) — different runtime profile (needs a browser + dev server), so kept out of the fast loop.
- `MainWorld`'s previously-hardcoded Stage 1 definition becomes an injectable constructor parameter — a capability also useful for future stage progression, not test-only.
