import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { dayKeyOf } from "./dayPart.js";

export type EventType = "warning" | "downtime";

export interface Event {
  id: number;
  type: EventType;
  title: string;
  description: string | null;
  /** Naive local "YYYY-MM-DDTHH:mm" timestamp — see dayPart.ts for why there's no timezone. */
  startsAt: string;
  /** Only meaningful for `downtime`; `null` means the downtime is still ongoing. */
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventInput {
  type: EventType;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
}

export interface Store {
  createEvent(input: EventInput): Event;
  /** Returns `null` if `id` doesn't exist, rather than throwing. */
  updateEvent(id: number, input: EventInput): Event | null;
  getEvent(id: number): Event | null;
  /** Returns `false` if `id` doesn't exist, rather than throwing. */
  deleteEvent(id: number): boolean;
  /** All events, newest first — the public status page's full stream. */
  listEvents(): Event[];
  /**
   * Events for the admin page: those starting today or yesterday (relative to `now`), plus any
   * downtime that's still open (`endsAt` unset) regardless of when it started — otherwise a
   * downtime an admin forgets to close within two days would silently fall off the one screen
   * that can close it.
   */
  listAdminEvents(now: string): Event[];
  close(): void;
}

// events.type has no foreign key elsewhere, so a CHECK constraint is the cheapest guard against a
// bad value ever reaching storage even if application-level validation is skipped or buggy.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('warning', 'downtime')),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

interface EventRow {
  id: number;
  type: EventType;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The calendar day before `dayKey` ("YYYY-MM-DD"), correct across month/year boundaries. */
function dayBefore(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function createStore(path: string): Store {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const insertStmt = db.prepare(
    `INSERT INTO events (type, title, description, starts_at, ends_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStmt = db.prepare(
    `UPDATE events
     SET type = ?, title = ?, description = ?, starts_at = ?, ends_at = ?, updated_at = ?
     WHERE id = ?`,
  );
  const getStmt = db.prepare("SELECT * FROM events WHERE id = ?");
  const deleteStmt = db.prepare("DELETE FROM events WHERE id = ?");
  const listAllStmt = db.prepare("SELECT * FROM events ORDER BY starts_at DESC, id DESC");
  const listAdminStmt = db.prepare(
    `SELECT * FROM events
     WHERE substr(starts_at, 1, 10) >= ?
        OR (type = 'downtime' AND ends_at IS NULL)
     ORDER BY starts_at DESC, id DESC`,
  );

  function getEvent(id: number): Event | null {
    const row = getStmt.get(id) as EventRow | undefined;
    return row ? rowToEvent(row) : null;
  }

  return {
    createEvent(input) {
      const now = new Date().toISOString();
      const result = insertStmt.run(
        input.type,
        input.title,
        input.description ?? null,
        input.startsAt,
        input.endsAt ?? null,
        now,
        now,
      );
      // node:sqlite returns lastInsertRowid as bigint for INTEGER PRIMARY KEY columns.
      return getEvent(Number(result.lastInsertRowid))!;
    },

    updateEvent(id, input) {
      const result = updateStmt.run(
        input.type,
        input.title,
        input.description ?? null,
        input.startsAt,
        input.endsAt ?? null,
        new Date().toISOString(),
        id,
      );
      if (result.changes === 0) return null;
      return getEvent(id);
    },

    getEvent,

    deleteEvent(id) {
      const result = deleteStmt.run(id);
      return result.changes > 0;
    },

    listEvents() {
      return (listAllStmt.all() as unknown as EventRow[]).map(rowToEvent);
    },

    listAdminEvents(now) {
      const cutoff = dayBefore(dayKeyOf(now));
      return (listAdminStmt.all(cutoff) as unknown as EventRow[]).map(rowToEvent);
    },

    close() {
      db.close();
    },
  };
}
