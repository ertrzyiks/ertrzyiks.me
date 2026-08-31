// The actual "check WBPG, update local state, fan out per-loan sync jobs" logic, independent of
// BullMQ — same split as jobProcessor.ts/loanCalendarSync.ts. Runs on a schedule (see server.ts's
// repeatable job), not once per loan — it's what *produces* the one `sync-loan-calendar` job per
// current loan that loanCalendarSync.ts then handles individually.
import type { LibraryClient } from "./library.js";
import type { LoanSyncQueue } from "../sync-loan-calendar/queue.js";
import { noopJobLogger, type JobLogger } from "../../../../jobLogger.js";
import type { LoansStore } from "../../loansStore.js";
import type { CalendarClient } from "../../../../googleCalendarClient.js";

export interface LibraryRefreshDeps {
  libraryClient: LibraryClient;
  store: LoansStore;
  syncQueue: LoanSyncQueue;
  calendar: CalendarClient;
  /** Bull Board per-job progress notes (#348) — optional, defaults to a no-op. */
  log?: JobLogger;
}

export interface LibraryRefreshResult {
  loanCount: number;
  removedCalendarEventGroups: number;
}

export async function refreshLibraryLoans(deps: LibraryRefreshDeps): Promise<LibraryRefreshResult> {
  const log = deps.log ?? noopJobLogger;

  log("Fetching current loans and filia names from WBPG");
  const [loans, filiaNames] = await Promise.all([
    deps.libraryClient.getCurrentLoans(),
    deps.libraryClient.getFiliaNames(),
  ]);
  log(`Fetched ${loans.length} current loan(s)`);

  const rows = loans.map((loan) => ({
    ...loan,
    // Falls back to a synthetic label rather than throwing on an unrecognized filiaId — a
    // missing/wrong branch name shouldn't stop the whole sync from progressing for every other
    // loan; it just makes one calendar event's title less friendly than it should be.
    filiaName: filiaNames.get(loan.filiaId) ?? `Filia ${loan.filiaId}`,
  }));

  deps.store.replaceCurrentLoans(rows);

  // Garbage-collect calendar events for groups no current loan belongs to any more — every book
  // that used to be due at that filia on that day either got returned or moved to a different
  // return date (loanCalendarSync.ts only ever *adds* groups, it never notices one has emptied
  // out, since it only ever looks at the one loan it was asked to sync).
  let removedCalendarEventGroups = 0;
  for (const group of deps.store.listCalendarEventGroups()) {
    const stillHasLoans = deps.store.listLoansInGroupKey(group.filiaId, group.returnDate).length > 0;
    if (stillHasLoans) continue;

    await deps.calendar.deleteEvent(group.googleEventId);
    deps.store.deleteCalendarEventGroup(group.filiaId, group.returnDate);
    removedCalendarEventGroups++;
  }

  if (removedCalendarEventGroups > 0) {
    log(`Removed ${removedCalendarEventGroups} stale calendar event group(s)`);
  }

  for (const loan of rows) {
    await deps.syncQueue.enqueue(loan.holdingId);
  }
  log(`Enqueued ${rows.length} sync-loan-calendar job(s)`);

  return { loanCount: rows.length, removedCalendarEventGroups };
}
