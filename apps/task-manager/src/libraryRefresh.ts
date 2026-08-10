// The actual "check WBPG, update local state, fan out per-loan sync jobs" logic, independent of
// BullMQ — same split as jobProcessor.ts/loanCalendarSync.ts. Runs on a schedule (see
// librarySyncWorker.ts's repeatable job), not once per loan — it's what *produces* the one
// `sync-loan-calendar` job per current loan that loanCalendarSync.ts then handles individually.
import type { LibraryClient } from "./library.js";
import type { LoanSyncQueue } from "./librarySyncQueue.js";
import type { LoansStore } from "./loansStore.js";
import type { CalendarClient } from "./googleCalendar.js";

export interface LibraryRefreshDeps {
  libraryClient: LibraryClient;
  store: LoansStore;
  syncQueue: LoanSyncQueue;
  calendar: CalendarClient;
}

export interface LibraryRefreshResult {
  loanCount: number;
  removedCalendarEventGroups: number;
}

export async function refreshLibraryLoans(deps: LibraryRefreshDeps): Promise<LibraryRefreshResult> {
  const [loans, filiaNames] = await Promise.all([
    deps.libraryClient.getCurrentLoans(),
    deps.libraryClient.getFiliaNames(),
  ]);

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

  for (const loan of rows) {
    await deps.syncQueue.enqueue(loan.holdingId);
  }

  return { loanCount: rows.length, removedCalendarEventGroups };
}
