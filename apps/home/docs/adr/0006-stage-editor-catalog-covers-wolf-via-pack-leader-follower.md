# Stage-editor unit catalog covers "Wolf" via `PackLeader`/`PackFollower`, not a standalone entry

Issue #170's user stories (4) and Implementation Decisions list the stage editor's closed unit
catalog as seven entries: "Hero, PackLeader, PackFollower, Wolf, Wanderer, Bandit,
BanditCaptain". The shipped `UNIT_CATALOG` (`src/game/main/stage_editor/catalog.ts`) has six keys
— `Wolf` is not among them — because there is no standalone `Wolf` unit class anywhere in the
codebase to back such an entry. `units/wolf.ts` only exports `PackLeader` and `PackFollower`
(`Leader`/`Follower`-wrapped units); every hand-written stage (`main/stages/stage{1,2,3}.ts`)
spawns wolves exclusively as one of those two roles, and the unit-sprite atlas work (`assets_gen/`,
gh #192) already treats "wolf" as one shared texture for both — the AI-role distinction between
Leader and Follower isn't visual (see gh #187's Notes).

A stage author picking a unit for a spawn or roster is choosing an AI-relevant role (does this
wolf lead the pack's movement, or follow it?), and `PackLeader`/`PackFollower` is exactly that
choice. `PackLeader`/`PackFollower` are the wolf-pack roles the catalog exposes; there is no third,
role-less "Wolf" concept in the domain model for a catalog entry to name.

## Considered Options

- **Add a standalone `Wolf` catalog entry** — rejected: with no backing unit class, a `Wolf` key
  would have no `createUnitFromCatalog` factory to call — either it silently aliases to one of
  `PackLeader`/`PackFollower` (redundant with the keys that already exist) or it is dead-end
  busywork with nothing for an editor-placed unit to spawn as.
- **Leave #170's literal catalog list as the source of truth and treat the shipped catalog as a
  bug** — rejected: the fold is a deliberate, defensible consequence of the domain model (issue
  #187's shared-texture decision, `units/wolf.ts`'s two exported classes), not an oversight; #170's
  prose listing "Wolf" alongside the pack roles is the part that drifted from the implementation,
  not the other way around.

## Consequences

- The stage editor's unit picker (issue #170) exposes six catalog keys, not seven; a stage author
  reads `PackLeader`/`PackFollower` as covering every wolf a stage can place, with no separate
  "Wolf" option.
- If a non-pack, role-less wolf unit is ever introduced in code, it gets its own `UNIT_CATALOG`
  entry at that point — this ADR does not preclude that, it only resolves the gap between #170's
  prose and the catalog as shipped for the units that exist today.
