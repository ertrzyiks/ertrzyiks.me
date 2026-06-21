# Stage System

## Topic Statement

The stage system loads a self-contained scenario into the game engine, sequences stages in order after each victory, and resets game state cleanly between stages.

## Scope

**In scope:** Stage definition format, stage loading, progression from one stage to the next, stage reset on death.

**Boundaries:** What happens within a stage (movement, combat, narrative) is defined in their respective specs. Visual transitions between stages are out of scope.

## Behaviors

### Stage Definition

- A stage is a self-contained unit of play defined by: a board layout, player spawn position, enemy spawn positions and types, win conditions, lose conditions, and a narrative script.
- Stage definitions are declared outside the game engine and loaded before play begins.
- The engine accepts a stage definition and configures itself accordingly; it does not hard-code stage content.

### Stage Sequence

- Stages are ordered and numbered starting from 1.
- After a win event, the next stage in sequence loads automatically.
- After a lose event, the current stage reloads from its initial state.
- After the final stage is won, the game enters a completed state and no further stages load.

### Stage Load

- On stage load, all units from the previous run are removed.
- The board is set to the stage's layout.
- Units are spawned at their designated positions before the first turn begins.
- The turn counter resets to 1.
- Fog of war resets: all tiles return to hidden.

### Stage Completed State

- After the final stage, the game displays an end screen and accepts no further gameplay input.

## Acceptance Criteria

- Winning Stage 1 causes Stage 2 to load without manual intervention.
- Losing any stage reloads that stage from the beginning with full unit HP and movement restored.
- Each stage load resets fog of war to fully hidden.
- The final stage, when won, does not attempt to load a next stage.
