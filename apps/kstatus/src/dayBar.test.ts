import { describe, expect, it } from "vitest";
import type { Event } from "./store.js";
import { buildDayBar } from "./dayBar.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    type: "warning",
    title: "t",
    description: null,
    startsAt: "2026-08-09T10:00",
    endsAt: null,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

const TODAY = "2026-08-09";

describe("buildDayBar", () => {
  it("defaults to the last 14 days, oldest first, ending at today", () => {
    const entries = buildDayBar([], TODAY);

    expect(entries).toHaveLength(14);
    expect(entries[0].dayKey).toBe("2026-07-27");
    expect(entries[13].dayKey).toBe(TODAY);
  });

  it("marks every day 'none' with no events", () => {
    const entries = buildDayBar([], TODAY, 3);
    expect(entries.map((e) => e.status)).toEqual(["none", "none", "none"]);
  });

  it("marks the day a warning started as 'warning'", () => {
    const events = [makeEvent({ type: "warning", startsAt: "2026-08-08T09:00" })];
    const entries = buildDayBar(events, TODAY, 3);

    expect(entries).toEqual([
      { dayKey: "2026-08-07", status: "none" },
      { dayKey: "2026-08-08", status: "warning" },
      { dayKey: "2026-08-09", status: "none" },
    ]);
  });

  it("marks every day a downtime spans, not just its start day", () => {
    const events = [
      makeEvent({
        type: "downtime",
        startsAt: "2026-08-07T23:00",
        endsAt: "2026-08-08T01:00",
      }),
    ];
    const entries = buildDayBar(events, TODAY, 4);

    expect(entries.map((e) => e.status)).toEqual(["none", "downtime", "downtime", "none"]);
  });

  it("marks today (and every day since) 'downtime' for a still-ongoing outage", () => {
    const events = [makeEvent({ type: "downtime", startsAt: "2026-08-08T23:00", endsAt: null })];
    const entries = buildDayBar(events, TODAY, 3);

    expect(entries.map((e) => e.status)).toEqual(["none", "downtime", "downtime"]);
  });

  it("prefers downtime over warning on a day that had both", () => {
    const events = [
      makeEvent({ id: 1, type: "warning", startsAt: "2026-08-09T08:00" }),
      makeEvent({ id: 2, type: "downtime", startsAt: "2026-08-09T09:00", endsAt: "2026-08-09T09:30" }),
    ];
    const entries = buildDayBar(events, TODAY, 1);

    expect(entries).toEqual([{ dayKey: TODAY, status: "downtime" }]);
  });

  it("ignores events outside the requested window", () => {
    const events = [makeEvent({ startsAt: "2026-01-01T00:00" })];
    const entries = buildDayBar(events, TODAY, 3);

    expect(entries.every((e) => e.status === "none")).toBe(true);
  });
});
