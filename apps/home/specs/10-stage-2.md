# Stage 2 — The Gate

## Topic Statement

Stage 2 introduces seeker bandit enemies outside a village gate where Whirley must reach the entrance while bandits patrol the road and mistake him for one of their own.

## Setting

The village outskirts. A wooden gate is visible at the far end of a dusty road. Villagers peer over the wall, suspicious. Three bandits patrol between Whirley and the gate. The Wanderer is loitering near the gate wall, doing their best to look inconspicuous.

## Starting Conditions

- Whirley spawns at the road entrance, outside the village, on the far side from the gate.
- Three Bandit units spawn between Whirley and the gate, patrolling the road.
- The Wanderer spawns near the gate wall, on the same side as the bandits.
- All tiles start hidden under fog of war.

## Win Condition

Whirley reaches the gate section.

## Lose Condition

Whirley is reduced to zero hit points.

## Narrative Script

| Trigger | Speaker | Text |
|---------|---------|------|
| Turn 1 start | Villager (from wall) | "Halt! State your business, stranger. Are you with the bandits?" |
| Turn 1 start | Whirley | "What? No! My ship is stuck. I need a repairman." |
| Turn 1 start | Villager | "That's exactly what a bandit would say." |
| Turn 3 start | Narrator | "The bandits, noticing Whirley, begin to close in. The Wanderer notices the commotion and edges toward the gate." |
| Turn 3 start | Whirley | "Oh, come ON." |
| Whirley moves within sight range of the Wanderer | Narrator | "The Wanderer sees you and bolts along the wall." |
| Whirley reaches gate | Villager | "He drove off the bandits AND the Wanderer ran from him! Open the gate! Open the gate!" |
| Whirley reaches gate | Whirley | "I wasn't driving anyone — can someone please just open the gate?" |
| Whirley is defeated | Narrator | "The bandits overwhelm you just short of the gate. The villagers close the shutters." |

## Stage Characteristics

- Bandits use seeker behavior: each moves toward Whirley independently each turn.
- Bandits have higher HP and deal more damage per attack than wolves.
- The Wanderer uses flee behavior and moves away from Whirley whenever he is within sight range.
- The Wanderer cannot be attacked.
- Whirley does not need to defeat all bandits; he only needs to reach the gate. Combat is one possible path through.

## Acceptance Criteria

- The stage loads with Whirley at the road entrance, three Bandits between him and the gate, and the Wanderer near the gate wall.
- Each bandit moves toward Whirley independently each turn and attacks when adjacent.
- The Wanderer moves away from Whirley when within sight range and does not attack.
- Turn 3 narrative fires once at the start of Turn 3.
- Whirley reaching the gate tile triggers the gate narrative and ends the stage in a win.
- Whirley's death triggers the defeat narrative and reloads the stage.
- Bandits have measurably higher HP and damage values than wolves.
