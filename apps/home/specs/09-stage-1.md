# Stage 1 — The Wreck

## Topic Statement

Stage 1 introduces pack behavior wolves and fog of war on a coastal forest map where Whirley must reach the village to find a ship repairman.

## Setting

A rocky beach at dusk. Whirley's ship is wedged between two rocks. The village is visible through the trees. So are the wolves. The Wanderer — the most wanted criminal on the island, though Whirley has never heard of them — is hiding somewhere in the forest.

## Starting Conditions

- Whirley spawns at the beach section on the left side of the map.
- One Wolf Pack Leader spawns mid-forest.
- Two Wolf Pack Followers spawn adjacent to the Pack Leader.
- The Wanderer spawns deeper in the forest, away from Whirley's starting position.
- All tiles start hidden under fog of war.

## Win Condition

Whirley reaches the village section at the far edge of the map.

## Lose Condition

Whirley is reduced to zero hit points.

## Narrative Script

| Trigger | Speaker | Text |
|---------|---------|------|
| Turn 1 start | Whirley | "If I find a repairman by noon I only lose two days. The forest doesn't look that big." |
| Whirley moves within sight range of the Wanderer | Narrator | "A figure darts between the trees ahead of you. Fast. Panicked. Gone." |
| Whirley reaches village | Villager | "Did you just walk through the Howling Forest? Alone? And you flushed out the Wanderer?!" |
| Whirley reaches village | Whirley | "I need a repairman. Is there a gate around here?" |
| Whirley is defeated | Narrator | "The wolves bring you down well short of the village. The ship will be stuck a while longer." |

## Stage Characteristics

- The wolf pack moves as a unit: the Pack Leader wanders, followers trail. The wolves do not target Whirley.
- Whirley can walk past the pack by timing movement around the leader's path, or fight through if cornered.
- The Wanderer flees whenever Whirley's movement brings them within sight range. The Wanderer cannot be attacked.
- Whirley reaching sight range of the Wanderer is enough to trigger the narrative beat and the village reaction — no pursuit required.
- The map has enough width to offer routes around the wolf pack.

## Acceptance Criteria

- The stage loads with Whirley at the beach, one Pack Leader, two Pack Followers, and the Wanderer in the forest.
- Pack Followers move toward the Pack Leader each turn, not toward Whirley.
- The Wanderer moves away from Whirley whenever he is within sight range.
- Defeating the Pack Leader causes followers to move randomly rather than toward the leader.
- Whirley reaching the village tile triggers the village narrative and ends the stage in a win.
- Whirley's death triggers the defeat narrative and reloads the stage.
