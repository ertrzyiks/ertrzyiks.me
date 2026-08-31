import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncLoanCalendarEvent } from "./loanCalendarSync.js";
import { createStore, type LibraryLoanInput, type LoansStore } from "../../loansStore.js";
import type { CalendarClient, CalendarEventInput } from "../../../../googleCalendarClient.js";

function loanInput(overrides: Partial<LibraryLoanInput> = {}): LibraryLoanInput {
  return {
    holdingId: 1,
    title: "Michał i 38",
    author: "Witek, Rafał (1971- ).",
    filiaId: 144,
    filiaName: "Filia nr 002 Biblioteka Oliwska",
    dateReturn: "2026-08-20T00:00:00",
    accountKey: null,
    accountLabel: null,
    ...overrides,
  };
}

interface FakeCalendarEvent extends CalendarEventInput {
  id: string;
  deleted: boolean;
}

function fakeCalendar(): CalendarClient & { events: Map<string, FakeCalendarEvent> } {
  const events = new Map<string, FakeCalendarEvent>();
  let nextId = 1;

  return {
    events,
    async createEvent(input) {
      const id = `event-${nextId++}`;
      events.set(id, { ...input, id, deleted: false });
      return id;
    },
    async updateEvent(eventId, input) {
      const existing = events.get(eventId);
      if (!existing) throw new Error(`updateEvent called for unknown id ${eventId}`);
      events.set(eventId, { ...existing, ...input });
    },
    async deleteEvent(eventId) {
      const existing = events.get(eventId);
      if (existing) existing.deleted = true;
    },
    async eventExists(eventId) {
      const existing = events.get(eventId);
      return existing !== undefined && !existing.deleted;
    },
  };
}

function recordingLog(): { log: (message: string) => void; messages: string[] } {
  const messages: string[] = [];
  return { messages, log: (message) => messages.push(message) };
}

describe("syncLoanCalendarEvent", () => {
  let store: LoansStore;
  let calendar: ReturnType<typeof fakeCalendar>;

  beforeEach(() => {
    store = createStore(":memory:");
    calendar = fakeCalendar();
  });

  afterEach(() => {
    store.close();
  });

  it("does nothing for a loan that isn't currently tracked (e.g. already returned)", async () => {
    await syncLoanCalendarEvent(999, { store, calendar });

    expect(calendar.events.size).toBe(0);
  });

  it("creates a new event at 18:00 on the return date, titled after the filia, when none exists yet", async () => {
    store.replaceCurrentLoans([loanInput()]);

    await syncLoanCalendarEvent(1, { store, calendar });

    expect(calendar.events.size).toBe(1);
    const [event] = [...calendar.events.values()];
    expect(event).toMatchObject({
      summary: "Filia nr 002 Biblioteka Oliwska",
      start: "2026-08-20T18:00:00",
      end: "2026-08-20T18:30:00",
      description: "Michał i 38 — Witek, Rafał (1971- ).",
    });
    expect(store.getCalendarEventGroup(144, "2026-08-20")?.googleEventId).toBe(event.id);
  });

  it("lists every book in the same filia+day group in the description, one per line", async () => {
    store.replaceCurrentLoans([
      loanInput({ holdingId: 1, title: "Book A" }),
      loanInput({ holdingId: 2, title: "Book B", author: "Author B" }),
    ]);

    await syncLoanCalendarEvent(1, { store, calendar });

    const [event] = [...calendar.events.values()];
    expect(event.description).toBe(
      "Book A — Witek, Rafał (1971- ).\nBook B — Author B",
    );
  });

  it("suffixes a sub-account's books with its label, but not the main account's", async () => {
    store.replaceCurrentLoans([
      loanInput({ holdingId: 1, title: "Own book" }),
      loanInput({ holdingId: 2, title: "Son's book", accountKey: "sub-1", accountLabel: "Jakub Derks" }),
    ]);

    await syncLoanCalendarEvent(1, { store, calendar });

    const [event] = [...calendar.events.values()];
    expect(event.description).toBe(
      "Own book — Witek, Rafał (1971- ).\nSon's book — Witek, Rafał (1971- ). (Jakub Derks)",
    );
  });

  it("reuses and updates the existing event for the group instead of creating a duplicate", async () => {
    store.replaceCurrentLoans([loanInput({ holdingId: 1 })]);
    await syncLoanCalendarEvent(1, { store, calendar });
    const firstEventId = store.getCalendarEventGroup(144, "2026-08-20")?.googleEventId;

    // A second book joins the same group.
    store.replaceCurrentLoans([loanInput({ holdingId: 1 }), loanInput({ holdingId: 2, title: "Second book" })]);
    await syncLoanCalendarEvent(2, { store, calendar });

    expect(calendar.events.size).toBe(1);
    expect(store.getCalendarEventGroup(144, "2026-08-20")?.googleEventId).toBe(firstEventId);
    expect(calendar.events.get(firstEventId!)?.description).toContain("Second book");
  });

  it("reschedules the event when the return date is prolonged", async () => {
    store.replaceCurrentLoans([loanInput({ dateReturn: "2026-08-20T00:00:00" })]);
    await syncLoanCalendarEvent(1, { store, calendar });
    const eventId = store.getCalendarEventGroup(144, "2026-08-20")!.googleEventId;

    store.replaceCurrentLoans([loanInput({ dateReturn: "2026-09-03T00:00:00" })]);
    await syncLoanCalendarEvent(1, { store, calendar });

    // Old group's event id is left in place (cleanup is libraryRefresh.ts's job, not this
    // per-loan sync's), but the loan now syncs into a *new* group at the new date.
    expect(store.getCalendarEventGroup(144, "2026-08-20")?.googleEventId).toBe(eventId);
    const newGroup = store.getCalendarEventGroup(144, "2026-09-03");
    expect(newGroup?.googleEventId).not.toBe(eventId);
    expect(calendar.events.get(newGroup!.googleEventId)?.start).toBe("2026-09-03T18:00:00");
  });

  it("when one book in a shared event is prolonged out of the group, the remaining book's own sync drops it from the description instead of the event staying stale", async () => {
    // Two books due the same day/filia share one event.
    store.replaceCurrentLoans([
      loanInput({ holdingId: 1, title: "Book A", dateReturn: "2026-08-17T00:00:00" }),
      loanInput({ holdingId: 2, title: "Book B", dateReturn: "2026-08-17T00:00:00" }),
    ]);
    await syncLoanCalendarEvent(1, { store, calendar });
    await syncLoanCalendarEvent(2, { store, calendar });
    const sharedEventId = store.getCalendarEventGroup(144, "2026-08-17")!.googleEventId;
    expect(calendar.events.get(sharedEventId)?.description).toContain("Book A");
    expect(calendar.events.get(sharedEventId)?.description).toContain("Book B");

    // Book A gets prolonged to a later date (a refresh would update the loans table like this);
    // book B's return date is untouched. Both still get a sync job — that's libraryRefresh.ts's
    // job, not this test's concern, so both are simulated here directly.
    store.replaceCurrentLoans([
      loanInput({ holdingId: 1, title: "Book A", dateReturn: "2026-09-03T00:00:00" }),
      loanInput({ holdingId: 2, title: "Book B", dateReturn: "2026-08-17T00:00:00" }),
    ]);

    // Book B's sync runs first: no merge step needed — it recomputes the *whole* group fresh
    // from the store, and book A is no longer in it.
    await syncLoanCalendarEvent(2, { store, calendar });
    expect(calendar.events.get(sharedEventId)?.description).toBe("Book B — Witek, Rafał (1971- ).");

    // Book A's sync runs after: its new group (144, 2026-09-03) has no event yet, so it creates
    // its own — it never touches the old shared event.
    await syncLoanCalendarEvent(1, { store, calendar });
    const newGroup = store.getCalendarEventGroup(144, "2026-09-03");
    expect(newGroup?.googleEventId).not.toBe(sharedEventId);
    expect(calendar.events.get(newGroup!.googleEventId)?.description).toBe("Book A — Witek, Rafał (1971- ).");

    // The old event still exists (deleting it if it's now empty is libraryRefresh.ts's
    // garbage-collection sweep, not this per-loan sync's job) — here it isn't empty, it still
    // correctly holds book B alone.
    expect(await calendar.eventExists(sharedEventId)).toBe(true);
  });

  it("creates a fresh event if the previously-tracked one was deleted out from under it", async () => {
    store.replaceCurrentLoans([loanInput()]);
    await syncLoanCalendarEvent(1, { store, calendar });
    const oldEventId = store.getCalendarEventGroup(144, "2026-08-20")!.googleEventId;
    await calendar.deleteEvent(oldEventId);

    await syncLoanCalendarEvent(1, { store, calendar });

    const newEventId = store.getCalendarEventGroup(144, "2026-08-20")!.googleEventId;
    expect(newEventId).not.toBe(oldEventId);
    expect(await calendar.eventExists(newEventId)).toBe(true);
  });

  it("leaves a progress note when skipping an untracked loan, for Bull Board's Logs tab (#348)", async () => {
    const { log, messages } = recordingLog();

    await syncLoanCalendarEvent(999, { store, calendar, log });

    expect(messages).toEqual(["Loan 999 is no longer tracked (already returned) — skipping"]);
  });

  it("leaves a progress note when creating a new event", async () => {
    store.replaceCurrentLoans([loanInput()]);
    const { log, messages } = recordingLog();

    await syncLoanCalendarEvent(1, { store, calendar, log });

    expect(messages).toEqual([
      "Creating new calendar event for Filia nr 002 Biblioteka Oliwska on 2026-08-20",
    ]);
  });

  it("leaves a progress note when updating an existing event", async () => {
    store.replaceCurrentLoans([loanInput()]);
    await syncLoanCalendarEvent(1, { store, calendar });
    const { log, messages } = recordingLog();

    await syncLoanCalendarEvent(1, { store, calendar, log });

    expect(messages).toEqual([
      "Updating existing calendar event for Filia nr 002 Biblioteka Oliwska on 2026-08-20",
    ]);
  });

  it("doesn't throw when no log dep is given — defaults to a no-op", async () => {
    store.replaceCurrentLoans([loanInput()]);

    await expect(syncLoanCalendarEvent(1, { store, calendar })).resolves.toBeUndefined();
  });
});
