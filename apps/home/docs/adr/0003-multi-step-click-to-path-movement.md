# Multi-step click-to-path movement

specs/03-player-input.md originally scoped out multi-step pathfinding, so the move highlight only showed the single ring of adjacent hexes and a click only moved a unit one step. Players found this confusing when a unit's movement budget allowed further travel (e.g. a Hero with budget 3) but the board never showed where it could actually end up. We're reversing that scope decision: the highlight now shows the full move range (every hex reachable within the remaining budget), and clicking any highlighted hex — adjacent or not — moves the unit there directly in one action, spending the needed budget along the way.

## Considered Options

- Keep the highlight widened to the full move range but require one click per step to actually reach a far hex. Rejected: a highlight that shows a hex the player can't click into feels broken rather than informative.
