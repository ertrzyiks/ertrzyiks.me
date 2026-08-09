import { describe, expect, it } from "vitest";
import { buildDayBar } from "./dayBar.js";
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

const TODAY = "2026-08-09";

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
  it("renders a day heading, the event title, and its time — no day-part badge", () => {
    const events = [makeEvent({ startsAt: "2026-08-09T09:30" })];
    const html = renderStatusPage(events, buildDayBar(events, TODAY));

    expect(html).toContain("Sunday, August 9, 2026");
    expect(html).toContain("09:30");
    expect(html).toContain("Elevated latency");
    expect(html).not.toContain("Morning");
    expect(html).not.toContain("Afternoon");
    expect(html).not.toContain("Evening");
    expect(html).toContain(`class="event event--warning"`);
  });

  it("links to the admin area", () => {
    const html = renderStatusPage([], buildDayBar([], TODAY));
    expect(html).toContain(`class="button-link" href="/admin"`);
  });

  it("gives event boxes an explicit text color, not left to the color-scheme UA default", () => {
    // Regression guard: li.event's background is a fixed light severity tint in both color
    // schemes, so its text must never be left to inherit color-scheme's UA default — that
    // flips to a near-white foreground under a dark preference and becomes unreadable against
    // these always-light backgrounds (the "very bright text on light background" bug).
    const html = renderStatusPage([], buildDayBar([], TODAY));
    expect(html).toMatch(/li\.event\s*\{[^}]*color:\s*#111827/);
    expect(html).toMatch(/\.event-title\s*\{[^}]*color:\s*#111827/);
  });

  it("renders the title before the time/description (prominent heading)", () => {
    const events = [
      makeEvent({
        title: "Elevated latency",
        description: "Investigating",
        startsAt: "2026-08-09T09:30",
      }),
    ];
    const html = renderStatusPage(events, buildDayBar(events, TODAY));

    const titleIndex = html.indexOf("Elevated latency");
    const descriptionIndex = html.indexOf("Investigating");
    expect(titleIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(descriptionIndex);
  });

  it("renders a downtime event's start–end range and downtime styling", () => {
    const events = [
      makeEvent({
        type: "downtime",
        title: "Database outage",
        startsAt: "2026-08-09T10:00",
        endsAt: "2026-08-09T10:45",
      }),
    ];
    const html = renderStatusPage(events, buildDayBar(events, TODAY));

    expect(html).toContain("10:00–10:45");
    expect(html).toContain(`class="event event--downtime"`);
  });

  it("marks an ongoing downtime (no end time) rather than showing a blank end", () => {
    const events = [makeEvent({ type: "downtime", startsAt: "2026-08-09T10:00", endsAt: null })];
    const html = renderStatusPage(events, buildDayBar(events, TODAY));

    expect(html).toContain("10:00–ongoing");
  });

  it("escapes a malicious title/description instead of injecting markup", () => {
    const events = [
      makeEvent({
        title: `<img src=x onerror=alert(1)>`,
        description: `</p><script>evil()</script>`,
      }),
    ];
    const html = renderStatusPage(events, buildDayBar(events, TODAY));

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("shows an empty state when there are no events", () => {
    const html = renderStatusPage([], buildDayBar([], TODAY));
    expect(html).toContain("No incidents reported.");
  });

  it("does not render an Edit link (public page)", () => {
    const events = [makeEvent()];
    const html = renderStatusPage(events, buildDayBar(events, TODAY));
    expect(html).not.toContain("/admin/events/");
  });

  describe("day bar", () => {
    it("renders one cell per day, colored by status", () => {
      const events = [
        makeEvent({ id: 1, type: "warning", startsAt: "2026-08-08T09:00" }),
        makeEvent({ id: 2, type: "downtime", startsAt: "2026-08-09T09:00", endsAt: "2026-08-09T09:30" }),
      ];
      const html = renderStatusPage(events, buildDayBar(events, TODAY, 3));

      expect(html).toContain(`Last 3 days`);
      expect(html).toContain(`class="day-bar-cell"`); // 2026-08-07: none
      expect(html).toContain(`class="day-bar-cell day-bar-cell--warning"`); // 2026-08-08
      expect(html).toContain(`class="day-bar-cell day-bar-cell--downtime"`); // 2026-08-09
    });

    it("includes a tooltip with the date and status", () => {
      const events = [makeEvent({ type: "warning", startsAt: "2026-08-09T09:00" })];
      const html = renderStatusPage(events, buildDayBar(events, TODAY, 1));

      expect(html).toContain(`title="Sunday, August 9, 2026: Warning"`);
    });

    it("renders a green (no-incident) cell for a day with no events", () => {
      const html = renderStatusPage([], buildDayBar([], TODAY, 1));
      expect(html).toContain(`title="Sunday, August 9, 2026: No incidents"`);
    });
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
