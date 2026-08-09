import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createStore, type Store } from "./store.js";

const NOW = "2026-08-09T12:00";
const CREDS = { username: "admin", password: "secret" };

function basicHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("app", () => {
  let store: Store;

  beforeEach(() => {
    store = createStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("GET / (public status page)", () => {
    it("renders events with no Authorization header required, even when admin auth is configured", async () => {
      store.createEvent({
        type: "warning",
        title: "Elevated latency",
        startsAt: "2026-08-09T09:00",
      });
      const app = createApp(store, CREDS, () => NOW);

      const response = await app.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("Elevated latency");
    });
  });

  describe("admin auth gating", () => {
    it("allows /admin with no Authorization header when adminBasicAuth is null (dev)", async () => {
      const app = createApp(store, null, () => NOW);

      const response = await app.inject({ method: "GET", url: "/admin" });

      expect(response.statusCode).toBe(200);
    });

    it("rejects /admin with 401 + WWW-Authenticate when configured and no header is sent", async () => {
      const app = createApp(store, CREDS, () => NOW);

      const response = await app.inject({ method: "GET", url: "/admin" });

      expect(response.statusCode).toBe(401);
      expect(response.headers["www-authenticate"]).toContain("Basic");
    });

    it("rejects /admin with wrong credentials", async () => {
      const app = createApp(store, CREDS, () => NOW);

      const response = await app.inject({
        method: "GET",
        url: "/admin",
        headers: { authorization: basicHeader("admin", "wrong") },
      });

      expect(response.statusCode).toBe(401);
    });

    it("allows /admin with correct credentials", async () => {
      const app = createApp(store, CREDS, () => NOW);

      const response = await app.inject({
        method: "GET",
        url: "/admin",
        headers: { authorization: basicHeader("admin", "secret") },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /admin", () => {
    let app: FastifyInstance;

    beforeEach(() => {
      app = createApp(store, null, () => NOW);
    });

    it("lists events from the last 2 days with an Edit link", async () => {
      const event = store.createEvent({
        type: "warning",
        title: "Today's warning",
        startsAt: "2026-08-09T09:00",
      });

      const response = await app.inject({ method: "GET", url: "/admin" });

      expect(response.body).toContain("Today&#39;s warning");
      expect(response.body).toContain(`/admin/events/${event.id}/edit`);
    });

    it("omits events older than 2 days that have no open downtime", async () => {
      store.createEvent({ type: "warning", title: "Ancient", startsAt: "2026-08-01T09:00" });

      const response = await app.inject({ method: "GET", url: "/admin" });

      expect(response.body).not.toContain("Ancient");
    });
  });

  describe("POST /admin/events", () => {
    let app: FastifyInstance;

    beforeEach(() => {
      app = createApp(store, null, () => NOW);
    });

    it("creates a warning event and redirects to /admin", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/events",
        payload: { type: "warning", title: "New warning", startsAt: "2026-08-09T10:00" },
      });

      expect(response.statusCode).toBe(303);
      expect(response.headers.location).toBe("/admin");
      expect(store.listEvents()).toHaveLength(1);
      expect(store.listEvents()[0]).toMatchObject({ type: "warning", title: "New warning" });
    });

    it("creates a downtime event with an end time", async () => {
      await app.inject({
        method: "POST",
        url: "/admin/events",
        payload: {
          type: "downtime",
          title: "DB outage",
          description: "Primary unreachable",
          startsAt: "2026-08-09T10:00",
          endsAt: "2026-08-09T10:45",
        },
      });

      expect(store.listEvents()[0]).toMatchObject({
        type: "downtime",
        description: "Primary unreachable",
        endsAt: "2026-08-09T10:45",
      });
    });

    it("creates an ongoing downtime when endsAt is left blank", async () => {
      await app.inject({
        method: "POST",
        url: "/admin/events",
        payload: { type: "downtime", title: "DB outage", startsAt: "2026-08-09T10:00" },
      });

      expect(store.listEvents()[0]).toMatchObject({ endsAt: null });
    });

    it("rejects a missing title with 400 and does not create anything", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/events",
        payload: { type: "warning", title: "  ", startsAt: "2026-08-09T10:00" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("Title is required");
      expect(store.listEvents()).toEqual([]);
    });

    it("rejects an end time before the start time", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/events",
        payload: {
          type: "downtime",
          title: "DB outage",
          startsAt: "2026-08-09T10:00",
          endsAt: "2026-08-09T09:00",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("End time must be after the start time");
      expect(store.listEvents()).toEqual([]);
    });

    it("drops a stray endsAt submitted alongside type=warning", async () => {
      await app.inject({
        method: "POST",
        url: "/admin/events",
        payload: {
          type: "warning",
          title: "Just a warning",
          startsAt: "2026-08-09T10:00",
          endsAt: "2026-08-09T11:00",
        },
      });

      expect(store.listEvents()[0]).toMatchObject({ endsAt: null });
    });
  });

  describe("GET /admin/events/:id/edit", () => {
    let app: FastifyInstance;

    beforeEach(() => {
      app = createApp(store, null, () => NOW);
    });

    it("renders the event's current values", async () => {
      const event = store.createEvent({
        type: "downtime",
        title: "DB outage",
        startsAt: "2026-08-09T10:00",
      });

      const response = await app.inject({ method: "GET", url: `/admin/events/${event.id}/edit` });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("DB outage");
    });

    it("404s for an unknown id", async () => {
      const response = await app.inject({ method: "GET", url: "/admin/events/999/edit" });
      expect(response.statusCode).toBe(404);
    });

    it("404s for a non-numeric id", async () => {
      const response = await app.inject({ method: "GET", url: "/admin/events/not-a-number/edit" });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /admin/events/:id/edit", () => {
    let app: FastifyInstance;

    beforeEach(() => {
      app = createApp(store, null, () => NOW);
    });

    it("updates the event and redirects to /admin", async () => {
      const event = store.createEvent({
        type: "downtime",
        title: "DB outage",
        startsAt: "2026-08-09T10:00",
      });

      const response = await app.inject({
        method: "POST",
        url: `/admin/events/${event.id}/edit`,
        payload: {
          type: "downtime",
          title: "DB outage",
          description: "Resolved",
          startsAt: "2026-08-09T10:00",
          endsAt: "2026-08-09T11:15",
        },
      });

      expect(response.statusCode).toBe(303);
      expect(response.headers.location).toBe("/admin");
      expect(store.getEvent(event.id)).toMatchObject({
        description: "Resolved",
        endsAt: "2026-08-09T11:15",
      });
    });

    it("404s for an unknown id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/events/999/edit",
        payload: { type: "warning", title: "x", startsAt: "2026-08-09T10:00" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("re-renders the form with a 400 on invalid input, leaving the event unchanged", async () => {
      const event = store.createEvent({
        type: "warning",
        title: "Original",
        startsAt: "2026-08-09T10:00",
      });

      const response = await app.inject({
        method: "POST",
        url: `/admin/events/${event.id}/edit`,
        payload: { type: "warning", title: "", startsAt: "2026-08-09T10:00" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain("Title is required");
      expect(store.getEvent(event.id)!.title).toBe("Original");
    });
  });
});
