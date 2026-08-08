import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const VALID_ENV = {
  GMAIL_CLIENT_ID: "client-id",
  GMAIL_CLIENT_SECRET: "client-secret",
  GMAIL_REFRESH_TOKEN: "refresh-token",
  JOBS_API_BASE_URL: "http://localhost:3000",
  JOBS_API_BEARER_TOKEN: "bearer-token",
  PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_USERNAME: "admin",
  PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_PASSWORD: "dashboard-secret",
};

describe("loadConfig", () => {
  it("reads required values and applies sensible defaults", () => {
    const config = loadConfig(VALID_ENV);

    expect(config).toEqual({
      gmail: {
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        maxResults: 50,
      },
      jobsApi: {
        baseUrl: "http://localhost:3000",
        bearerToken: "bearer-token",
      },
      databasePath: "/app/data/personal-assistant.sqlite",
      pollIntervalMs: 5 * 60 * 1000,
      dashboardBasicAuth: {
        username: "admin",
        password: "dashboard-secret",
      },
    });
  });

  it("honors overrides for database path, poll interval and gmail page size", () => {
    const config = loadConfig({
      ...VALID_ENV,
      DATABASE_PATH: "./data/dev.sqlite",
      POLL_INTERVAL_MS: "1000",
      GMAIL_MAX_RESULTS: "10",
    });

    expect(config.databasePath).toBe("./data/dev.sqlite");
    expect(config.pollIntervalMs).toBe(1000);
    expect(config.gmail.maxResults).toBe(10);
  });

  it.each([
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REFRESH_TOKEN",
    "JOBS_API_BASE_URL",
    "JOBS_API_BEARER_TOKEN",
    "PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_USERNAME",
    "PERSONAL_ASSISTANT_DASHBOARD_BASIC_AUTH_PASSWORD",
  ])("throws when %s is missing", (key) => {
    const env = { ...VALID_ENV };
    delete (env as Record<string, string | undefined>)[key];

    expect(() => loadConfig(env)).toThrow(`${key} is required`);
  });
});
