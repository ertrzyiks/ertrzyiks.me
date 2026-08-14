import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, type LibraryLoanInput, type LoansStore } from "./loansStore.js";

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

describe("loansStore (in-memory)", () => {
  let store: LoansStore;

  beforeEach(() => {
    store = createStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns null for an untracked loan", () => {
    expect(store.getLoan(999)).toBeNull();
  });

  it("stores loans and reads them back with an updatedAt stamp", () => {
    store.replaceCurrentLoans([loanInput()]);

    const loan = store.getLoan(1);
    expect(loan).toMatchObject(loanInput());
    expect(typeof loan?.updatedAt).toBe("string");
  });

  it("replaceCurrentLoans removes loans no longer present (the book got returned)", () => {
    store.replaceCurrentLoans([loanInput({ holdingId: 1 }), loanInput({ holdingId: 2 })]);
    store.replaceCurrentLoans([loanInput({ holdingId: 1 })]);

    expect(store.getLoan(1)).not.toBeNull();
    expect(store.getLoan(2)).toBeNull();
  });

  it("replaceCurrentLoans updates fields on an already-tracked loan (e.g. a prolonged return date)", () => {
    store.replaceCurrentLoans([loanInput({ dateReturn: "2026-08-20T00:00:00" })]);
    store.replaceCurrentLoans([loanInput({ dateReturn: "2026-09-03T00:00:00" })]);

    expect(store.getLoan(1)?.dateReturn).toBe("2026-09-03T00:00:00");
  });

  it("listLoansInGroup returns every loan sharing the same filia and return-date day, including itself", () => {
    store.replaceCurrentLoans([
      loanInput({ holdingId: 1, filiaId: 143, dateReturn: "2026-08-17T00:00:00" }),
      loanInput({ holdingId: 2, filiaId: 143, dateReturn: "2026-08-17T00:00:00" }),
      loanInput({ holdingId: 3, filiaId: 143, dateReturn: "2026-08-18T00:00:00" }), // different day
      loanInput({ holdingId: 4, filiaId: 144, dateReturn: "2026-08-17T00:00:00" }), // different filia
    ]);

    const group = store.listLoansInGroup(1);

    expect(group.map((l) => l.holdingId)).toEqual([1, 2]);
  });

  it("listLoansInGroup returns an empty array for an untracked loan", () => {
    expect(store.listLoansInGroup(999)).toEqual([]);
  });

  it("listLoansInGroupKey looks a group up directly by filiaId + return date, with no loan required to exist yet", () => {
    store.replaceCurrentLoans([loanInput({ holdingId: 1, filiaId: 143, dateReturn: "2026-08-17T00:00:00" })]);

    expect(store.listLoansInGroupKey(143, "2026-08-17").map((l) => l.holdingId)).toEqual([1]);
    expect(store.listLoansInGroupKey(143, "2026-09-01")).toEqual([]);
  });

  it("has no calendar event group for a key that was never set", () => {
    expect(store.getCalendarEventGroup(143, "2026-08-17")).toBeNull();
  });

  it("sets and reads back a calendar event group", () => {
    store.setCalendarEventGroup(143, "2026-08-17", "google-event-1");

    expect(store.getCalendarEventGroup(143, "2026-08-17")).toMatchObject({
      filiaId: 143,
      returnDate: "2026-08-17",
      googleEventId: "google-event-1",
    });
  });

  it("setCalendarEventGroup overwrites the event id for an already-tracked group", () => {
    store.setCalendarEventGroup(143, "2026-08-17", "google-event-1");
    store.setCalendarEventGroup(143, "2026-08-17", "google-event-2");

    expect(store.getCalendarEventGroup(143, "2026-08-17")?.googleEventId).toBe("google-event-2");
  });

  it("deleteCalendarEventGroup removes the group", () => {
    store.setCalendarEventGroup(143, "2026-08-17", "google-event-1");
    store.deleteCalendarEventGroup(143, "2026-08-17");

    expect(store.getCalendarEventGroup(143, "2026-08-17")).toBeNull();
  });

  it("listCalendarEventGroups lists every tracked group", () => {
    store.setCalendarEventGroup(143, "2026-08-17", "google-event-1");
    store.setCalendarEventGroup(144, "2026-08-20", "google-event-2");

    expect(store.listCalendarEventGroups()).toEqual([
      { filiaId: 143, returnDate: "2026-08-17", googleEventId: "google-event-1" },
      { filiaId: 144, returnDate: "2026-08-20", googleEventId: "google-event-2" },
    ]);
  });

  it("replaceCurrentLoans leaves calendar_event_groups untouched — group cleanup is a separate step", () => {
    store.replaceCurrentLoans([loanInput({ holdingId: 1, filiaId: 143, dateReturn: "2026-08-17T00:00:00" })]);
    store.setCalendarEventGroup(143, "2026-08-17", "google-event-1");

    store.replaceCurrentLoans([]); // the book got returned

    expect(store.getCalendarEventGroup(143, "2026-08-17")).toMatchObject({ googleEventId: "google-event-1" });
  });
});
