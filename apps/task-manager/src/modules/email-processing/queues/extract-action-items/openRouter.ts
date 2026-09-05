// Calls OpenRouter's cloud, OpenAI-compatible chat completions API to extract action items and
// calendar events from an email (#238, extended to also extract events per the follow-up that
// removed the action item judge; moved off a local LM Studio server onto OpenRouter so
// `extract-action-items` can run in the cloud alongside every other queue instead of needing a Mac
// running LM Studio — see this queue's README section). This is the only model call the worker
// makes — see openRouterClient.ts for the HTTP plumbing this shares with nothing else today.
//
// Unlike the local LM Studio setup this replaced, email content now leaves the machine running
// this worker and is sent to OpenRouter — and, since no model is required in config, to whichever
// provider happens to serve the free model `pickFreeModel` (openRouterClient.ts) picks at the time
// — to be processed. This is a real trade-off against the "email content never leaves local
// processing" property the Mac-only worker used to guarantee, made in exchange for not needing a
// Mac online at all. Set `OPENROUTER_MODEL` (see server.ts) to pin a specific model/provider
// instead, if you'd rather know exactly where email content goes.
import type { ActionItem, CalendarEvent } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";
import {
  DEFAULT_OPENROUTER_BASE_URL,
  pickFreeModel,
  readSystemPrompt,
  requestStructuredCompletion,
  type OpenRouterConfig,
} from "./openRouterClient.js";

export interface ExtractionResult {
  actionItems: ActionItem[];
  events: CalendarEvent[];
}

export interface ActionItemExtractor {
  extract(email: EmailContent): Promise<ExtractionResult>;
}

export type { OpenRouterConfig };

// Kept in its own file (rather than inline) so it reads and edits like prose, not a
// string embedded in TS. Read once at module load — see openRouterClient.ts's readSystemPrompt
// for how this resolves both in dev and once built to dist/.
const systemPrompt = readSystemPrompt("extractActionItems.system.md");

const extractionJsonSchema = {
  type: "object",
  properties: {
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          // Constrains the model to ISO 8601 (`yyyy-mm-dd`) when it does emit a due date. Todoist's
          // `due_string` field (see todoistClient.ts) parses free-form text too, but a consistent
          // format here still avoids ambiguity a natural-language parser could get wrong — bare
          // `dd-mm-yyyy` could be misread as `mm-dd-yyyy`, for instance.
          // `pattern` is a no-op on `null` values — JSON Schema string keywords only apply to
          // string instances — so "no due date" is still expressed as `null`, not a magic string.
          dueDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
        required: ["title", "description", "dueDate"],
        additionalProperties: false,
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          // Required — see actionItem.ts's CalendarEvent comment: an event with no extractable
          // start time isn't emitted at all, so this field is never null on an event that is.
          startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          // Nullable — `pattern` is a no-op on `null` values, so "no end time/duration stated" is
          // still expressed as `null`, not a magic string, same as dueDate/startTime above.
          endTime: { type: ["string", "null"], pattern: "^\\d{2}:\\d{2}$" },
        },
        required: ["title", "description", "date", "startTime", "endTime"],
        additionalProperties: false,
      },
    },
  },
  required: ["actionItems", "events"],
  additionalProperties: false,
} as const;

function buildPrompt(email: EmailContent): string {
  return [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    "",
    email.body,
  ].join("\n");
}

function parseExtractionResult(parsed: unknown): ExtractionResult {
  const { actionItems, events } = parsed as { actionItems?: unknown; events?: unknown };
  if (!Array.isArray(actionItems)) {
    throw new Error("OpenRouter response was missing an actionItems array");
  }
  if (!Array.isArray(events)) {
    throw new Error("OpenRouter response was missing an events array");
  }

  return { actionItems: actionItems as ActionItem[], events: events as CalendarEvent[] };
}

export function createOpenRouterExtractor(config: OpenRouterConfig): ActionItemExtractor {
  const baseUrl = config.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  // Resolved at most once per extractor (i.e. once per worker process, since server.ts builds one
  // extractor at startup) rather than on every `extract()` call — a `/models` catalog fetch on
  // every job would be one more request competing against this same worker's already-tight
  // requests-per-minute budget (see worker.ts's limiter) for no benefit, since the catalog rarely
  // changes minute to minute. `config.model` bypasses discovery entirely for a pinned choice.
  let modelPromise: Promise<string> | undefined;
  function resolveModel(): Promise<string> {
    if (config.model) return Promise.resolve(config.model);
    if (!modelPromise) {
      modelPromise = pickFreeModel(baseUrl, config.apiKey, fetchImpl).catch((error) => {
        // Don't cache a rejection — a transient `/models` failure shouldn't permanently wedge
        // every future job for the rest of this process's life.
        modelPromise = undefined;
        throw error;
      });
    }
    return modelPromise;
  }

  return {
    async extract(email: EmailContent): Promise<ExtractionResult> {
      const model = await resolveModel();

      try {
        const parsed = await requestStructuredCompletion({
          baseUrl,
          apiKey: config.apiKey,
          model,
          fetchImpl,
          systemPrompt,
          userPrompt: buildPrompt(email),
          schemaName: "action_items_and_events",
          jsonSchema: extractionJsonSchema,
        });

        return parseExtractionResult(parsed);
      } catch (error) {
        // Self-healing for the auto-picked case: if this model was retired, repriced, or is
        // otherwise no longer usable, drop the cache so the *next* job re-runs discovery instead
        // of retrying the same broken choice for the rest of this process's life. A pinned
        // `config.model` never reaches here (`modelPromise` is never set for it above).
        if (!config.model) modelPromise = undefined;
        throw error;
      }
    },
  };
}
