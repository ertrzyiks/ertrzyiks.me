# Movement System

## Topic Statement

The movement system governs how units consume and replenish a per-turn movement budget when traversing hex tiles.

## Scope

**In scope:** Movement budget, step cost, budget replenishment, boundary enforcement, occupied-tile enforcement.

**Boundaries:** How the player selects a destination (player input spec). How enemies choose to move (enemy AI spec). Visual animation of movement (rendering layer).

## Behaviors

### Movement Budget

- Each movable unit has a maximum movement budget defined by its type.
- At the start of its owner's turn, a unit's movement budget is fully restored to its maximum.
- A unit with a zero movement budget cannot move.
- Attempting to move a unit with a zero budget has no effect.

### Step Cost

- Moving one hex costs 1 movement point by default.
- Each step reduces the unit's remaining movement budget by the step cost.
- A unit cannot take a step that would reduce its budget below zero.

### Valid Destinations

- A unit may only move to an adjacent hex (one step at a time).
- A hex is invalid if it lies outside the board boundaries.
- A hex is invalid if it is already occupied by another unit.
- Moving to an invalid hex has no effect.

### Multi-Step Movement

- A unit may move multiple times in one turn as long as its budget allows.
- Each step is resolved individually and must be valid at the time it is taken.

### Budget Replenishment

- Replenishment happens exactly once per turn per unit, at turn start.
- Replenishment restores the budget to the unit's maximum, regardless of remaining budget.
- Units that are not alive at turn start are not replenished.

## Acceptance Criteria

- A unit with budget 3 can move up to 3 hexes per turn and no more.
- A unit with budget 0 cannot move regardless of available adjacent hexes.
- A unit cannot move outside the board grid.
- A unit cannot move onto a hex occupied by another unit.
- After EndTurn and StartTurn, the unit's budget is fully restored.
