# Home Game

A playable single-player hex-grid tactical game embedded in the personal site. See `specs/` for full behavioral contracts.

## Language

**Interaction test**:
A Playwright-driven test that drives the real production input-handling code (`MainWorld`'s PixiJS `pointertap` wiring) through actual pixel clicks against a minimal, isolated board, asserting outcomes by reading game state through a test-only hook. Exists because unit and scenario tests dispatch store actions directly and never exercise the browser click → handler path — the exact path that broke for click-to-select-then-move while every other test stayed green.
_Avoid_: e2e test, browser test (both imply exercising the whole game — intro, real stages, narrative — which this deliberately does not do).

**Interaction harness**:
The `import.meta.env.DEV`-gated Astro page that boots a real `MainWorld` instance against a minimal board (no enemies, no narrative) for interaction tests to drive. Exists only in dev; inert in a production build.
