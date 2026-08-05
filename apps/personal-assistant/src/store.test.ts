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
