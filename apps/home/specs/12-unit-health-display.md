# Unit Health Display

## Topic Statement

Every unit that can take damage displays its current health status above its sprite, color-coded by remaining-health severity.

## Scope

**In scope:** Presence and positioning of the health indicator, color-coding thresholds, when it updates.

**Boundaries:** How damage is calculated and applied (combat system spec). Unit death and removal from the board (combat system spec). Visual style details beyond color-coding (implementation's discretion).

## Behaviors

### Display

- Any unit that can take damage shows a health indicator positioned above its sprite.
- A unit that cannot take damage (no Damageable behavior) shows no health indicator.
- The indicator reflects the unit's current HP as a fraction of its maximum HP.

### Color Coding

- Above half of max HP: green.
- Above a fifth of max HP but at or below half: yellow.
- At or below a fifth of max HP: red.

### Updates

- The indicator updates immediately whenever the unit takes damage.
- The indicator updates when the unit's HP is restored (e.g. turn-start replenishment, if the unit's type supports it).
- A unit at 0 HP shows the indicator with no fill (just the empty track) until removed from the board on death.

## Acceptance Criteria

- A full-health unit's indicator reads green.
- A unit reduced below half HP but above a fifth shows yellow.
- A unit reduced to a fifth of HP or below shows red.
- Taking damage updates the indicator on the same frame the damage is applied, without requiring any other action.
- A unit with no Damageable behavior renders with no health indicator.
