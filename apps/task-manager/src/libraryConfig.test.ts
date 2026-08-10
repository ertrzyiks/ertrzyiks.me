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
      wbpg: { baseUrl: undefined, username: "user", password: "pass" },
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
});
