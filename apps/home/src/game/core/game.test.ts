import { describe, expect, test } from "vitest";
import { Game } from "./game";
import { Terrain, type Board } from "./board";
import { GameEventType } from "./game_event";
import { destinationReached, lastUnitDefeated } from "./conditions";
import { PlayerColor } from "./player/player";
import { Unit, Movable, Damageable, Damaging } from "./units";

const human = { id: "human", name: "H", color: PlayerColor.BLUE };

// A minimal Whirley-like hero: can move, has HP, can bite.
const Hero = Movable(Damageable(Damaging(Unit, 5), 10), 3);

// A single grass row: start -> mid -> village (the goal section).
function makeBoard(): Board {
  return {
    rows: 1,
    cols: 3,
    tiles: [
      { x: 0, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "start" },
      { x: 1, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "mid" },
      { x: 2, y: 0, type: Terrain.WATER, textureName: "grass", sectionName: "village" },
    ],
  };
}

function makeGame() {
  const game = new Game(makeBoard());
  game.setEndConditions({
    win: [destinationReached("human", ["village"])],
    lose: [lastUnitDefeated("human")],
  });
  return game;
}

describe("Game end conditions", () => {
  test("moving the player's unit onto the goal triggers a win", () => {
    const game = makeGame();
    game.spawnInSection(human, new Hero(), "start");
    const hero = game.world.getState().units[0].unit;
    const village = game.world.tileBySection("village").cube();

    game.world.dispatch({ type: GameEventType.Move, unit: hero, position: village });

    expect(game.world.getState().outcome).toBe("win");
  });

  test("the player's last unit dying triggers a lose", () => {
    const game = makeGame();
    game.spawnInSection(human, new Hero(), "start");
    const hero = game.world.getState().units[0].unit;
    const biter = new Hero();

    game.world.dispatch({
      type: GameEventType.TakeDamage,
      target: hero,
      inflictor: biter,
      damage: 999,
    });

    expect(game.world.getState().outcome).toBe("lose");
  });

  test("no gameplay actions are accepted after the game has ended", () => {
    const game = makeGame();
    game.spawnInSection(human, new Hero(), "start");
    const hero = game.world.getState().units[0].unit;
    const village = game.world.tileBySection("village").cube();
    const start = game.world.tileBySection("start").cube();

    game.world.dispatch({ type: GameEventType.Move, unit: hero, position: village });
    expect(game.world.getState().outcome).toBe("win");

    // Attempting to move back off the goal must be ignored in the terminal state.
    game.world.dispatch({ type: GameEventType.Move, unit: hero, position: start });
    const pos = game.world.getState().units[0].position;
    expect(pos).toEqual(village);
    expect(game.world.getState().outcome).toBe("win");
  });

  test("a bare Game (no conditions) never ends on its own", () => {
    const game = new Game(makeBoard());
    game.spawnInSection(human, new Hero(), "start");
    const hero = game.world.getState().units[0].unit;
    const village = game.world.tileBySection("village").cube();

    game.world.dispatch({ type: GameEventType.Move, unit: hero, position: village });

    expect(game.world.getState().outcome).toBe(null);
  });
});
