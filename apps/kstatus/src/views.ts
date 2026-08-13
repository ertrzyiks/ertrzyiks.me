import { type DayBarEntry, type DayBarStatus } from "./dayBar.js";
import { dayKeyOf } from "./dayPart.js";
import type { Event, EventType } from "./store.js";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes a value for safe use in both HTML text content and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

export interface DayGroup {
  dayKey: string;
  events: Event[];
}

/**
 * Buckets a list of events by calendar day, preserving input order within and across groups.
 * Relies on the caller (Store) having already sorted `events` so same-day events are contiguous
 * — grouping here is a single linear scan rather than a re-sort.
 */
export function groupEventsByDay(events: Event[]): DayGroup[] {
  const groups: DayGroup[] = [];

  for (const event of events) {
    const dayKey = dayKeyOf(event.startsAt);
    const currentGroup = groups[groups.length - 1];

    if (currentGroup && currentGroup.dayKey === dayKey) {
      currentGroup.events.push(event);
    } else {
      groups.push({ dayKey, events: [event] });
    }
  }

  return groups;
}

const DAY_HEADING_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC", // dayKey is a naive "YYYY-MM-DD" — anchoring to UTC keeps this deterministic
  // regardless of the server process's local timezone, without claiming the date means anything
  // in UTC specifically.
});

export function formatDayHeading(dayKey: string): string {
  return DAY_HEADING_FORMATTER.format(new Date(`${dayKey}T00:00:00Z`));
}

/** Pulls "HH:mm" straight out of a naive local timestamp — see dayPart.ts. */
function timeOf(timestamp: string): string {
  return timestamp.slice(11, 16);
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 42rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
    line-height: 1.5;
  }
  header { margin-bottom: 2rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  header p { color: #6b7280; margin-top: 0.25rem; }
  h1 { margin: 0; }
  .button-link {
    flex-shrink: 0;
    font: inherit;
    font-size: 0.85rem;
    padding: 0.45rem 0.9rem;
    border-radius: 0.25rem;
    background: #111827;
    color: white;
    text-decoration: none;
    white-space: nowrap;
  }
  h2.day-heading {
    font-size: 1rem;
    font-weight: 600;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 0.35rem;
    margin: 2rem 0 1rem;
  }
  ul.events { list-style: none; margin: 0; padding: 0; }
  li.event {
    border-left: 4px solid;
    border-radius: 0.25rem;
    padding: 0.6rem 0.85rem;
    margin-bottom: 0.75rem;
    background: #f9fafb;
    /* This background is a deliberately light severity tint in both color schemes — it never
       inverts for dark mode — so its text can't be left to inherit color-scheme's UA default,
       which flips to a near-white foreground under a dark preference and becomes close to
       unreadable against these light backgrounds. Set explicitly here so every child (title,
       meta, description) starts from a color guaranteed to contrast against this box. */
    color: #111827;
  }
  li.event--warning { border-color: #eab308; background: #fefce8; }
  li.event--downtime { border-color: #dc2626; background: #fef2f2; }
  .event-title { font-size: 1.05rem; font-weight: 700; margin: 0; color: #111827; }
  .event-meta { font-size: 0.8rem; color: #6b7280; margin: 0.15rem 0 0; }
  .event-description { margin: 0.35rem 0 0; color: #374151; }
  .empty { color: #6b7280; }
  .day-bar-section { margin-bottom: 2.5rem; }
  .day-bar-heading { font-size: 0.85rem; color: #6b7280; margin: 0 0 0.5rem; }
  .day-bar { display: flex; gap: 0.2rem; }
  .day-bar-cell {
    flex: 1;
    height: 1.75rem;
    border-radius: 0.2rem;
    background: #22c55e;
  }
  .day-bar-cell--warning { background: #eab308; }
  .day-bar-cell--downtime { background: #dc2626; }
  .day-bar-legend { display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.75rem; color: #6b7280; }
  .day-bar-legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
  .day-bar-legend i { width: 0.6rem; height: 0.6rem; border-radius: 999px; display: inline-block; }
  .day-bar-legend i.none { background: #22c55e; }
  .day-bar-legend i.warning { background: #eab308; }
  .day-bar-legend i.downtime { background: #dc2626; }
  form.event-form { display: grid; gap: 0.75rem; max-width: 32rem; margin-bottom: 2.5rem; }
  form.event-form label { display: grid; gap: 0.25rem; font-size: 0.9rem; }
  form.event-form input, form.event-form select, form.event-form textarea {
    font: inherit;
    padding: 0.4rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
  }
  form.event-form button {
    justify-self: start;
    font: inherit;
    padding: 0.45rem 1rem;
    border: none;
    border-radius: 0.25rem;
    background: #111827;
    color: white;
    cursor: pointer;
  }
  .error { color: #b91c1c; margin-bottom: 1rem; }
  .admin-event { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .admin-event-actions { display: flex; align-items: baseline; gap: 0.75rem; flex-shrink: 0; }
  .admin-event-actions form { margin: 0; }
  .link-button {
    font: inherit;
    font-size: 1em;
    color: #b91c1c;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }
  section.add-event { margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 1px solid #e5e7eb; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

function eventListHtml(events: Event[], options: { editable: boolean } = { editable: false }): string {
  if (events.length === 0) {
    return `<p class="empty">No incidents reported.</p>`;
  }

  const dayGroups = groupEventsByDay(events);

  return dayGroups
    .map(
      (group) => `
<section>
  <h2 class="day-heading">${escapeHtml(formatDayHeading(group.dayKey))}</h2>
  <ul class="events">
    ${group.events.map((event) => eventItemHtml(event, options)).join("\n    ")}
  </ul>
</section>`,
    )
    .join("\n");
}

function eventItemHtml(event: Event, options: { editable: boolean }): string {
  const timeRange =
    event.type === "downtime"
      ? event.endsAt
        ? `${timeOf(event.startsAt)}–${timeOf(event.endsAt)}`
        : `${timeOf(event.startsAt)}–ongoing`
      : timeOf(event.startsAt);

  const body = `
      <p class="event-title">${escapeHtml(event.title)}</p>
      <div class="event-meta">${timeRange}</div>
      ${event.description ? `<p class="event-description">${escapeHtml(event.description)}</p>` : ""}`;

  if (!options.editable) {
    return `<li class="event event--${event.type}">${body}
    </li>`;
  }

  return `<li class="event event--${event.type}">
      <div class="admin-event">
        <div>${body}
        </div>
        <div class="admin-event-actions">
          <a href="/admin/events/${event.id}/edit">Edit</a>
          <form method="post" action="/admin/events/${event.id}/delete" onsubmit="return confirm('Remove this event?')">
            <button type="submit" class="link-button">Remove</button>
          </form>
        </div>
      </div>
    </li>`;
}

/**
 * Renders the public status page's day-by-day stream over exactly the days covered by `dayBar` —
 * unlike `eventListHtml` (which silently skips any day with nothing to show), every one of those
 * days gets a heading, and a day with no events for it gets an explicit "No events, all good."
 * placeholder instead of being omitted. `dayBar` is oldest-first (see buildDayBar); reversed here
 * so the stream reads newest day first, matching the rest of the page.
 */
function eventStreamHtml(events: Event[], dayBar: DayBarEntry[]): string {
  const eventsByDay = new Map(groupEventsByDay(events).map((group) => [group.dayKey, group.events]));

  return [...dayBar]
    .reverse()
    .map((entry) => {
      const dayEvents = eventsByDay.get(entry.dayKey);
      const content = dayEvents
        ? `<ul class="events">
    ${dayEvents.map((event) => eventItemHtml(event, { editable: false })).join("\n    ")}
  </ul>`
        : `<p class="empty">No events, all good.</p>`;

      return `
<section>
  <h2 class="day-heading">${escapeHtml(formatDayHeading(entry.dayKey))}</h2>
  ${content}
</section>`;
    })
    .join("\n");
}

const DAY_BAR_STATUS_LABELS: Record<DayBarStatus, string> = {
  none: "No incidents",
  warning: "Warning",
  downtime: "Downtime",
};

function dayBarHtml(entries: DayBarEntry[]): string {
  const cells = entries
    .map((entry) => {
      const label = DAY_BAR_STATUS_LABELS[entry.status];
      const modifier = entry.status === "none" ? "" : ` day-bar-cell--${entry.status}`;
      const title = `${formatDayHeading(entry.dayKey)}: ${label}`;
      return `<div class="day-bar-cell${modifier}" title="${escapeHtml(title)}"></div>`;
    })
    .join("\n    ");

  return `
<section class="day-bar-section">
  <p class="day-bar-heading">Last ${entries.length} days</p>
  <div class="day-bar">
    ${cells}
  </div>
  <div class="day-bar-legend">
    <span><i class="none"></i> No incidents</span>
    <span><i class="warning"></i> Warning</span>
    <span><i class="downtime"></i> Downtime</span>
  </div>
</section>`;
}

export function renderStatusPage(events: Event[], dayBar: DayBarEntry[]): string {
  const body = `
<header>
  <div>
    <h1>kstatus</h1>
    <p>Service status, updated as incidents happen.</p>
  </div>
  <a class="button-link" href="/admin">Admin</a>
</header>
<main>
  ${dayBarHtml(dayBar)}
  ${eventStreamHtml(events, dayBar)}
</main>`;

  return layout("Status", body);
}

export interface EventFormValues {
  type: EventType;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}

export const EMPTY_EVENT_FORM_VALUES: EventFormValues = {
  type: "warning",
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
};

export function eventToFormValues(event: Event): EventFormValues {
  return {
    type: event.type,
    title: event.title,
    description: event.description ?? "",
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? "",
  };
}

function eventFormHtml(params: {
  action: string;
  submitLabel: string;
  values: EventFormValues;
}): string {
  const { action, submitLabel, values } = params;

  return `<form class="event-form" method="post" action="${escapeHtml(action)}">
      <label>Type
        <select name="type">
          <option value="warning"${values.type === "warning" ? " selected" : ""}>Warning</option>
          <option value="downtime"${values.type === "downtime" ? " selected" : ""}>Downtime</option>
        </select>
      </label>
      <label>Title
        <input type="text" name="title" required value="${escapeHtml(values.title)}" />
      </label>
      <label>Description (optional)
        <textarea name="description" rows="3">${escapeHtml(values.description)}</textarea>
      </label>
      <label>Start time
        <input type="datetime-local" name="startsAt" required value="${escapeHtml(values.startsAt)}" />
      </label>
      <label>End time (downtime only — leave blank while ongoing)
        <input type="datetime-local" name="endsAt" value="${escapeHtml(values.endsAt)}" />
      </label>
      <button type="submit">${escapeHtml(submitLabel)}</button>
    </form>`;
}

export function renderAdminPage(params: {
  events: Event[];
  values?: EventFormValues;
  error?: string;
}): string {
  const values = params.values ?? EMPTY_EVENT_FORM_VALUES;

  const body = `
<header>
  <h1>kstatus admin</h1>
  <p><a href="/">View public status page</a></p>
</header>
<main>
  <section class="add-event">
    <h2 class="day-heading">Add event</h2>
    ${params.error ? `<p class="error">${escapeHtml(params.error)}</p>` : ""}
    ${eventFormHtml({ action: "/admin/events", submitLabel: "Add event", values })}
  </section>
  <section>
    <h2 class="day-heading">Last 2 days</h2>
    ${eventListHtml(params.events, { editable: true })}
  </section>
</main>`;

  return layout("Admin — kstatus", body);
}

export function renderEditEventPage(params: {
  id: number;
  values: EventFormValues;
  error?: string;
}): string {
  const body = `
<header>
  <h1>Edit event</h1>
  <p><a href="/admin">Back to admin</a></p>
</header>
<main>
  ${params.error ? `<p class="error">${escapeHtml(params.error)}</p>` : ""}
  ${eventFormHtml({
    action: `/admin/events/${params.id}/edit`,
    submitLabel: "Save changes",
    values: params.values,
  })}
</main>`;

  return layout("Edit event — kstatus", body);
}
