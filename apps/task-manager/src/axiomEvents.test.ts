import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAxiomEventEmitter, noopEventEmitter } from "./axiomEvents.js";

// Axiom is a real remote service — nothing to talk to in CI/sandbox, so every test here injects
// a fake `fetch` via the `fetchImpl` seam rather than making a real HTTP call (mirrors
// lmStudio.test.ts).

function jsonResponse(ok = true, status = 200): Response {
  return { ok, status, statusText: ok ? "OK" : "Error" } as Response;
}

describe("createAxiomEventEmitter", () => {
  it("POSTs a single-element array with _time, service, entity, entityId, and status", () => {
    const fetchImpl = vi.fn(async () => jsonResponse());
    const emitter = createAxiomEventEmitter({
      token: "test-token",
      dataset: "task-manager-events",
      service: "task-manager",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    emitter.emit({ entity: "extract-action-items", entityId: "email-1", status: "active" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.eu.axiom.co/v1/ingest/task-manager-events");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(init.body));
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      service: "task-manager",
      entity: "extract-action-items",
      entityId: "email-1",
      status: "active",
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
      service: "task-manager",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    emitter.emit({ entity: "sync-google-tasks", entityId: "1", status: "failed", error: "boom" });

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body[0].error).toBe("boom");
  });

  it("respects a custom domain override", () => {
    const fetchImpl = vi.fn(async () => jsonResponse());
    const emitter = createAxiomEventEmitter({
      token: "t",
      dataset: "d",
      service: "s",
      domain: "eu.axiom.co",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    emitter.emit({ entity: "e", entityId: "1", status: "completed" });

    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://eu.axiom.co/v1/ingest/d");
  });

  describe("failure handling — never throws, only logs", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("does not throw synchronously, and logs when the request rejects", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error("network down");
      });
      const emitter = createAxiomEventEmitter({
        token: "t",
        dataset: "d",
        service: "s",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      expect(() => emitter.emit({ entity: "e", entityId: "1", status: "active" })).not.toThrow();

      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    });

    it("logs (without throwing) when Axiom responds with a non-2xx status", async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(false, 401));
      const emitter = createAxiomEventEmitter({
        token: "t",
        dataset: "d",
        service: "s",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      emitter.emit({ entity: "e", entityId: "1", status: "active" });

      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("401")));
    });
  });
});

describe("noopEventEmitter", () => {
  it("does nothing", () => {
    expect(() => noopEventEmitter.emit({ entity: "e", entityId: "1", status: "active" })).not.toThrow();
  });
});
