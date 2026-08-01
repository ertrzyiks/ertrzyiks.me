# Game Specifications

## Project Goal

A playable single-player hex-grid tactical game embedded in a personal website. The player controls a Hero unit on a turn-based board, navigating toward objectives and engaging enemies, driven by scenario scripts that deliver story events and dialog. Each scenario defines its own win condition, starting layout, and narrative beats.

## Scope

These specifications cover the behavioral contracts of all game systems. Implementation decisions (data structures, class names, libraries) are left to Ralph.

## Spec Files

| File | Topic |
|------|-------|
| 01-turn-system.md | Turn cycle: player order, start/end lifecycle |
| 02-movement-system.md | Movement budget, step cost, bounds enforcement |
| 03-player-input.md | Click-to-move hex navigation by human player |
| 04-combat-system.md | Attack, damage, and unit death |
| 05-win-lose-conditions.md | Scenario-driven end conditions |
| 06-enemy-ai.md | Enemy behavior types: pack, seeker, flee |
| 07-narrative-events.md | Scripted dialog and events triggered by game state |
| 08-stage-system.md | Stage loading, sequencing, and reset on win/lose |
| 09-stage-1.md | Stage 1 "The Wreck" — beach to village through wolf forest |
| 10-stage-2.md | Stage 2 "The Gate" — village entrance blocked by bandits |
| 11-stage-3.md | Stage 3 "Let's Be Reasonable" — bandit camp negotiation |
| 12-unit-health-display.md | Health indicator above each unit's sprite, color-coded by remaining HP |
