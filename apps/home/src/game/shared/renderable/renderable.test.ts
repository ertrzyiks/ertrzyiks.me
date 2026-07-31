import { describe, expect, test } from "vitest";
import { Unit } from "../../core/units";
import { Renderable } from "./renderable";

describe("Renderable", () => {
  test("sets textureName to the value fixed at mixin-application time", () => {
    const Hero = Renderable(Unit, "hero");
    expect(new Hero().textureName).toBe("hero");
  });

  test("gives each concrete unit type its own textureName", () => {
    const Wolf = Renderable(Unit, "wolf");
    const Bandit = Renderable(Unit, "bandit");
    expect(new Wolf().textureName).toBe("wolf");
    expect(new Bandit().textureName).toBe("bandit");
  });

  test("does not affect the base Unit's own fields (e.g. a fresh id per instance)", () => {
    const Hero = Renderable(Unit, "hero");
    expect(new Hero().id).not.toBe(new Hero().id);
  });
});
