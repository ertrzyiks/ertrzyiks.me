import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refreshLibraryLoans } from "./libraryRefresh.js";
import { createStore, type LoansStore } from "../../loansStore.js";
import type { LibraryClient, LibraryLoan } from "./library.js";
import type { LoanSyncQueue } from "../sync-loan-calendar/queue.js";
import type { CalendarClient } from "../../../../googleCalendarClient.js";

function loan(overrides: Partial<LibraryLoan> = {}): LibraryLoan {
  return {
    holdingId: 1,
    title: "Michał i 38",
    author: "Witek, Rafał (1971- ).",
    filiaId: 144,
    dateReturn: "2026-08-20T00:00:00",
    accountKey: null,
    accountLabel: null,
    ...overrides,
  };
}

function fakeLibraryClient(loans: LibraryLoan[], filiaNames: Map<number, string>): LibraryClient {
  return {
    async getCurrentLoans() {
      return loans;
    },
    async getFiliaNames() {
      return filiaNames;
    },
  };
}

function fakeSyncQueue(): LoanSyncQueue & { enqueued: number[] } {
  const enqueued: number[] = [];
  return {
    enqueued,
    async enqueue(holdingId) {
      enqueued.push(holdingId);
    },
  };
}

function fakeCalendar(): CalendarClient & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async createEvent() {
      throw new Error("not used in these tests");
    },
    async updateEvent() {
      throw new Error("not used in these tests");
    },
    async deleteEvent(eventId) {
      deleted.push(eventId);
    },
    async eventExists() {
      throw new Error("not used in these tests");
    },
  };
}

function recordingLog(): { log: (message: string) => void; messages: string[] } {
  const messages: string[] = [];
  return { messages, log: (message) => messages.push(message) };
}

const FILIA_NAMES = new Map([
  [143, "Filia nr 001 Biblioteka Manhattan"],
  [144, "Filia nr 002 Biblioteka Oliwska"],
]);

describe("refreshLibraryLoans", () => {
  let store: LoansStore;

  beforeEach(() => {
    store = createStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("upserts current loans into the store with their resolved filia name", async () => {
    const deps = {
      libraryClient: fakeLibraryClient([loan()], FILIA_NAMES),
      store,
      syncQueue: fakeSyncQueue(),
      calendar: fakeCalendar(),
    };

    await refreshLibraryLoans(deps);

    expect(store.getLoan(1)).toMatchObject({ filiaId: 144, filiaName: "Filia nr 002 Biblioteka Oliwska" });
  });

  it("falls back to a synthetic filia label for an unrecognized filiaId", async () => {
    const deps = {
      libraryClient: fakeLibraryClient([loan({ filiaId: 999 })], FILIA_NAMES),
      store,
      syncQueue: fakeSyncQueue(),
      calendar: fakeCalendar(),
    };

    await refreshLibraryLoans(deps);

    expect(store.getLoan(1)?.filiaName).toBe("Filia 999");
  });

  it("enqueues one sync job per current loan and reports the loan count", async () => {
    const syncQueue = fakeSyncQueue();
    const deps = {
      libraryClient: fakeLibraryClient([loan({ holdingId: 1 }), loan({ holdingId: 2 })], FILIA_NAMES),
      store,
      syncQueue,
      calendar: fakeCalendar(),
    };

    const result = await refreshLibraryLoans(deps);

    expect(syncQueue.enqueued).toEqual([1, 2]);
    expect(result.loanCount).toBe(2);
  });

  it("deletes a calendar event group once no current loan belongs to it any more", async () => {
    store.setCalendarEventGroup(144, "2026-08-20", "stale-event");
    const calendar = fakeCalendar();
    const deps = {
      libraryClient: fakeLibraryClient([], FILIA_NAMES), // no loans at all now
      store,
      syncQueue: fakeSyncQueue(),
      calendar,
    };

    const result = await refreshLibraryLoans(deps);

    expect(calendar.deleted).toEqual(["stale-event"]);
    expect(store.getCalendarEventGroup(144, "2026-08-20")).toBeNull();
    expect(result.removedCalendarEventGroups).toBe(1);
  });

  it("leaves a calendar event group alone while it still has current loans", async () => {
    store.setCalendarEventGroup(144, "2026-08-20", "still-active-event");
    const calendar = fakeCalendar();
    const deps = {
      libraryClient: fakeLibraryClient([loan({ filiaId: 144, dateReturn: "2026-08-20T00:00:00" })], FILIA_NAMES),
      store,
      syncQueue: fakeSyncQueue(),
      calendar,
    };

    const result = await refreshLibraryLoans(deps);

    expect(calendar.deleted).toEqual([]);
    expect(store.getCalendarEventGroup(144, "2026-08-20")).not.toBeNull();
    expect(result.removedCalendarEventGroups).toBe(0);
  });

  it("leaves progress notes for Bull Board's Logs tab (#348)", async () => {
    store.setCalendarEventGroup(144, "2026-07-01", "stale-event"); // no current loan is due this day

    const { log, messages } = recordingLog();
    const deps = {
      libraryClient: fakeLibraryClient([loan({ holdingId: 1 }), loan({ holdingId: 2 })], FILIA_NAMES),
      store,
      syncQueue: fakeSyncQueue(),
      calendar: fakeCalendar(),
      log,
    };

    await refreshLibraryLoans(deps);

    expect(messages).toEqual([
      "Fetching current loans and filia names from WBPG",
      "Fetched 2 current loan(s)",
      "Removed 1 stale calendar event group(s)",
      "Enqueued 2 sync-loan-calendar job(s)",
    ]);
  });

  it("doesn't throw when no log dep is given — defaults to a no-op", async () => {
    const deps = {
      libraryClient: fakeLibraryClient([loan()], FILIA_NAMES),
      store,
      syncQueue: fakeSyncQueue(),
      calendar: fakeCalendar(),
    };

    await expect(refreshLibraryLoans(deps)).resolves.toBeDefined();
  });
});
