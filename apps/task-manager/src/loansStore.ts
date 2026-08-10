// Local state for the library-loan -> Google Calendar sync job. Two tables:
//
// - `loans`: the current snapshot of every active loan across the WBPG login and its linked
//   sub-accounts (see library.ts), replaced wholesale on each refresh (loans.ts's caller decides
//   what "current" means; a book no longer present on refresh is a book that got returned).
// - `calendar_event_groups`: one row per (filiaId, return-date day) group that has ever had a
//   Google Calendar event created for it, keyed by that group rather than by an individual loan.
//   Keying by group instead of per-loan sidesteps a real hazard: if a loan's return date moves
//   (a prolongation) it changes which group it belongs to, and a per-loan calendar_event_id would
//   go stale in a way that's easy to apply to the wrong group by mistake. Looking the event up by
//   the loan's *current* (filiaId, day) always finds the right one, or correctly finds none.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface LibraryLoanInput {
  holdingId: number;
  title: string;
  author: string;
  filiaId: number;
  filiaName: string;
  /** Naive local "YYYY-MM-DDTHH:mm:ss"; see library.ts's LibraryLoan.dateReturn. */
  dateReturn: string;
  accountKey: string | null;
  accountLabel: string | null;
}

export interface LoanRow extends LibraryLoanInput {
  updatedAt: string;
}

export interface CalendarEventGroup {
  filiaId: number;
  /** "YYYY-MM-DD" */
  returnDate: string;
  googleEventId: string;
}

export interface LoansStore {
  /** Upserts every loan in `loans`, and removes any previously-tracked loan not present in
   * it — i.e. this replaces the whole "current loans" snapshot in one pass. */
  replaceCurrentLoans(loans: LibraryLoanInput[]): void;
  getLoan(holdingId: number): LoanRow | null;
  /** `holdingId`'s loan plus every other currently-tracked loan sharing its (filiaId,
   * return-date day) — the set of loans that should share one calendar event, including
   * `holdingId` itself. Empty if `holdingId` isn't currently tracked. */
  listLoansInGroup(holdingId: number): LoanRow[];
  listLoansInGroupKey(filiaId: number, returnDate: string): LoanRow[];
  getCalendarEventGroup(filiaId: number, returnDate: string): CalendarEventGroup | null;
  setCalendarEventGroup(filiaId: number, returnDate: string, googleEventId: string): void;
  deleteCalendarEventGroup(filiaId: number, returnDate: string): void;
  listCalendarEventGroups(): CalendarEventGroup[];
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS loans (
  holding_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  filia_id INTEGER NOT NULL,
  filia_name TEXT NOT NULL,
  date_return TEXT NOT NULL,
  account_key TEXT,
  account_label TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_event_groups (
  filia_id INTEGER NOT NULL,
  return_date TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (filia_id, return_date)
);
`;

interface LoanDbRow {
  holding_id: number;
  title: string;
  author: string;
  filia_id: number;
  filia_name: string;
  date_return: string;
  account_key: string | null;
  account_label: string | null;
  updated_at: string;
}

interface CalendarEventGroupDbRow {
  filia_id: number;
  return_date: string;
  google_event_id: string;
}

function rowToLoan(row: LoanDbRow): LoanRow {
  return {
    holdingId: row.holding_id,
    title: row.title,
    author: row.author,
    filiaId: row.filia_id,
    filiaName: row.filia_name,
    dateReturn: row.date_return,
    accountKey: row.account_key,
    accountLabel: row.account_label,
    updatedAt: row.updated_at,
  };
}

function rowToGroup(row: CalendarEventGroupDbRow): CalendarEventGroup {
  return { filiaId: row.filia_id, returnDate: row.return_date, googleEventId: row.google_event_id };
}

/** The calendar-day portion of a "YYYY-MM-DDTHH:mm:ss" return date. */
function returnDateDay(dateReturn: string): string {
  return dateReturn.slice(0, 10);
}

export function createStore(path: string): LoansStore {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const upsertLoanStmt = db.prepare(`
    INSERT INTO loans (holding_id, title, author, filia_id, filia_name, date_return, account_key, account_label, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(holding_id) DO UPDATE SET
      title = excluded.title,
      author = excluded.author,
      filia_id = excluded.filia_id,
      filia_name = excluded.filia_name,
      date_return = excluded.date_return,
      account_key = excluded.account_key,
      account_label = excluded.account_label,
      updated_at = excluded.updated_at
  `);
  const deleteLoanStmt = db.prepare("DELETE FROM loans WHERE holding_id = ?");
  const listLoanIdsStmt = db.prepare("SELECT holding_id FROM loans");
  const getLoanStmt = db.prepare("SELECT * FROM loans WHERE holding_id = ?");
  const listLoansInGroupKeyStmt = db.prepare(
    "SELECT * FROM loans WHERE filia_id = ? AND substr(date_return, 1, 10) = ? ORDER BY holding_id",
  );

  const upsertGroupStmt = db.prepare(`
    INSERT INTO calendar_event_groups (filia_id, return_date, google_event_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(filia_id, return_date) DO UPDATE SET
      google_event_id = excluded.google_event_id,
      updated_at = excluded.updated_at
  `);
  const getGroupStmt = db.prepare(
    "SELECT * FROM calendar_event_groups WHERE filia_id = ? AND return_date = ?",
  );
  const deleteGroupStmt = db.prepare(
    "DELETE FROM calendar_event_groups WHERE filia_id = ? AND return_date = ?",
  );
  const listGroupsStmt = db.prepare("SELECT * FROM calendar_event_groups ORDER BY filia_id, return_date");

  function getLoan(holdingId: number): LoanRow | null {
    const row = getLoanStmt.get(holdingId) as LoanDbRow | undefined;
    return row ? rowToLoan(row) : null;
  }

  function listLoansInGroupKey(filiaId: number, returnDate: string): LoanRow[] {
    return (listLoansInGroupKeyStmt.all(filiaId, returnDate) as unknown as LoanDbRow[]).map(rowToLoan);
  }

  return {
    replaceCurrentLoans(loans) {
      const now = new Date().toISOString();
      const incomingIds = new Set(loans.map((loan) => loan.holdingId));

      db.exec("BEGIN");
      try {
        const existingIds = (listLoanIdsStmt.all() as { holding_id: number }[]).map((r) => r.holding_id);
        for (const id of existingIds) {
          if (!incomingIds.has(id)) deleteLoanStmt.run(id);
        }
        for (const loan of loans) {
          upsertLoanStmt.run(
            loan.holdingId,
            loan.title,
            loan.author,
            loan.filiaId,
            loan.filiaName,
            loan.dateReturn,
            loan.accountKey,
            loan.accountLabel,
            now,
          );
        }
        db.exec("COMMIT");
      } catch (cause) {
        db.exec("ROLLBACK");
        throw cause;
      }
    },

    getLoan,

    listLoansInGroup(holdingId) {
      const loan = getLoan(holdingId);
      if (!loan) return [];
      return listLoansInGroupKey(loan.filiaId, returnDateDay(loan.dateReturn));
    },

    listLoansInGroupKey,

    getCalendarEventGroup(filiaId, returnDate) {
      const row = getGroupStmt.get(filiaId, returnDate) as CalendarEventGroupDbRow | undefined;
      return row ? rowToGroup(row) : null;
    },

    setCalendarEventGroup(filiaId, returnDate, googleEventId) {
      upsertGroupStmt.run(filiaId, returnDate, googleEventId, new Date().toISOString());
    },

    deleteCalendarEventGroup(filiaId, returnDate) {
      deleteGroupStmt.run(filiaId, returnDate);
    },

    listCalendarEventGroups() {
      return (listGroupsStmt.all() as unknown as CalendarEventGroupDbRow[]).map(rowToGroup);
    },

    close() {
      db.close();
    },
  };
}
