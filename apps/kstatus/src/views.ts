import { DAY_PART_LABELS, dayKeyOf, dayPartOf } from "./dayPart.js";
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
  header { margin-bottom: 2rem; }
  header p { color: #6b7280; margin-top: 0.25rem; }
  h1 { margin: 0; }
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
  }
  li.event--warning { border-color: #eab308; background: #fefce8; }
  li.event--downtime { border-color: #dc2626; background: #fef2f2; }
  .event-meta { font-size: 0.8rem; color: #6b7280; }
  .event-title { font-weight: 600; margin: 0.15rem 0; }
  .event-description { margin: 0.25rem 0 0; color: #374151; }
  .event-badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    margin-left: 0.4rem;
  }
  .event--warning .event-badge { background: #fde68a; color: #713f12; }
  .event--downtime .event-badge { background: #fecaca; color: #7f1d1d; }
  .empty { color: #6b7280; }
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
  .admin-event a { flex-shrink: 0; }
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
  const dayPartLabel = DAY_PART_LABELS[dayPartOf(event.startsAt)];
  const timeRange =
    event.type === "downtime"
      ? event.endsAt
        ? `${timeOf(event.startsAt)}–${timeOf(event.endsAt)}`
        : `${timeOf(event.startsAt)}–ongoing`
      : timeOf(event.startsAt);

  const body = `
      <div class="event-meta">${timeRange} <span class="event-badge">${escapeHtml(dayPartLabel)}</span></div>
      <p class="event-title">${escapeHtml(event.title)}</p>
      ${event.description ? `<p class="event-description">${escapeHtml(event.description)}</p>` : ""}`;

  if (!options.editable) {
    return `<li class="event event--${event.type}">${body}
    </li>`;
  }

  return `<li class="event event--${event.type}">
      <div class="admin-event">
        <div>${body}
        </div>
        <a href="/admin/events/${event.id}/edit">Edit</a>
      </div>
    </li>`;
}

export function renderStatusPage(events: Event[]): string {
  const body = `
<header>
  <h1>kstatus</h1>
  <p>Service status, updated as incidents happen.</p>
</header>
<main>
  ${eventListHtml(events)}
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
