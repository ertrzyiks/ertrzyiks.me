# Narrative Events

## Topic Statement

The narrative event system triggers scripted story events and dialog in response to game state changes, pausing the game until the player acknowledges each event.

## Scope

**In scope:** Event triggers (tile reached, unit defeated, turn number), dialog display, game pause during dialog, player dismissal.

**Boundaries:** Game logic changes caused by narrative events (those are scenario conditions). Visual styling of dialog (rendering layer).

## Behaviors

### Event Triggers

Narrative events are defined per scenario. Supported trigger types:

- **Tile reached:** Fires when the player's unit moves onto a tile with a specific section name.
- **Unit defeated:** Fires when a specific unit type or player's last unit is removed from the board.
- **Turn N reached:** Fires at the start of turn N (before the player can act).

Each trigger fires at most once per scenario run unless explicitly marked as repeatable.

### Dialog Display

- When a narrative event triggers, a dialog is presented to the player.
- The dialog contains one or more lines of text (speaker name optional).
- Multi-line dialogs advance one line at a time on player input.
- The game is fully paused while dialog is active: no movement, combat, or turn actions are accepted.

### Player Dismissal

- The player dismisses each dialog line by clicking or pressing a designated input.
- After the final line is dismissed, the game resumes from the state it was in when the event fired.
- If the triggering event was a win/lose condition (e.g., tile reached = goal), the game ends after the dialog is dismissed.

### Event Sequencing

- If multiple triggers fire simultaneously (e.g., reaching a tile that is both a goal and a narrative trigger), they are queued and presented in definition order.
- The game only resumes fully after all queued dialogs are dismissed.

### Scenario Script

- All narrative events for a scenario are defined in a declarative script external to the game engine.
- The engine evaluates triggers after each game action, not inside the game loop.

## Acceptance Criteria

- Stepping onto a trigger tile shows dialog before the player can act again.
- Defeating a trigger unit shows dialog before the turn continues.
- Dialog dismissal requires one player input per line.
- No game actions are accepted while dialog is active.
- Each trigger fires at most once per scenario unless repeatable.
