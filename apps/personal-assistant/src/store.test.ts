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

  describe("Google Tasks sync (job_id/task_id)", () => {
    beforeEach(() => {
      store.insertQueuedEmail("email-1");
      store.setJobId("email-1", "job-1");
    });

    it("has no unsynced action items until one exists", () => {
      expect(store.getUnsyncedActionItems()).toEqual([]);
    });

    it("lists a completed action item as unsynced until a sync job id is attached", () => {
      store.markEmailCompleted("email-1", [
        { title: "Reply to invoice", description: "Pay by Friday", dueDate: "2026-08-10" },
      ]);

      expect(store.getUnsyncedActionItems()).toEqual([
        { id: 1, title: "Reply to invoice", description: "Pay by Friday", dueDate: "2026-08-10" },
      ]);
      expect(store.getActionItemsAwaitingTaskSync()).toEqual([]);
    });

    it("moves an action item from unsynced to awaiting-task-sync once a sync job id is attached", () => {
      store.markEmailCompleted("email-1", [{ title: "Reply to invoice" }]);

      store.setActionItemJobId(1, "gtask-job-1");

      expect(store.getUnsyncedActionItems()).toEqual([]);
      expect(store.getActionItemsAwaitingTaskSync()).toEqual([{ id: 1, jobId: "gtask-job-1" }]);
    });

    it("removes an action item from awaiting-task-sync once a task id is backfilled", () => {
      store.markEmailCompleted("email-1", [{ title: "Reply to invoice" }]);
      store.setActionItemJobId(1, "gtask-job-1");

      store.setActionItemTaskId(1, "gtask-1");

      expect(store.getActionItemsAwaitingTaskSync()).toEqual([]);
      expect(store.getUnsyncedActionItems()).toEqual([]);
    });

    it("keeps unrelated action items untouched", () => {
      store.markEmailCompleted("email-1", [{ title: "Reply to invoice" }, { title: "Schedule follow-up" }]);
      store.setActionItemJobId(1, "gtask-job-1");

      expect(store.getUnsyncedActionItems()).toEqual([
        { id: 2, title: "Schedule follow-up", description: null, dueDate: null },
      ]);
      expect(store.getActionItemsAwaitingTaskSync()).toEqual([{ id: 1, jobId: "gtask-job-1" }]);
    });
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
    // Fresh rows start unsynced — no sync job scheduled yet, per getUnsyncedActionItems above.
    expect(actionItemRows[0]).toMatchObject({ job_id: null, task_id: null });
  });

  it("migrates an action_items table created before job_id/task_id existed", () => {
    store.insertQueuedEmail("email-1"); // action_items.email_id references this
    store.close();

    // Recreates the pre-migration schema by hand (the shape action_items had before this
    // feature) directly against the same file, simulating a production database that predates
    // job_id/task_id.
    const db = new DatabaseSync(dbPath);
    db.exec("DROP TABLE action_items");
    db.exec(`
      CREATE TABLE action_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id TEXT NOT NULL REFERENCES emails(id),
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL
      )
    `);
    db.prepare(
      "INSERT INTO action_items (email_id, title, created_at) VALUES ('email-1', 'Pre-existing item', '2026-01-01T00:00:00.000Z')",
    ).run();
    db.close();

    // Reopening via createStore must apply the migration without losing the existing row — but
    // the pre-existing row must NOT come back as unsynced (see migrateActionItemsColumns's
    // comment): retroactively scheduling the entire historical backlog the moment job_id first
    // exists is exactly what triggered Google Tasks API quota errors in production.
    store = createStore(dbPath);

    expect(store.getUnsyncedActionItems()).toEqual([]);
    expect(store.getActionItemsAwaitingTaskSync()).toEqual([]);

    const inspectDb = new DatabaseSync(dbPath);
    const rawRow = inspectDb.prepare("SELECT job_id, task_id FROM action_items WHERE id = 1").get() as {
      job_id: string;
      task_id: string;
    };
    inspectDb.close();
    expect(rawRow.job_id).toBe(rawRow.task_id); // both stamped with the same skip-sync sentinel

    // A genuinely new item added after the migration must still sync normally.
    store.insertQueuedEmail("email-2");
    store.markEmailCompleted("email-2", [{ title: "New item" }]);

    expect(store.getUnsyncedActionItems()).toEqual([
      { id: 2, title: "New item", description: null, dueDate: null },
    ]);
  });
});
