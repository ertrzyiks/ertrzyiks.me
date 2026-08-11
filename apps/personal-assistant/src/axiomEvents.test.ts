import { describe, expect, it, vi } from "vitest";
import { createAxiomEventEmitter, noopEventEmitter } from "./axiomEvents.js";
import type { Logger } from "./logger.js";

// Axiom is a real remote service — nothing to talk to in CI/sandbox, so every test here injects
// a fake `fetch` via the `fetchImpl` seam rather than making a real HTTP call.

function jsonResponse(ok = true, status = 200): Response {
  return { ok, status, statusText: ok ? "OK" : "Error" } as Response;
}

function fakeLogger(): Logger & { errors: string[] } {
  const errors: string[] = [];
  return { errors, info: () => {}, warn: () => {}, error: (message) => errors.push(message) };
}

describe("createAxiomEventEmitter", () => {
  it("POSTs a single-element array with _time, service, entity, entityId, and status", () => {
    const fetchImpl = vi.fn(async () => jsonResponse());
    const emitter = createAxiomEventEmitter({
      token: "test-token",
      dataset: "personal-assistant-events",
      service: "personal-assistant",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    emitter.emit({ entity: "email", entityId: "email-1", status: "queued" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu-central-1.aws.edge.axiom.co/v1/ingest/personal-assistant-events");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(init.body));
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      service: "personal-assistant",
      entity: "email",
      entityId: "email-1",
      status: "queued",
    });
    expect(typeof body[0]._time).toBe("string");
    expect(new Date(body[0]._time).toString()).not.toBe("Invalid Date");
    expect(body[0]).not.toHaveProperty("error");
  });

  it("includes the error field when given one", () => {
    const fetchImpl = vi.fn(async () => jsonResponse());
    const emitter = createAxiomEventEmitter({
      token: "t",
      dataset: "d",
      service: "personal-assistant",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    emitter.emit({ entity: "email", entityId: "email-1", status: "failed", error: "boom" });

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body[0].error).toBe("boom");
  });

  it("logs (via the injected Logger) rather than throwing when the request rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const logger = fakeLogger();
    const emitter = createAxiomEventEmitter({
      token: "t",
      dataset: "d",
      service: "s",
      logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(() => emitter.emit({ entity: "e", entityId: "1", status: "active" })).not.toThrow();

    await vi.waitFor(() => expect(logger.errors.length).toBeGreaterThan(0));
    expect(logger.errors[0]).toContain("network down");
  });

  it("logs (without throwing) when Axiom responds with a non-2xx status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(false, 401));
    const logger = fakeLogger();
    const emitter = createAxiomEventEmitter({
      token: "t",
      dataset: "d",
      service: "s",
      logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    emitter.emit({ entity: "e", entityId: "1", status: "active" });

    await vi.waitFor(() => expect(logger.errors.some((m) => m.includes("401"))).toBe(true));
  });

  it("doesn't throw when no logger is given — defaults to a no-op", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(false, 500));
    const emitter = createAxiomEventEmitter({
      token: "t",
      dataset: "d",
      service: "s",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(() => emitter.emit({ entity: "e", entityId: "1", status: "active" })).not.toThrow();
  });
});

describe("noopEventEmitter", () => {
  it("does nothing", () => {
    expect(() => noopEventEmitter.emit({ entity: "e", entityId: "1", status: "active" })).not.toThrow();
  });
});
