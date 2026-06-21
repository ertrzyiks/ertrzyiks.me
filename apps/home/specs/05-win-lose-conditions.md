# Win/Lose Conditions

## Topic Statement

The win/lose system evaluates scenario-specific end conditions after each game action and terminates the game when a condition is met.

## Scope

**In scope:** Evaluation of end conditions, game termination signal, the two built-in condition types (destination reached, all units defeated).

**Boundaries:** What is displayed to the player on game end (narrative/UI). Scenario definition format is an implementation detail.

## Behaviors

### Evaluation Trigger

- End conditions are evaluated after every game action (move, attack, unit death).
- Conditions are evaluated in priority order: lose conditions before win conditions.
- If a condition is met, the game emits a GameEnd event and no further player actions are accepted.

### Destination Win Condition

- The scenario designates one or more board sections as goal sections.
- The win condition is met when the player's unit occupies a tile whose section matches a goal section name.
- This is the default win condition for early scenarios.

### Last Unit Defeated (Lose Condition)

- The lose condition is met when the human player has no living units remaining on the board.
- This is evaluated after every unit-death event.

### Extensible Conditions

- Scenarios may define additional win/lose conditions (e.g., survive N turns, escort a unit to a tile).
- Custom conditions receive the same game state after each action.
- Multiple conditions of the same type are evaluated with OR logic: any one met triggers the outcome.

### Game End State

- After GameEnd, the game enters a terminal state.
- No actions (move, attack, end turn) are accepted in the terminal state.
- The outcome (win or lose) is included in the GameEnd event.

## Acceptance Criteria

- Moving the player's unit onto a goal section tile triggers a win.
- The player's last unit dying triggers a lose.
- No actions are accepted after game end.
- A win condition is not evaluated if a lose condition is met in the same action.

## Notable Behavior

- If both a win and a lose condition are met simultaneously (e.g., player reaches goal and last enemy is also defeated), lose takes priority.
