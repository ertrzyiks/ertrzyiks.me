import { dayKeyOf } from "./dayPart.js";
import type { Event } from "./store.js";

export type DayBarStatus = "none" | "warning" | "downtime";

export interface DayBarEntry {
  dayKey: string;
  status: DayBarStatus;
}

/** "Last 2 weeks" — the top-of-page history bar on the public status page. */
export const DAY_BAR_LENGTH = 14;

const SEVERITY: Record<DayBarStatus, number> = { none: 0, warning: 1, downtime: 2 };

/** The calendar day `delta` days after `dayKey` ("YYYY-MM-DD"); negative `delta` goes backwards. */
function addDays(dayKey: string, delta: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Whether `event` was "happening" on `dayKey`: for a warning, the single day it occurred; for a
 * downtime, every day from its start through its end (or through `todayKey`, if still ongoing) —
 * so a multi-day outage colors every day it actually spanned, not just the day it started.
 */
function eventCoversDay(event: Event, dayKey: string, todayKey: string): boolean {
  const startDay = dayKeyOf(event.startsAt);
  if (event.type === "warning") return startDay === dayKey;

  const endDay = event.endsAt ? dayKeyOf(event.endsAt) : todayKey;
  return startDay <= dayKey && dayKey <= endDay;
}

/**
 * Builds the last `length` days (oldest first, `todayKey` last) with a status per day: 'downtime'
 * if any downtime covered that day, else 'warning' if any warning occurred that day, else 'none'.
 * Downtime always wins over warning, per spec — a day with both is shown as downtime (red).
 */
export function buildDayBar(
  events: Event[],
  todayKey: string,
  length: number = DAY_BAR_LENGTH,
): DayBarEntry[] {
  const entries: DayBarEntry[] = [];

  for (let offset = length - 1; offset >= 0; offset--) {
    const dayKey = addDays(todayKey, -offset);
    let status: DayBarStatus = "none";

    for (const event of events) {
      if (status === "downtime") break; // already at max severity for this day
      if (!eventCoversDay(event, dayKey, todayKey)) continue;

      const eventStatus: DayBarStatus = event.type === "downtime" ? "downtime" : "warning";
      if (SEVERITY[eventStatus] > SEVERITY[status]) status = eventStatus;
    }

    entries.push({ dayKey, status });
  }

  return entries;
}
