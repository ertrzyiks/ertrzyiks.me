import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, type Store } from "./store.js";

describe("store (in-memory)", () => {
  let store: Store;

  beforeEach(() => {
    store = createStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns null for an unknown event id", () => {
    expect(store.getEvent(999)).toBeNull();
  });

  it("creates a warning event and reads it back", () => {
    const created = store.createEvent({
      type: "warning",
      title: "Elevated latency",
      startsAt: "2026-08-09T10:00",
    });

    expect(created).toMatchObject({
      type: "warning",
      title: "Elevated latency",
      description: null,
      startsAt: "2026-08-09T10:00",
      endsAt: null,
    });
    expect(typeof created.id).toBe("number");
    expect(typeof created.createdAt).toBe("string");
    expect(created.createdAt).toBe(created.updatedAt);

    expect(store.getEvent(created.id)).toEqual(created);
  });

  it("creates a downtime event with a description and end time", () => {
    const created = store.createEvent({
      type: "downtime",
      title: "Database outage",
      description: "Primary DB unreachable",
      startsAt: "2026-08-09T10:00",
      endsAt: "2026-08-09T10:45",
    });

    expect(created).toMatchObject({
      type: "downtime",
      description: "Primary DB unreachable",
      endsAt: "2026-08-09T10:45",
    });
  });

  it("creates an ongoing downtime with no end time", () => {
    const created = store.createEvent({
      type: "downtime",
      title: "Database outage",
      startsAt: "2026-08-09T10:00",
    });

    expect(created.endsAt).toBeNull();
  });

  it("returns null updating an unknown event id, without creating anything", () => {
    const result = store.updateEvent(999, {
      type: "warning",
      title: "irrelevant",
      startsAt: "2026-08-09T10:00",
    });

    expect(result).toBeNull();
    expect(store.listEvents()).toEqual([]);
  });

  it("updates an existing event, keeping createdAt but bumping updatedAt", async () => {
    const created = store.createEvent({
      type: "downtime",
      title: "Database outage",
      startsAt: "2026-08-09T10:00",
    });

    // Ensures the ISO millisecond timestamp actually differs from createdAt.
    await new Promise((resolve) => setTimeout(resolve, 2));

    const updated = store.updateEvent(created.id, {
      type: "downtime",
      title: "Database outage",
      description: "Resolved",
      startsAt: "2026-08-09T10:00",
      endsAt: "2026-08-09T11:15",
    });

    expect(updated).toMatchObject({
      id: created.id,
      description: "Resolved",
      endsAt: "2026-08-09T11:15",
    });
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.updatedAt).not.toBe(created.updatedAt);
  });

  it("lists events newest-starting first", () => {
    const older = store.createEvent({
      type: "warning",
      title: "older",
      startsAt: "2026-08-07T09:00",
    });
    const newer = store.createEvent({
      type: "warning",
      title: "newer",
      startsAt: "2026-08-09T09:00",
    });

    expect(store.listEvents().map((event) => event.id)).toEqual([newer.id, older.id]);
  });

  describe("listAdminEvents", () => {
    const NOW = "2026-08-09T12:00";

    it("includes events starting today and yesterday", () => {
      const today = store.createEvent({
        type: "warning",
        title: "today",
        startsAt: "2026-08-09T08:00",
      });
      const yesterday = store.createEvent({
        type: "warning",
        title: "yesterday",
        startsAt: "2026-08-08T23:59",
      });

      const ids = store.listAdminEvents(NOW).map((event) => event.id);
      expect(ids).toEqual(expect.arrayContaining([today.id, yesterday.id]));
    });

    it("excludes a closed event from two days ago", () => {
      store.createEvent({
        type: "warning",
        title: "two days ago",
        startsAt: "2026-08-07T23:59",
      });

      expect(store.listAdminEvents(NOW)).toEqual([]);
    });

    it("still includes an ongoing downtime from two days ago", () => {
      const stale = store.createEvent({
        type: "downtime",
        title: "still down",
        startsAt: "2026-08-01T00:00",
      });

      const ids = store.listAdminEvents(NOW).map((event) => event.id);
      expect(ids).toEqual([stale.id]);
    });

    it("excludes a closed downtime from two days ago", () => {
      store.createEvent({
        type: "downtime",
        title: "resolved earlier",
        startsAt: "2026-08-01T00:00",
        endsAt: "2026-08-01T01:00",
      });

      expect(store.listAdminEvents(NOW)).toEqual([]);
    });

    it("computes the cutoff correctly across a month boundary", () => {
      const inRange = store.createEvent({
        type: "warning",
        title: "last day of feb",
        startsAt: "2026-02-28T23:00",
      });
      store.createEvent({
        type: "warning",
        title: "two days before march 1st",
        startsAt: "2026-02-27T23:00",
      });

      const ids = store.listAdminEvents("2026-03-01T00:30").map((event) => event.id);
      expect(ids).toEqual([inRange.id]);
    });
  });
});

describe("store (file-backed)", () => {
  let dir: string;
  let dbPath: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kstatus-store-test-"));
    dbPath = join(dir, "nested", "store.sqlite");
    store = createStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the database file inside a non-existent parent directory", () => {
    const db = new DatabaseSync(dbPath);
    db.close();
  });

  it("persists rows with the expected column shape", () => {
    store.createEvent({
      type: "downtime",
      title: "Database outage",
      description: "Primary DB unreachable",
      startsAt: "2026-08-09T10:00",
      endsAt: "2026-08-09T10:45",
    });

    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT * FROM events").get() as Record<string, unknown>;
    db.close();

    expect(row).toMatchObject({
      type: "downtime",
      title: "Database outage",
      description: "Primary DB unreachable",
      starts_at: "2026-08-09T10:00",
      ends_at: "2026-08-09T10:45",
    });
    expect(typeof row.created_at).toBe("string");
    expect(typeof row.updated_at).toBe("string");
  });

  it("rejects an event type outside the CHECK constraint", () => {
    const db = new DatabaseSync(dbPath);
    expect(() =>
      db
        .prepare(
          "INSERT INTO events (type, title, starts_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("bogus", "t", "2026-08-09T10:00", "now", "now"),
    ).toThrow();
    db.close();
  });
});
