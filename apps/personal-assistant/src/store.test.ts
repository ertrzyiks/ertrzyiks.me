import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, type Store } from "./store.js";

describe("store (in-memory)", () => {
  let store: Store;

  beforeEach(() => {
    store = createStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("reports unknown emails as not existing", () => {
    expect(store.emailExists("email-1")).toBe(false);
  });

  it("dedups: an inserted email is reported as existing", () => {
    store.insertQueuedEmail("email-1");

    expect(store.emailExists("email-1")).toBe(true);
  });

  it("has no queued jobs until a job ID is attached", () => {
    store.insertQueuedEmail("email-1");

    expect(store.getQueuedEmailsWithJobId()).toEqual([]);
  });

  it("lists queued emails once a job ID is attached", () => {
    store.insertQueuedEmail("email-1");
    store.setJobId("email-1", "job-1");

    expect(store.getQueuedEmailsWithJobId()).toEqual([{ emailId: "email-1", jobId: "job-1" }]);
  });

  it("marking an email completed removes it from the queued list", () => {
    store.insertQueuedEmail("email-1");
    store.setJobId("email-1", "job-1");

    store.markEmailCompleted("email-1", [{ title: "Schedule follow-up" }]);

    expect(store.getQueuedEmailsWithJobId()).toEqual([]);
  });

  it("marking an email failed removes it from the queued list", () => {
    store.insertQueuedEmail("email-1");
    store.setJobId("email-1", "job-1");

    store.markEmailFailed("email-1", "boom");

    expect(store.getQueuedEmailsWithJobId()).toEqual([]);
  });

  it("keeps unrelated queued emails untouched when one is completed or failed", () => {
    store.insertQueuedEmail("email-1");
    store.setJobId("email-1", "job-1");
    store.insertQueuedEmail("email-2");
    store.setJobId("email-2", "job-2");

    store.markEmailCompleted("email-1", []);

    expect(store.getQueuedEmailsWithJobId()).toEqual([{ emailId: "email-2", jobId: "job-2" }]);
  });

  describe("getStatusCounts", () => {
    it("returns no rows when there are no emails", () => {
      expect(store.getStatusCounts()).toEqual([]);
    });

    it("groups emails by status", () => {
      store.insertQueuedEmail("email-1");
      store.insertQueuedEmail("email-2");
      store.insertQueuedEmail("email-3");
      store.markEmailFailed("email-2", "boom");
      store.markEmailCompleted("email-3", []);

      const counts = store.getStatusCounts();

      expect(counts).toEqual(
        expect.arrayContaining([
          { status: "queued", count: 1 },
          { status: "failed", count: 1 },
          { status: "completed", count: 1 },
        ]),
      );
      expect(counts).toHaveLength(3);
    });
  });

  describe("getRecentFailures", () => {
    it("returns no rows when there are no failures", () => {
      expect(store.getRecentFailures(50)).toEqual([]);
    });

    it("only includes failed emails, with their error message", () => {
      store.insertQueuedEmail("email-1");
      store.insertQueuedEmail("email-2");
      store.markEmailFailed("email-2", "boom");

      const failures = store.getRecentFailures(50);

      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ id: "email-2", errorMessage: "boom" });
    });

    it("orders by most recently updated first", () => {
      // Fake timers give each failure a distinct, controlled `updated_at` — two real-clock
      // calls back-to-back can land in the same millisecond and make the ORDER BY tie-break
      // arbitrarily, which would make this test flaky.
      vi.useFakeTimers();
      try {
        store.insertQueuedEmail("email-1");
        store.insertQueuedEmail("email-2");

        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        store.markEmailFailed("email-1", "first failure");

        vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
        store.markEmailFailed("email-2", "second failure");
      } finally {
        vi.useRealTimers();
      }

      const failures = store.getRecentFailures(50);

      expect(failures.map((f) => f.id)).toEqual(["email-2", "email-1"]);
    });

    it("caps the number of rows returned", () => {
      for (let i = 0; i < 5; i++) {
        const id = `email-${i}`;
        store.insertQueuedEmail(id);
        store.markEmailFailed(id, "boom");
      }

      expect(store.getRecentFailures(2)).toHaveLength(2);
    });
  });
});

describe("store (file-backed)", () => {
  // Uses a real file rather than :memory: so a second, independent connection can inspect
  // the raw rows on disk — verifying the actual persisted schema/values, not just what the
  // Store interface happens to expose.
  let dir: string;
  let dbPath: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "personal-assistant-store-test-"));
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

  it("persists the emails row per the #242 schema, including error_message on failure", () => {
    store.insertQueuedEmail("email-1");
    store.setJobId("email-1", "job-1");
    store.markEmailFailed("email-1", "extraction failed");

    const db = new DatabaseSync(dbPath);
    const row = db.prepare("SELECT * FROM emails WHERE id = ?").get("email-1") as Record<
      string,
      unknown
    >;
    db.close();

    expect(row.id).toBe("email-1");
    expect(row.job_id).toBe("job-1");
    expect(row.status).toBe("failed");
    expect(row.error_message).toBe("extraction failed");
    expect(typeof row.created_at).toBe("string");
    expect(typeof row.updated_at).toBe("string");
  });

  it("stores action_items rows with due_date mapped from dueDate, and marks the email completed", () => {
    store.insertQueuedEmail("email-1");
    store.setJobId("email-1", "job-1");

    store.markEmailCompleted("email-1", [
      { title: "Reply to invoice", description: "Pay by Friday", dueDate: "2026-08-10" },
      { title: "Schedule follow-up" },
    ]);

    const db = new DatabaseSync(dbPath);
    const emailRow = db.prepare("SELECT * FROM emails WHERE id = ?").get("email-1") as Record<
      string,
      unknown
    >;
    const actionItemRows = db
      .prepare("SELECT * FROM action_items WHERE email_id = ? ORDER BY id")
      .all("email-1") as Record<string, unknown>[];
    db.close();

    expect(emailRow.status).toBe("completed");

    expect(actionItemRows).toHaveLength(2);
    expect(actionItemRows[0]).toMatchObject({
      email_id: "email-1",
      title: "Reply to invoice",
      description: "Pay by Friday",
      due_date: "2026-08-10",
      status: "open",
    });
    expect(actionItemRows[1]).toMatchObject({
      email_id: "email-1",
      title: "Schedule follow-up",
      description: null,
      due_date: null,
      status: "open",
    });
  });
});
