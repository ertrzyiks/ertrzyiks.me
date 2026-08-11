import { afterEach, describe, expect, it, vi } from "vitest";

// @sentry/node is mocked rather than exercised for real — this only asserts *this package's*
// wiring (init is skipped when unset, forwarded correctly when set), not the SDK's own behavior.
vi.mock("@sentry/node", () => ({ init: vi.fn() }));

describe("initSentry", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("does not initialize Sentry when dsn is unset", async () => {
    const { initSentry, Sentry } = await import("./sentry.js");

    initSentry(undefined);

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initializes Sentry with the given dsn, no tracing, and a production default environment", async () => {
    delete process.env.SENTRY_ENVIRONMENT;
    const { initSentry, Sentry } = await import("./sentry.js");

    initSentry("https://example@o0.ingest.sentry.io/1");

    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: "https://example@o0.ingest.sentry.io/1",
      tracesSampleRate: 0,
      environment: "production",
    });
  });

  it("honors SENTRY_ENVIRONMENT when set", async () => {
    vi.stubEnv("SENTRY_ENVIRONMENT", "staging");
    const { initSentry, Sentry } = await import("./sentry.js");

    initSentry("https://example@o0.ingest.sentry.io/1");

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "staging" }),
    );
  });
});
