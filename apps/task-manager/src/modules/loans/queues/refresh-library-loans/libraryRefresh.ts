// The actual "check WBPG, update local state, fan out per-loan sync jobs" logic, independent of
// BullMQ — same split as jobProcessor.ts/loanCalendarSync.ts. Runs on a schedule (see server.ts's
// repeatable job), not once per loan — it's what *produces* the one `sync-loan-calendar` job per
// current loan that loanCalendarSync.ts then handles individually.
//
// "Check WBPG" means every configured account (see libraryConfig.ts): the loans of all of them
// are pooled into one snapshot, so a second card's books are grouped into the same calendar
// events as the primary's rather than getting a calendar of their own.
import type { LibraryClient, LibraryLoan } from "./library.js";
import type { LoanSyncQueue } from "../sync-loan-calendar/queue.js";
import { noopJobLogger, type JobLogger } from "../../../../jobLogger.js";
import type { LoansStore } from "../../loansStore.js";
import type { CalendarClient } from "../../../../googleCalendarClient.js";

/** One configured WBPG login (see libraryConfig.ts's LibraryAccountConfig) and the client that
 * talks to it. Every account's loans are pooled into the same snapshot and the same calendar,
 * so two cards due back at the same filia on the same day still share one event. */
export interface LibraryRefreshAccount {
  client: LibraryClient;
  /** Owner name for loans on this login's own card; see LibraryAccountConfig.label. */
  label?: string;
}

export interface LibraryRefreshDeps {
  /** At least one — `accounts[0]` is the primary (see libraryConfig.ts). */
  accounts: LibraryRefreshAccount[];
  store: LoansStore;
  syncQueue: LoanSyncQueue;
  calendar: CalendarClient;
  /** Bull Board per-job progress notes (#348) — optional, defaults to a no-op. */
  log?: JobLogger;
}

/** A loan on the login's own card carries no label from WBPG (only linked sub-accounts do), so
 * the configured owner name fills that in — otherwise two cards' own loans would sit in the
 * same event description with nothing saying whose each one is. */
function withAccountLabel(loan: LibraryLoan, label: string | undefined): LibraryLoan {
  return loan.accountLabel === null && label ? { ...loan, accountLabel: label } : loan;
}

/** Loans from every configured account, deduplicated by holdingId. The dedupe matters because
 * the same card can be linked as a sub-account of more than one login (e.g. both parents have
 * the child's card linked), which would otherwise list that book twice in one event. A
 * holdingId identifies one physical copy in the shared catalog, so the same id across two
 * accounts really is the same loan. Any account failing fails the whole refresh rather than
 * writing a partial snapshot — a half-fetched snapshot looks exactly like "those books were
 * returned" and would delete their calendar events. */
async function fetchLoansFromAllAccounts(accounts: LibraryRefreshAccount[]): Promise<LibraryLoan[]> {
  const perAccount = await Promise.all(
    accounts.map(async (account) =>
      (await account.client.getCurrentLoans()).map((loan) => withAccountLabel(loan, account.label)),
    ),
  );

  const byHoldingId = new Map<number, LibraryLoan>();
  for (const loan of perAccount.flat()) {
    if (!byHoldingId.has(loan.holdingId)) byHoldingId.set(loan.holdingId, loan);
  }
  return [...byHoldingId.values()];
}

export interface LibraryRefreshResult {
  loanCount: number;
  removedCalendarEventGroups: number;
}

export async function refreshLibraryLoans(deps: LibraryRefreshDeps): Promise<LibraryRefreshResult> {
  const log = deps.log ?? noopJobLogger;

  log(`Fetching current loans and filia names from WBPG (${deps.accounts.length} account(s))`);
  const [loans, filiaNames] = await Promise.all([
    fetchLoansFromAllAccounts(deps.accounts),
    // Public catalog config, identical whichever card asks for it (see library.ts), so one
    // account's client answers for all of them.
    deps.accounts[0].client.getFiliaNames(),
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
