import { describe, expect, it } from "vitest";
import { loadLibraryWorkerConfig } from "./libraryConfig.js";

const REQUIRED_ENV = {
  REDIS_URL: "redis://localhost:6379",
  WBPG_USERNAME: "user",
  WBPG_PASSWORD: "pass",
  GOOGLE_CALENDAR_CLIENT_ID: "client-id",
  GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
  GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
};

describe("loadLibraryWorkerConfig", () => {
  it("applies sensible defaults for everything optional", () => {
    const config = loadLibraryWorkerConfig(REQUIRED_ENV);

    expect(config).toEqual({
      redisUrl: "redis://localhost:6379",
      databasePath: "/app/data/library.sqlite",
      wbpg: {
        baseUrl: undefined,
        accounts: [{ username: "user", password: "pass", label: undefined }],
      },
      googleCalendar: {
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        calendarId: undefined,
        timeZone: undefined,
      },
      refreshCronPattern: "0 7 * * *",
    });
  });

  it("honors overrides", () => {
    const config = loadLibraryWorkerConfig({
      ...REQUIRED_ENV,
      DATABASE_PATH: "./data/dev.sqlite",
      WBPG_BASE_URL: "https://staging.example.com",
      GOOGLE_CALENDAR_ID: "some-calendar-id",
      GOOGLE_CALENDAR_TIMEZONE: "UTC",
      LIBRARY_REFRESH_CRON_PATTERN: "*/15 * * * *",
    });

    expect(config.databasePath).toBe("./data/dev.sqlite");
    expect(config.wbpg.baseUrl).toBe("https://staging.example.com");
    expect(config.googleCalendar.calendarId).toBe("some-calendar-id");
    expect(config.googleCalendar.timeZone).toBe("UTC");
    expect(config.refreshCronPattern).toBe("*/15 * * * *");
  });

  it.each([
    "REDIS_URL",
    "WBPG_USERNAME",
    "WBPG_PASSWORD",
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
  ] as const)("throws a clear error when %s is missing", (key) => {
    const env = { ...REQUIRED_ENV };
    delete env[key as keyof typeof env];

    expect(() => loadLibraryWorkerConfig(env)).toThrow(key);
  });

  describe("the optional second library account", () => {
    it("adds it after the primary, both sharing the one catalog base URL", () => {
      const config = loadLibraryWorkerConfig({
        ...REQUIRED_ENV,
        WBPG_LABEL: "Ala",
        WBPG_SECONDARY_USERNAME: "other-user",
        WBPG_SECONDARY_PASSWORD: "other-pass",
        WBPG_SECONDARY_LABEL: "Ola",
      });

      expect(config.wbpg.accounts).toEqual([
        { username: "user", password: "pass", label: "Ala" },
        { username: "other-user", password: "other-pass", label: "Ola" },
      ]);
    });

    it("is left out entirely when neither of its credentials is set", () => {
      const config = loadLibraryWorkerConfig(REQUIRED_ENV);

      expect(config.wbpg.accounts).toHaveLength(1);
    });

    it("allows it without a label — the owner name is optional", () => {
      const config = loadLibraryWorkerConfig({
        ...REQUIRED_ENV,
        WBPG_SECONDARY_USERNAME: "other-user",
        WBPG_SECONDARY_PASSWORD: "other-pass",
      });

      expect(config.wbpg.accounts[1]).toEqual({
        username: "other-user",
        password: "other-pass",
        label: undefined,
      });
    });

    it.each(["WBPG_SECONDARY_USERNAME", "WBPG_SECONDARY_PASSWORD"] as const)(
      "throws when only %s is set — half a card is a misconfiguration, not a second account",
      (key) => {
        expect(() => loadLibraryWorkerConfig({ ...REQUIRED_ENV, [key]: "value" })).toThrow(
          "WBPG_SECONDARY_USERNAME and WBPG_SECONDARY_PASSWORD must be set together",
        );
      },
    );
  });
});
