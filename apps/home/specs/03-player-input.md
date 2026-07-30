# Player Input

## Topic Statement

The player input system translates a human player's hex-click gestures into game actions during that player's turn.

## Scope

**In scope:** Click detection on hex tiles, translating clicks to move or attack actions, feedback for invalid actions, end-turn trigger.

**Boundaries:** How movement points are consumed (movement system spec). How combat resolves (combat system spec). Enemy turns are not controlled by this system.

## Behaviors

### Active Turn Requirement

- Player input is only processed during the human player's turn.
- Clicks during an enemy turn, an animation, or a dialog are ignored.

### Click on an Empty Hex

- The player clicks a hex tile that is not occupied.
- If the hex is within the player's unit's move range — every hex reachable within its remaining movement budget, without the path crossing an occupied tile, not just the adjacent ring — the unit walks there in one action (auto-path), spending the budget the route costs (see ADR-0003).
- If the hex is outside the unit's move range, or the unit has no movement budget, no action is taken.

### Click on an Enemy Unit

- The player clicks a hex occupied by an enemy unit.
- If the enemy is adjacent to the player's unit and the player's unit has not yet used its attack action this turn, an attack is initiated.
- If the enemy is not adjacent, no action is taken.

### Auto-Attack on Move

- After a move (single-step or auto-path) completes, if the moved unit has an unused attack action, its eligible attack targets (adjacent enemies it could otherwise attack by clicking) are checked (ADR-0004).
- With exactly one eligible target, the attack resolves automatically — there is no way to end a move adjacent to a single eligible enemy without attacking it.
- With zero eligible targets, nothing happens.
- With two or more eligible targets, the attack does not auto-resolve — the choice is ambiguous, so the unit stays selected and highlighted (see Visual Feedback) until the player clicks one of the eligible enemies, resolving it via Click on an Enemy Unit above.

### Click on a Friendly Unit

- Clicking a hex occupied by a friendly unit selects that unit as the active unit.
- Subsequent clicks operate relative to the selected unit.
- Only one unit is selected at a time; selecting another unit deselects the previous.

### End Turn

- The player explicitly ends their turn via a dedicated UI control (button or key).
- End turn is only available during the human player's turn.
- After end turn, input is locked until the human player's next turn starts.

### Visual Feedback

- When a unit is selected, its full move range is visually highlighted — every hex it could end its move on this turn, not just the adjacent ring.
- When a unit is selected and has an unused attack action, every eligible attack target is marked with a frame — shown continuously while the unit is selected (so it's visible before a manual click resolves an attack), and during an auto-attack, before its damage is applied.
- When the player cannot act (no budget, not their turn), highlight is absent.
- An invalid click produces no game state change and no highlight.

## Acceptance Criteria

- Clicking an adjacent empty hex moves the unit there (if budget allows).
- Clicking a hex within the unit's move range but not adjacent auto-paths the unit there in one click.
- Clicking a hex outside the unit's move range does not move the unit.
- Clicking an adjacent enemy initiates combat (if attack not yet used).
- A move that lands next to exactly one eligible enemy attacks it automatically.
- A move that lands next to two or more eligible enemies does not auto-attack; a follow-up click on one of them does.
- Clicking during enemy turn has no effect.
- End turn locks input until the human player's next turn.
