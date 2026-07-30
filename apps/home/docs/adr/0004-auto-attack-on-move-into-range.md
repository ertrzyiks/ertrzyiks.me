# Auto-attack on move into range

specs/03-player-input.md previously required an explicit click on an enemy hex to initiate every attack, even right after a move that landed a unit next to an eligible target. We decided a unit that moves adjacent to exactly one eligible enemy (with an attack action still available) always attacks it automatically — there's no way to move next to an unambiguous target and simply not attack. This trades a little player control for fewer required clicks; it only yields control back to a manual click when 2 or more enemies are eligible at once, since the choice is then genuinely ambiguous and only the player can resolve it.

## Considered Options

- Always require a manual click to attack, even after landing adjacent to a single target. Rejected: the player explicitly reported the extra click as friction once a move already puts a unit in an unambiguous attacking position.
