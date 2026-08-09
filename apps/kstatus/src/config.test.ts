import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("applies sensible defaults when nothing is set", () => {
    const config = loadConfig({});

    expect(config).toEqual({
      databasePath: "/app/data/kstatus.sqlite",
      port: 3000,
      adminBasicAuth: null,
    });
  });

  it("honors overrides for database path and port", () => {
    const config = loadConfig({ DATABASE_PATH: "./data/dev.sqlite", PORT: "4000" });

    expect(config.databasePath).toBe("./data/dev.sqlite");
    expect(config.port).toBe(4000);
  });

  it("builds adminBasicAuth once both credentials are set", () => {
    const config = loadConfig({
      KSTATUS_ADMIN_BASIC_AUTH_USERNAME: "admin",
      KSTATUS_ADMIN_BASIC_AUTH_PASSWORD: "secret",
    });

    expect(config.adminBasicAuth).toEqual({ username: "admin", password: "secret" });
  });

  it("leaves adminBasicAuth null when neither credential is set", () => {
    expect(loadConfig({}).adminBasicAuth).toBeNull();
  });

  it.each([
    ["KSTATUS_ADMIN_BASIC_AUTH_USERNAME"],
    ["KSTATUS_ADMIN_BASIC_AUTH_PASSWORD"],
  ] as const)("throws when only %s is set", (key) => {
    expect(() => loadConfig({ [key]: "only-one" })).toThrow(
      "KSTATUS_ADMIN_BASIC_AUTH_USERNAME and KSTATUS_ADMIN_BASIC_AUTH_PASSWORD must both be set, or both left unset",
    );
  });
});
