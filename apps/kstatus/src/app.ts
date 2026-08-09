import formbody from "@fastify/formbody";
import Fastify, { type FastifyInstance } from "fastify";
import { isValidBasicAuth } from "./auth.js";
import type { AdminBasicAuth } from "./config.js";
import { buildDayBar } from "./dayBar.js";
import { dayKeyOf, isValidTimestamp } from "./dayPart.js";
import type { Event, EventInput, EventType, Store } from "./store.js";
import {
  type EventFormValues,
  eventToFormValues,
  renderAdminPage,
  renderEditEventPage,
  renderStatusPage,
} from "./views.js";

const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

type ParseResult = { ok: true; input: EventInput } | { ok: false; error: string };

function parseEventInput(body: Record<string, unknown>): ParseResult {
  const type: unknown = body.type;
  if (type !== "warning" && type !== "downtime") {
    return { ok: false, error: "Type must be either warning or downtime" };
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return { ok: false, error: "Title is required" };
  }

  const startsAt = typeof body.startsAt === "string" ? body.startsAt : "";
  if (!isValidTimestamp(startsAt)) {
    return { ok: false, error: "Start time is required" };
  }

  const descriptionRaw = typeof body.description === "string" ? body.description.trim() : "";
  const description = descriptionRaw.length > 0 ? descriptionRaw : null;

  // A warning is always a single-time event — any endsAt submitted alongside type=warning (e.g.
  // a stale form field from switching the select) is silently dropped rather than rejected.
  const endsAtRaw = typeof body.endsAt === "string" ? body.endsAt.trim() : "";
  let endsAt: string | null = null;

  if (type === "downtime" && endsAtRaw.length > 0) {
    if (!isValidTimestamp(endsAtRaw)) {
      return { ok: false, error: "End time is invalid" };
    }
    // Comparable lexically: both are "YYYY-MM-DDTHH:mm" strings, so string order matches
    // chronological order.
    if (endsAtRaw <= startsAt) {
      return { ok: false, error: "End time must be after the start time" };
    }
    endsAt = endsAtRaw;
  }

  return { ok: true, input: { type, title, description, startsAt, endsAt } };
}

function formValuesFromBody(body: Record<string, unknown> | undefined): EventFormValues {
  const source = body ?? {};
  const type: EventType = source.type === "downtime" ? "downtime" : "warning";

  return {
    type,
    title: typeof source.title === "string" ? source.title : "",
    description: typeof source.description === "string" ? source.description : "",
    startsAt: typeof source.startsAt === "string" ? source.startsAt : "",
    endsAt: typeof source.endsAt === "string" ? source.endsAt : "",
  };
}

function defaultNow(): string {
  // UTC "YYYY-MM-DDTHH:mm" — only used as the cutoff for the admin page's "last 2 days" filter,
  // not stored anywhere, so it doesn't need to match the timezone an admin's browser used when
  // typing a given event's own startsAt.
  return new Date().toISOString().slice(0, 16);
}

/**
 * @param now Supplies the current naive timestamp used to compute the admin page's "last 2 days"
 *   cutoff (Store.listAdminEvents). Injectable so tests don't depend on the real clock.
 */
export function createApp(
  store: Store,
  adminBasicAuth: AdminBasicAuth | null,
  now: () => string = defaultNow,
): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.register(formbody);

  app.get("/", async (_request, reply) => {
    reply.header("Content-Type", HTML_CONTENT_TYPE);
    const events = store.listEvents();
    const todayKey = dayKeyOf(now());
    return renderStatusPage(events, buildDayBar(events, todayKey));
  });

  // Scoped to this encapsulated plugin (rather than added on `app` directly) so the Basic Auth
  // hook only ever guards these routes, never the public status page above.
  app.register(async (admin) => {
    if (adminBasicAuth) {
      admin.addHook("onRequest", async (request, reply) => {
        if (!isValidBasicAuth(request.headers.authorization, adminBasicAuth)) {
          reply
            .code(401)
            .header("WWW-Authenticate", 'Basic realm="kstatus admin"')
            .send("Unauthorized");
        }
      });
    }
    // adminBasicAuth is null whenever either env var is unset (see config.ts) — in that case no
    // hook is registered at all, so /admin is reachable with no auth prompt, as intended in dev.

    admin.get("/admin", async (_request, reply) => {
      reply.header("Content-Type", HTML_CONTENT_TYPE);
      return renderAdminPage({ events: store.listAdminEvents(now()) });
    });

    admin.post<{ Body: Record<string, unknown> }>("/admin/events", async (request, reply) => {
      const parsed = parseEventInput(request.body ?? {});
      if (!parsed.ok) {
        reply.code(400).header("Content-Type", HTML_CONTENT_TYPE);
        return renderAdminPage({
          events: store.listAdminEvents(now()),
          values: formValuesFromBody(request.body),
          error: parsed.error,
        });
      }

      store.createEvent(parsed.input);
      return reply.redirect("/admin", 303);
    });

    admin.get<{ Params: { id: string } }>("/admin/events/:id/edit", async (request, reply) => {
      const event = findEvent(store, request.params.id);
      if (!event) return reply.code(404).send("Not found");

      reply.header("Content-Type", HTML_CONTENT_TYPE);
      return renderEditEventPage({ id: event.id, values: eventToFormValues(event) });
    });

    admin.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
      "/admin/events/:id/edit",
      async (request, reply) => {
        const id = Number(request.params.id);
        if (!Number.isInteger(id)) return reply.code(404).send("Not found");

        const parsed = parseEventInput(request.body ?? {});
        if (!parsed.ok) {
          reply.code(400).header("Content-Type", HTML_CONTENT_TYPE);
          return renderEditEventPage({
            id,
            values: formValuesFromBody(request.body),
            error: parsed.error,
          });
        }

        const updated = store.updateEvent(id, parsed.input);
        if (!updated) return reply.code(404).send("Not found");

        return reply.redirect("/admin", 303);
      },
    );
  });

  return app;
}

function findEvent(store: Store, rawId: string): Event | null {
  const id = Number(rawId);
  return Number.isInteger(id) ? store.getEvent(id) : null;
}
