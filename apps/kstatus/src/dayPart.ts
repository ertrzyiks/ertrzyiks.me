export type DayPart = "morning" | "afternoon" | "evening";

export const DAY_PART_ORDER: readonly DayPart[] = ["morning", "afternoon", "evening"];

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):\d{2}/;

interface ParsedTimestamp {
  dayKey: string;
  hour: number;
}

function parseTimestamp(timestamp: string): ParsedTimestamp {
  const match = TIMESTAMP_PATTERN.exec(timestamp);
  if (!match) {
    throw new Error(`Invalid timestamp (expected "YYYY-MM-DDTHH:mm"): ${timestamp}`);
  }

  const [, dayKey, hourStr] = match;
  return { dayKey, hour: Number(hourStr) };
}

/**
 * Classifies a timestamp into one of the day's three parts: morning [0, 11), afternoon [11, 17),
 * evening [17, 24).
 *
 * Every timestamp in this app is a naive local wall-clock string ("YYYY-MM-DDTHH:mm", as produced
 * by an `<input type="datetime-local">`) with no timezone attached — it's meaningful only as "what
 * the clock read when the admin typed it in", not as an instant in time. This deliberately reads
 * the hour straight out of the string rather than going through `Date`, which would silently
 * reinterpret that wall-clock text in whichever timezone the process happens to run in.
 */
export function dayPartOf(timestamp: string): DayPart {
  const { hour } = parseTimestamp(timestamp);
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Extracts the "YYYY-MM-DD" calendar day a timestamp falls on, for grouping. */
export function dayKeyOf(timestamp: string): string {
  return parseTimestamp(timestamp).dayKey;
}

/** Whether a string looks like a naive local timestamp, as opposed to throwing to find out. */
export function isValidTimestamp(value: string): boolean {
  return TIMESTAMP_PATTERN.test(value);
}
