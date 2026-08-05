import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ActionItemInput {
  title: string;
  description?: string;
  dueDate?: string;
}

export interface QueuedEmail {
  emailId: string;
  jobId: string;
}

// Schema exactly as specified in #250/#242.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL REFERENCES emails(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
`;

export interface Store {
  /** Whether an email ID has already been recorded (used for dedup against Gmail polling). */
  emailExists(id: string): boolean;
  /** Records a newly-discovered email as queued, before a job has been scheduled for it. */
  insertQueuedEmail(id: string): void;
  /** Attaches the Jobs API job ID once scheduling succeeded. */
  setJobId(emailId: string, jobId: string): void;
  /** Marks an email failed, either because scheduling or extraction failed. */
  markEmailFailed(emailId: string, errorMessage: string): void;
  /** Stores the extracted action items and marks the email completed. */
  markEmailCompleted(emailId: string, actionItems: ActionItemInput[]): void;
  /** Emails still awaiting a job result (status='queued' with a job already scheduled). */
  getQueuedEmailsWithJobId(): QueuedEmail[];
  close(): void;
}

export function createStore(path: string): Store {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const existsStmt = db.prepare("SELECT 1 FROM emails WHERE id = ?");
  const insertEmailStmt = db.prepare(
    "INSERT INTO emails (id, status, created_at, updated_at) VALUES (?, 'queued', ?, ?)",
  );
  const setJobIdStmt = db.prepare("UPDATE emails SET job_id = ?, updated_at = ? WHERE id = ?");
  const failEmailStmt = db.prepare(
    "UPDATE emails SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
  );
  const completeEmailStmt = db.prepare(
    "UPDATE emails SET status = 'completed', updated_at = ? WHERE id = ?",
  );
  const insertActionItemStmt = db.prepare(
    "INSERT INTO action_items (email_id, title, description, due_date, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const queuedWithJobStmt = db.prepare(
    "SELECT id, job_id FROM emails WHERE status = 'queued' AND job_id IS NOT NULL",
  );

  return {
    emailExists(id) {
      return existsStmt.get(id) !== undefined;
    },

    insertQueuedEmail(id) {
      const now = new Date().toISOString();
      insertEmailStmt.run(id, now, now);
    },

    setJobId(emailId, jobId) {
      setJobIdStmt.run(jobId, new Date().toISOString(), emailId);
    },

    markEmailFailed(emailId, errorMessage) {
      failEmailStmt.run(errorMessage, new Date().toISOString(), emailId);
    },

    markEmailCompleted(emailId, actionItems) {
      const now = new Date().toISOString();
      db.exec("BEGIN");
      try {
        for (const item of actionItems) {
          insertActionItemStmt.run(
            emailId,
            item.title,
            item.description ?? null,
            item.dueDate ?? null,
            now,
          );
        }
        completeEmailStmt.run(now, emailId);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },

    getQueuedEmailsWithJobId() {
      const rows = queuedWithJobStmt.all() as { id: string; job_id: string }[];
      return rows.map((row) => ({ emailId: row.id, jobId: row.job_id }));
    },

    close() {
      db.close();
    },
  };
}
