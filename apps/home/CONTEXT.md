# Home Game

A playable single-player hex-grid tactical game embedded in the personal site. See `specs/` for full behavioral contracts.

## Language

**Interaction test**:
A Playwright-driven test that drives the real production input-handling code (`MainWorld`'s PixiJS `pointertap` wiring) through actual pixel clicks against a minimal, isolated board, asserting outcomes by reading game state through a test-only hook. Exists because unit and scenario tests dispatch store actions directly and never exercise the browser click → handler path — the exact path that broke for click-to-select-then-move while every other test stayed green.
_Avoid_: e2e test, browser test (both imply exercising the whole game — intro, real stages, narrative — which this deliberately does not do).

**Interaction harness**:
The `import.meta.env.DEV`-gated Astro page that boots a real `MainWorld` instance against a minimal board (no enemies, no narrative) for interaction tests to drive. Exists only in dev; inert in a production build.

**Move range**:
The full set of hexes a unit could end its move on this turn — every hex reachable within its remaining movement budget, without the path crossing an occupied tile — not just the single ring of adjacent hexes. Highlighted when the unit is selected; clicking any hex in it moves the unit there directly (multi-step, one action).
_Avoid_: valid move destinations (the narrower, adjacent-only reading this term replaces).

**Auto-attack**:
The attack that resolves automatically the instant a unit's move ends it adjacent to exactly one eligible enemy, consuming that unit's attack action with no separate click required. Falls back to the existing click-the-enemy gesture when 2 or more enemies are eligible at once, since the player must pick.
_Avoid_: auto-combat (overstates it — only the trigger is automatic; damage resolution is unchanged).

**Attack-target highlight**:
A frame drawn around an enemy unit marking it as the target of an attack — shown both the instant the player clicks an enemy to attack manually, and during an auto-attack, before damage is applied. Distinct from the move-range highlight, which marks destinations rather than targets.
