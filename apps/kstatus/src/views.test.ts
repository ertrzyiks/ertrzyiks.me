import { describe, expect, it } from "vitest";
import type { Event } from "./store.js";
import {
  escapeHtml,
  eventToFormValues,
  formatDayHeading,
  groupEventsByDay,
  renderAdminPage,
  renderEditEventPage,
  renderStatusPage,
} from "./views.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    type: "warning",
    title: "Elevated latency",
    description: null,
    startsAt: "2026-08-09T10:00",
    endsAt: null,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x & 'y'")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x &amp; &#39;y&#39;&quot;)&lt;/script&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Database outage")).toBe("Database outage");
  });
});

describe("groupEventsByDay", () => {
  it("groups contiguous same-day events without reordering", () => {
    const events = [
      makeEvent({ id: 1, startsAt: "2026-08-09T18:00" }),
      makeEvent({ id: 2, startsAt: "2026-08-09T09:00" }),
      makeEvent({ id: 3, startsAt: "2026-08-08T09:00" }),
    ];

    const groups = groupEventsByDay(events);

    expect(groups).toEqual([
      { dayKey: "2026-08-09", events: [events[0], events[1]] },
      { dayKey: "2026-08-08", events: [events[2]] },
    ]);
  });

  it("returns an empty array for no events", () => {
    expect(groupEventsByDay([])).toEqual([]);
  });
});

describe("formatDayHeading", () => {
  it("formats a dayKey as a full weekday/date, independent of process timezone", () => {
    expect(formatDayHeading("2026-08-09")).toBe("Sunday, August 9, 2026");
  });
});

describe("eventToFormValues", () => {
  it("maps null description/endsAt to empty strings", () => {
    expect(eventToFormValues(makeEvent())).toEqual({
      type: "warning",
      title: "Elevated latency",
      description: "",
      startsAt: "2026-08-09T10:00",
      endsAt: "",
    });
  });

  it("passes through a set description/endsAt", () => {
    const event = makeEvent({
      type: "downtime",
      description: "Primary DB unreachable",
      endsAt: "2026-08-09T11:00",
    });

    expect(eventToFormValues(event)).toMatchObject({
      description: "Primary DB unreachable",
      endsAt: "2026-08-09T11:00",
    });
  });
});

describe("renderStatusPage", () => {
  it("renders a day heading and the event title/time/day-part badge", () => {
    const html = renderStatusPage([makeEvent({ startsAt: "2026-08-09T09:30" })]);

    expect(html).toContain("Sunday, August 9, 2026");
    expect(html).toContain("09:30");
    expect(html).toContain("Elevated latency");
    expect(html).toContain("Morning");
    expect(html).toContain(`class="event event--warning"`);
  });

  it("renders a downtime event's start–end range and downtime styling", () => {
    const html = renderStatusPage([
      makeEvent({
        type: "downtime",
        title: "Database outage",
        startsAt: "2026-08-09T10:00",
        endsAt: "2026-08-09T10:45",
      }),
    ]);

    expect(html).toContain("10:00–10:45");
    expect(html).toContain(`class="event event--downtime"`);
  });

  it("marks an ongoing downtime (no end time) rather than showing a blank end", () => {
    const html = renderStatusPage([
      makeEvent({ type: "downtime", startsAt: "2026-08-09T10:00", endsAt: null }),
    ]);

    expect(html).toContain("10:00–ongoing");
  });

  it("escapes a malicious title/description instead of injecting markup", () => {
    const html = renderStatusPage([
      makeEvent({
        title: `<img src=x onerror=alert(1)>`,
        description: `</p><script>evil()</script>`,
      }),
    ]);

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("shows an empty state when there are no events", () => {
    const html = renderStatusPage([]);
    expect(html).toContain("No incidents reported.");
  });

  it("does not render an Edit link (public page)", () => {
    const html = renderStatusPage([makeEvent()]);
    expect(html).not.toContain("/admin/events/");
  });
});

describe("renderAdminPage", () => {
  it("renders the add-event form and an Edit link per event", () => {
    const html = renderAdminPage({ events: [makeEvent({ id: 42 })] });

    expect(html).toContain(`action="/admin/events"`);
    expect(html).toContain(`href="/admin/events/42/edit"`);
  });

  it("renders a submitted error message", () => {
    const html = renderAdminPage({ events: [], error: "Title is required" });
    expect(html).toContain("Title is required");
  });

  it("escapes event titles in the editable list", () => {
    const html = renderAdminPage({
      events: [makeEvent({ id: 1, title: `<b>bold</b>` })],
    });

    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });
});

describe("renderEditEventPage", () => {
  it("prefills the form with the event's current values", () => {
    const html = renderEditEventPage({
      id: 7,
      values: {
        type: "downtime",
        title: "Database outage",
        description: "Primary DB unreachable",
        startsAt: "2026-08-09T10:00",
        endsAt: "2026-08-09T10:45",
      },
    });

    expect(html).toContain(`action="/admin/events/7/edit"`);
    expect(html).toContain(`value="Database outage"`);
    expect(html).toContain(`value="2026-08-09T10:00"`);
    expect(html).toContain(`value="2026-08-09T10:45"`);
    expect(html).toContain(">Primary DB unreachable<");
    expect(html).toContain(`value="downtime" selected`);
  });
});
