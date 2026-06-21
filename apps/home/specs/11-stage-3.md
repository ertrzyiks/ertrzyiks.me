# Stage 3 — Let's Be Reasonable

## Topic Statement

Stage 3 resolves the story by sending Whirley to the bandit camp to negotiate, where he accidentally corners the Wanderer while defending himself against bandits and is mistaken for a legendary hero.

## Setting

A rough bandit camp outside the village. Tents, a campfire, a surly Bandit Captain in the middle. Three bandits guard the perimeter. The Wanderer is doing odd jobs near the back of the camp, hoping nobody notices them. The Sheriff is watching from a distance, waiting to see how this plays out.

## Starting Conditions

- Whirley spawns at the camp entrance on the near side of the map.
- One Bandit Captain spawns at the center of the camp (higher HP and damage than standard bandits, seeker behavior).
- Three standard Bandit units spawn between Whirley and the Captain.
- The Wanderer spawns at the far edge of the camp with no exit route — surrounded by tents on three sides, one open direction toward Whirley.
- All tiles start hidden under fog of war.

## Unit Specifications

### Bandit Captain

- Hit points: higher than a standard bandit.
- Damage per attack: higher than a standard bandit.
- Behavior: seeker — moves toward Whirley and attacks when adjacent.
- Visual distinction from standard bandits.

## Win Condition

Whirley reaches the campfire section at the center of the camp.

## Lose Condition

Whirley is reduced to zero hit points.

## Narrative Script

| Trigger | Speaker | Text |
|---------|---------|------|
| Turn 1 start | Whirley | "Adults can resolve things peacefully. I'll walk in, explain the situation, and we'll all be home by dinner." |
| Turn 1 start | Bandit Captain | "CHARGE!" |
| Turn 1 start | Whirley | "WAIT — does anyone here know a ship repairman?!" |
| Turn 4 start | Narrator | "Whirley is making progress, mostly by accident." |
| Bandit Captain defeated | Whirley | "Look, I'm sure we can still talk about—" |
| Bandit Captain defeated | Narrator | "The Captain is not available for talking." |
| Whirley moves within sight range of the Wanderer | Narrator | "The Wanderer sees you coming. They look left. They look right. There is nowhere to go." |
| Whirley reaches campfire | Narrator | "The bandits are defeated. The Wanderer is cornered by a tent. The Sheriff steps out from behind a rock." |
| Whirley reaches campfire | Sheriff | "You... you caught the Wanderer. You defeated the bandits. You are the greatest hero this island has ever seen." |
| Whirley reaches campfire | Whirley | "I just want my ship fixed." |
| Whirley reaches campfire | Narrator | "Three weeks later, a ballad called 'Whirley of the Shore' is being sung in every tavern on the island. Whirley's ship is fixed. He leaves on a Tuesday. Nobody notices." |
| Whirley is defeated | Narrator | "The bandits overwhelm you. The Wanderer watches from the tent, bewildered." |

## Stage Characteristics

- The Wanderer is placed in a near-cornered position so that Whirley's natural path toward the campfire brings them into sight range.
- The Wanderer uses flee behavior but has limited escape routes, making the "accidental cornering" inevitable.
- Standard bandits use seeker behavior and engage Whirley before the Captain.
- The Bandit Captain engages only after standard bandits have been dealt with or have closed distance.
- This is the final stage; winning triggers the game's completed state with no further stage loads.

## Acceptance Criteria

- The stage loads with Whirley at the entrance, three standard Bandits, one Bandit Captain, and the Wanderer at the far edge of the camp.
- The Bandit Captain has measurably higher HP and damage than standard bandits.
- The Wanderer moves away from Whirley when in sight range but is positioned such that Whirley's advance naturally corners them.
- The Wanderer cannot be attacked.
- Whirley reaching the campfire tile triggers the final narrative sequence and ends the game in a completed state.
- No further stage loads after the campfire is reached.
- Whirley's death triggers the defeat narrative and reloads Stage 3.
