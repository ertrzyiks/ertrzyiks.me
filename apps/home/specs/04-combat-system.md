# Combat System

## Topic Statement

The combat system resolves attacks between units, applies damage, and removes defeated units from the board.

## Scope

**In scope:** Attack initiation, damage application, unit death, death side effects (removal from board, event emission).

**Boundaries:** What triggers an attack — including auto-attack on move (player input spec, ADR-0004) — and enemy AI's own attack decisions (enemy AI spec). Visual animations for combat are out of scope here, except the attack-target highlight, which is player input's concern (spec 03).

## Behaviors

### Attack Eligibility

- A unit can attack if it has at least one attack action remaining for this turn.
- Each unit has a fixed number of attack actions per turn (typically 1).
- Used attack actions are not restored mid-turn; they replenish at turn start.
- A unit can only attack units belonging to an opposing player.

### Damage Calculation

- The attacker deals a fixed damage value defined by its unit type.
- The defender's HP is reduced by that damage value.
- Damage is applied immediately and atomically.

### Unit Death

- A unit whose HP reaches zero or below is considered dead.
- A dead unit is immediately removed from the board.
- A dead unit can no longer act, receive actions, or block movement.
- Removal is observable by external systems (scenario scripts, win/lose check, renderer).

### Attack Action Cost

- A successful attack consumes one attack action from the attacker.
- A unit that has used all its attack actions this turn cannot attack again until turn start.

### Counter-attack

- There is no automatic counter-attack. Only the initiating unit deals damage.

## Acceptance Criteria

- An attack reduces the defender's HP by the attacker's damage value.
- A unit at 0 HP is removed from the board after the attack.
- A unit cannot attack the same turn after exhausting its attack actions.
- A unit cannot attack a friendly unit.
- After turn start, attack actions are fully restored.

## Notable Behavior

- HP can go below zero (e.g., overkill damage) — death triggers at ≤ 0, not exactly 0.
