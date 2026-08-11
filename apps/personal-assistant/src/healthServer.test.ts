import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createHealthServer, type DashboardAuth } from "./healthServer.js";
import { createStore, type Store } from "./store.js";

const AUTH: DashboardAuth = { username: "admin", password: "secret" };

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("healthServer", () => {
  let server: Server | undefined;
  let store: Store | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
    store?.close();
    store = undefined;
  });

  async function listen(auth: DashboardAuth = AUTH): Promise<number> {
    store = createStore(":memory:");
    server = createHealthServer(store, auth);
    await new Promise<void>((resolve) => server?.listen(0, resolve));
    return (server?.address() as AddressInfo).port;
  }

  it("responds 200 with a status body on GET /health, unauthenticated", async () => {
    const port = await listen();

    const res = await fetch(`http://localhost:${port}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("responds 404 for any other path", async () => {
    const port = await listen();

    const res = await fetch(`http://localhost:${port}/other`);

    expect(res.status).toBe(404);
  });

  describe("GET /admin/status", () => {
    it("rejects a request with no Authorization header, with a WWW-Authenticate challenge", async () => {
      const port = await listen();

      const res = await fetch(`http://localhost:${port}/admin/status`);

      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe('Basic realm="personal-assistant"');
    });

    it("rejects mismatched credentials", async () => {
      const port = await listen();

      const res = await fetch(`http://localhost:${port}/admin/status`, {
        headers: { Authorization: basicAuthHeader("admin", "wrong") },
      });

      expect(res.status).toBe(401);
    });

    it("renders an HTML snapshot for matching credentials", async () => {
      const port = await listen();
      store?.insertQueuedEmail("email-1");
      store?.markEmailFailed("email-1", "boom");
      store?.insertQueuedEmail("email-2");

      const res = await fetch(`http://localhost:${port}/admin/status`, {
        headers: { Authorization: basicAuthHeader("admin", "secret") },
      });
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(body).toContain("queued");
      expect(body).toContain("failed");
      expect(body).toContain("email-1");
      expect(body).toContain("boom");
    });

    it("escapes HTML in error messages to prevent injection into the rendered page", async () => {
      const port = await listen();
      store?.insertQueuedEmail("email-1");
      store?.markEmailFailed("email-1", "<script>alert('boom')</script>");

      const res = await fetch(`http://localhost:${port}/admin/status`, {
        headers: { Authorization: basicAuthHeader("admin", "secret") },
      });
      const body = await res.text();

      expect(body).not.toContain("<script>alert");
      expect(body).toContain("&lt;script&gt;");
    });

    it("responds 500 (instead of crashing) when rendering the snapshot throws", async () => {
      store = createStore(":memory:");
      store.getStatusCounts = () => {
        throw new Error("db is on fire");
      };
      server = createHealthServer(store, AUTH);
      await new Promise<void>((resolve) => server?.listen(0, resolve));
      const port = (server?.address() as AddressInfo).port;

      const res = await fetch(`http://localhost:${port}/admin/status`, {
        headers: { Authorization: basicAuthHeader("admin", "secret") },
      });

      expect(res.status).toBe(500);
    });

    it("shows placeholder rows when there is no data yet", async () => {
      const port = await listen();

      const res = await fetch(`http://localhost:${port}/admin/status`, {
        headers: { Authorization: basicAuthHeader("admin", "secret") },
      });
      const body = await res.text();

      expect(body).toContain("No emails yet");
      expect(body).toContain("No failures");
    });
  });
});
