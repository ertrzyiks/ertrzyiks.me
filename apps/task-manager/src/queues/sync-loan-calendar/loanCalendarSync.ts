// The actual "sync one loan's Google Calendar event" logic, independent of BullMQ — mirrors
// jobProcessor.ts's split (worker.ts wraps this in a Worker processor callback; tests call it
// directly with fakes). Runs once per current loan (see libraryRefresh.ts, which is what
// enqueues one of these jobs per loan).
//
// Every book due back at the same branch ("filia") on the same day shares a single calendar
// event — see loansStore.ts's header comment for why that event is looked up by (filiaId, day)
// rather than tracked per loan. Every run recomputes the *whole* group's description and
// re-applies it, so it's safe (if slightly redundant) for every loan in a group to run this and
// converge on the same result regardless of run order.
import type { CalendarClient } from "../../googleCalendar.js";
import { noopJobLogger, type JobLogger } from "../../jobLogger.js";
import type { LoansStore } from "../../loansStore.js";

export interface LoanCalendarSyncDeps {
  store: LoansStore;
  calendar: CalendarClient;
  /** Bull Board per-job progress notes (#348) — optional, defaults to a no-op. */
  log?: JobLogger;
}

const EVENT_HOUR = "18:00:00";
const EVENT_END_HOUR = "18:30:00";

function describeLoan(loan: { title: string; author: string; accountLabel: string | null }): string {
  const book = `${loan.title} — ${loan.author}`;
  return loan.accountLabel ? `${book} (${loan.accountLabel})` : book;
}

/** Returns without doing anything if `holdingId` isn't a currently-tracked loan — e.g. the book
 * was returned (and replaceCurrentLoans() removed it) between this job being enqueued and run. */
export async function syncLoanCalendarEvent(holdingId: number, deps: LoanCalendarSyncDeps): Promise<void> {
  const log = deps.log ?? noopJobLogger;

  const loan = deps.store.getLoan(holdingId);
  if (!loan) {
    log(`Loan ${holdingId} is no longer tracked (already returned) — skipping`);
    return;
  }

  const day = loan.dateReturn.slice(0, 10);
  const members = deps.store.listLoansInGroup(holdingId);

  const input = {
    summary: loan.filiaName,
    description: members.map(describeLoan).join("\n"),
    start: `${day}T${EVENT_HOUR}`,
    end: `${day}T${EVENT_END_HOUR}`,
  };

  const existingGroup = deps.store.getCalendarEventGroup(loan.filiaId, day);
  if (existingGroup) {
    const stillExists = await deps.calendar.eventExists(existingGroup.googleEventId);
    if (stillExists) {
      log(`Updating existing calendar event for ${loan.filiaName} on ${day}`);
      await deps.calendar.updateEvent(existingGroup.googleEventId, input);
      return;
    }
    // Event was removed out from under us (e.g. deleted by hand in Google Calendar) — fall
    // through and create a fresh one below, same as if there had never been one.
    log(`Existing calendar event for ${loan.filiaName} on ${day} was deleted out from under us — recreating`);
  }

  log(`Creating new calendar event for ${loan.filiaName} on ${day}`);
  const eventId = await deps.calendar.createEvent(input);
  deps.store.setCalendarEventGroup(loan.filiaId, day, eventId);
}
