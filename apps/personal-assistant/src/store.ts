import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ActionItemInput {
  title: string;
  description?: string;
  dueDate?: string;
}

// Mirrors ActionItemInput's role, for the events extract-action-items returns alongside action
// items (see task-manager's actionItem.ts `CalendarEvent`) — `startTime` is required there
// (extraction never emits an event without one), `endTime` optional.
export interface CalendarEventInput {
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime?: string;
}

export interface QueuedEmail {
  emailId: string;
  jobId: string;
}

/** One action item not yet scheduled for a Todoist sync job (job_id IS NULL). */
export interface UnsyncedActionItem {
  id: number;
  title: string;
  description: string | null;
  dueDate: string | null;
}

/** One action item with a sync job scheduled but not yet backfilled (job_id set, task_id NULL). */
export interface QueuedActionItem {
  id: number;
  jobId: string;
}

/** One calendar event not yet scheduled for a sync-calendar-events job (job_id IS NULL). */
export interface UnsyncedCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
}

/** One calendar event with a sync job scheduled but not yet backfilled (job_id set,
 * google_event_id NULL). */
export interface QueuedCalendarEvent {
  id: number;
  jobId: string;
}

/** One row of the snapshot dashboard's status breakdown (#297/#312). */
export interface StatusCount {
  status: string;
  count: number;
}

/** One row of the snapshot dashboard's recent-failures list (#297/#312). */
export interface FailedEmail {
  id: string;
  errorMessage: string | null;
  updatedAt: string;
}

// Schema exactly as specified in #250/#242, plus job_id/task_id on action_items for the Todoist
// sync loop (todoistSyncer.ts, née googleTasksSyncer.ts): job_id is set once a sync job has been
// scheduled, task_id is backfilled with the Todoist task ID once that job completes. calendar_events
// mirrors that same job_id/<result column> shape for the calendar-event sync loop
// (calendarEventSyncer.ts) — job_id/google_event_id instead of job_id/task_id — but is a brand
// new table (this feature shipped with it from the start), so unlike action_items it needs no
// migration/backfill story: `CREATE TABLE IF NOT EXISTS` alone is enough for both a fresh
// database and an existing one that predates this table.
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
  created_at TEXT NOT NULL,
  job_id TEXT,
  task_id TEXT
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL REFERENCES emails(id),
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  created_at TEXT NOT NULL,
  job_id TEXT,
  google_event_id TEXT
);
`;

// Stamped onto job_id/task_id for rows that predate the Todoist sync feature (see the
// backfill below) — never a real BullMQ job ID or Todoist task ID, just a marker that
// excludes the row from both `getUnsyncedActionItems` (job_id IS NULL) and
// `getActionItemsAwaitingTaskSync` (job_id set, task_id IS NULL) forever.
const PRE_EXISTING_SENTINEL = "pre-existing-skip-sync";

// `CREATE TABLE IF NOT EXISTS` above is a no-op against the production database file, which
// already has an `action_items` table from before job_id/task_id existed — this backfills the
// two columns onto it at startup. Safe to run on every startup: each ALTER only fires once the
// column is actually missing.
function migrateActionItemsColumns(db: DatabaseSync): void {
  const columns = (db.prepare("PRAGMA table_info(action_items)").all() as { name: string }[]).map(
    (row) => row.name,
  );
  const jobIdColumnIsNew = !columns.includes("job_id");
  const taskIdColumnIsNew = !columns.includes("task_id");

  if (jobIdColumnIsNew) {
    db.exec("ALTER TABLE action_items ADD COLUMN job_id TEXT");
  }
  if (taskIdColumnIsNew) {
    db.exec("ALTER TABLE action_items ADD COLUMN task_id TEXT");
  }

  // Without this, every row that existed before this feature shipped would read as "unsynced"
  // the moment job_id first appears, and the very next poll cycle would schedule a sync job for
  // the *entire* historical backlog at once — a burst large enough to trip the sync provider's API
  // rate limits ("quota exceeded"), and each old item's free-form LLM-extracted due date is more
  // likely to be something Google's `due` field rejects outright ("Request contains an invalid
  // argument") than a freshly-extracted one. Only the run where job_id is actually being added
  // needs this — a job_id that's genuinely NULL after that point means "new item, not yet
  // attempted" and must be left alone.
  if (jobIdColumnIsNew) {
    db.prepare("UPDATE action_items SET job_id = ?, task_id = ? WHERE job_id IS NULL").run(
      PRE_EXISTING_SENTINEL,
      PRE_EXISTING_SENTINEL,
    );
  }
}

export interface Store {
  /** Whether an email ID has already been recorded (used for dedup against Gmail polling). */
  emailExists(id: string): boolean;
  /** Records a newly-discovered email as queued, before a job has been scheduled for it. */
  insertQueuedEmail(id: string): void;
  /** Attaches the Jobs API job ID once scheduling succeeded. */
  setJobId(emailId: string, jobId: string): void;
  /** Marks an email failed, either because scheduling or extraction failed. */
  markEmailFailed(emailId: string, errorMessage: string): void;
  /** Stores the extracted action items and calendar events, and marks the email completed.
   * `calendarEvents` defaults to `[]` so existing callers/tests that only care about action items
   * are unaffected by omitting it. */
  markEmailCompleted(
    emailId: string,
    actionItems: ActionItemInput[],
    calendarEvents?: CalendarEventInput[],
  ): void;
  /** Emails still awaiting a job result (status='queued' with a job already scheduled). */
  getQueuedEmailsWithJobId(): QueuedEmail[];
  /** Action items not yet scheduled for a Todoist sync job (job_id IS NULL). */
  getUnsyncedActionItems(): UnsyncedActionItem[];
  /** Attaches the Todoist sync job ID once scheduling succeeded. */
  setActionItemJobId(id: number, jobId: string): void;
  /** Action items with a sync job scheduled but not yet completed (job_id set, task_id NULL). */
  getActionItemsAwaitingTaskSync(): QueuedActionItem[];
  /** Backfills the Todoist task ID once the sync job completes. */
  setActionItemTaskId(id: number, taskId: string): void;
  /** Calendar events not yet scheduled for a sync-calendar-events job (job_id IS NULL). */
  getUnsyncedCalendarEvents(): UnsyncedCalendarEvent[];
  /** Attaches the sync-calendar-events job ID once scheduling succeeded. */
  setCalendarEventJobId(id: number, jobId: string): void;
  /** Calendar events with a sync job scheduled but not yet completed (job_id set,
   * google_event_id NULL). */
  getCalendarEventsAwaitingSync(): QueuedCalendarEvent[];
  /** Backfills the Google Calendar event ID once the sync job completes. */
  setCalendarEventGoogleEventId(id: number, googleEventId: string): void;
  /** Current counts of emails grouped by status, for the snapshot dashboard (#297/#312). */
  getStatusCounts(): StatusCount[];
  /** The most recently updated failed emails, capped at `limit` (#297/#312). */
  getRecentFailures(limit: number): FailedEmail[];
  close(): void;
}

export function createStore(path: string): Store {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  migrateActionItemsColumns(db);

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
  const insertCalendarEventStmt = db.prepare(
    "INSERT INTO calendar_events (email_id, title, description, date, start_time, end_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const queuedWithJobStmt = db.prepare(
    "SELECT id, job_id FROM emails WHERE status = 'queued' AND job_id IS NOT NULL",
  );
  const unsyncedActionItemsStmt = db.prepare(
    "SELECT id, title, description, due_date FROM action_items WHERE job_id IS NULL",
  );
  const setActionItemJobIdStmt = db.prepare("UPDATE action_items SET job_id = ? WHERE id = ?");
  const actionItemsAwaitingTaskSyncStmt = db.prepare(
    "SELECT id, job_id FROM action_items WHERE job_id IS NOT NULL AND task_id IS NULL",
  );
  const setActionItemTaskIdStmt = db.prepare("UPDATE action_items SET task_id = ? WHERE id = ?");
  const unsyncedCalendarEventsStmt = db.prepare(
    "SELECT id, title, description, date, start_time, end_time FROM calendar_events WHERE job_id IS NULL",
  );
  const setCalendarEventJobIdStmt = db.prepare("UPDATE calendar_events SET job_id = ? WHERE id = ?");
  const calendarEventsAwaitingSyncStmt = db.prepare(
    "SELECT id, job_id FROM calendar_events WHERE job_id IS NOT NULL AND google_event_id IS NULL",
  );
  const setCalendarEventGoogleEventIdStmt = db.prepare(
    "UPDATE calendar_events SET google_event_id = ? WHERE id = ?",
  );
  const statusCountsStmt = db.prepare("SELECT status, COUNT(*) as count FROM emails GROUP BY status");
  const recentFailuresStmt = db.prepare(
    "SELECT id, error_message, updated_at FROM emails WHERE status = 'failed' ORDER BY updated_at DESC LIMIT ?",
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

    markEmailCompleted(emailId, actionItems, calendarEvents = []) {
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
        for (const event of calendarEvents) {
          insertCalendarEventStmt.run(
            emailId,
            event.title,
            event.description ?? null,
            event.date,
            event.startTime,
            event.endTime ?? null,
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

    getUnsyncedActionItems() {
      const rows = unsyncedActionItemsStmt.all() as {
        id: number;
        title: string;
        description: string | null;
        due_date: string | null;
      }[];
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        dueDate: row.due_date,
      }));
    },

    setActionItemJobId(id, jobId) {
      setActionItemJobIdStmt.run(jobId, id);
    },

    getActionItemsAwaitingTaskSync() {
      const rows = actionItemsAwaitingTaskSyncStmt.all() as { id: number; job_id: string }[];
      return rows.map((row) => ({ id: row.id, jobId: row.job_id }));
    },

    setActionItemTaskId(id, taskId) {
      setActionItemTaskIdStmt.run(taskId, id);
    },

    getUnsyncedCalendarEvents() {
      const rows = unsyncedCalendarEventsStmt.all() as {
        id: number;
        title: string;
        description: string | null;
        date: string;
        start_time: string;
        end_time: string | null;
      }[];
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        date: row.date,
        startTime: row.start_time,
        endTime: row.end_time,
      }));
    },

    setCalendarEventJobId(id, jobId) {
      setCalendarEventJobIdStmt.run(jobId, id);
    },

    getCalendarEventsAwaitingSync() {
      const rows = calendarEventsAwaitingSyncStmt.all() as { id: number; job_id: string }[];
      return rows.map((row) => ({ id: row.id, jobId: row.job_id }));
    },

    setCalendarEventGoogleEventId(id, googleEventId) {
      setCalendarEventGoogleEventIdStmt.run(googleEventId, id);
    },

    getStatusCounts() {
      const rows = statusCountsStmt.all() as { status: string; count: number }[];
      return rows.map((row) => ({ status: row.status, count: row.count }));
    },

    getRecentFailures(limit) {
      const rows = recentFailuresStmt.all(limit) as {
        id: string;
        error_message: string | null;
        updated_at: string;
      }[];
      return rows.map((row) => ({
        id: row.id,
        errorMessage: row.error_message,
        updatedAt: row.updated_at,
      }));
    },

    close() {
      db.close();
    },
  };
}
