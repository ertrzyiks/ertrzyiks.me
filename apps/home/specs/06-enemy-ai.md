# Enemy AI

## Topic Statement

The enemy AI system drives CPU-controlled units using one of three behavior types — pack, seeker, or flee — each determining how a unit moves and acts during the CPU turn.

## Scope

**In scope:** Pack behavior (wolves), seeker behavior (bandits), flee behavior (the Wanderer NPC), turn-level action selection, attack decision.

**Boundaries:** Turn sequencing (turn system spec). Combat resolution (combat system spec). Movement validity (movement system spec).

## Behaviors

### Pack Behavior (Wolves)

A wolf pack consists of exactly one Pack Leader and one or more Pack Followers.

#### Pack Leader

- On its turn, the Pack Leader moves in a random valid direction, avoiding the hex it just came from unless no other valid direction exists.
- The Pack Leader does not target the player unit.
- The Pack Leader attacks any adjacent non-wolf unit at the end of its move.

#### Pack Follower

- On its turn, a Pack Follower moves one step toward the Pack Leader's current position using the shortest hex path.
- If the Pack Follower is already adjacent to the Pack Leader, it does not move.
- If the shortest path is blocked, the follower chooses the valid direction that most reduces distance to the Pack Leader.
- A Pack Follower attacks any adjacent non-wolf unit at the end of its move.

#### Pack Dissolution

- When the Pack Leader is defeated, all Pack Followers immediately switch to wanderer behavior: each moves in a random valid direction each turn and no longer coordinates with other wolves.
- Dissolved followers retain their attack on adjacency.

### Seeker Behavior (Bandits)

- On its turn, the bandit unit moves toward the nearest player unit by shortest hex distance.
- If multiple directions equally reduce distance, one is chosen arbitrarily.
- If already adjacent to the player unit, the bandit does not move; it attacks instead.
- Each bandit acts independently; there is no coordination between bandits.
- A bandit attacks only if it has an attack action remaining for the turn.

### Flee Behavior (The Wanderer)

- On its turn, the Wanderer moves in the direction that maximizes distance from the nearest player unit.
- The Wanderer does not attack under any circumstances.
- If no valid move increases distance from the player, the Wanderer stays in place.
- The Wanderer is not a combat unit and cannot be targeted by player attacks.

## Action Resolution

- Enemy actions resolve one unit at a time within the CPU turn.
- Wolf pack units act in order: Pack Leader first, then each Pack Follower.
- Bandit units act in registration order.
- The Wanderer acts last in the CPU turn.
- All enemy units finish acting before the CPU player dispatches EndTurn.

## Bounds and Obstacle Avoidance

- All behavior types respect board boundaries and occupied tiles when choosing a direction.
- If no valid move exists, the unit skips its move.

## Acceptance Criteria

- Pack Followers move toward the Pack Leader each turn, not toward the player.
- When the Pack Leader is defeated, followers move randomly rather than toward the old leader position.
- A bandit moves toward the player unit each turn and attacks when adjacent.
- The Wanderer moves away from the player each turn and never attacks.
- CPU turn ends after all enemy units have acted.
- Wolf pack units act before bandit units within a mixed-enemy turn.
