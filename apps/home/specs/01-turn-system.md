# Turn System

## Topic Statement

The turn system controls which player acts, sequences actions within a turn, and advances the game after each player has acted.

## Scope

**In scope:** Player registration, turn order rotation, turn start/end lifecycle, action sequencing within a turn.

**Boundaries:** What actions are available during a turn (movement, combat) is defined in their respective specs. Rendering and animation are out of scope.

## Behaviors

### Player Registration

- One or more players are registered before the game starts.
- Players are ordered in the sequence they were registered.
- A player has an identifier, a display name, and a color.

### Turn Start

- The game begins by starting the first turn.
- On turn start, the next player in the registration sequence becomes the current player.
- After the last player acts, the sequence wraps back to the first player.
- At turn start, all of the current player's units have their resources replenished (movement points, action charges).
- Turn start is observable by external systems (scenario scripts, AI, renderer).

### Turn End

- A turn ends when the current player signals end-of-turn.
- After turn end, the next turn starts immediately in the same game loop.
- Turn end is observable by external systems.

### Action Sequencing

- Within a turn, a player may take multiple actions (move, attack) in any order, subject to resource availability.
- Each action is atomic: it either completes fully or does not apply.
- Actions taken during a turn are sequenced — a new action does not begin until the previous one resolves.

## State Transitions

```
IDLE → [PlayerJoin] → WAITING
WAITING → [StartGame] → TURN_START
TURN_START → [replenish all units] → PLAYER_ACTING
PLAYER_ACTING → [action] → PLAYER_ACTING
PLAYER_ACTING → [EndTurn] → TURN_END
TURN_END → [next player] → TURN_START
```

## Notable Behavior

- If only one player is registered, that player's turn cycles indefinitely.
- Turn start fires even if the current player has no units (no implicit skip).
