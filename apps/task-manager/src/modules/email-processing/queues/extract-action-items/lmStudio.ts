// Calls LM Studio's local OpenAI-compatible server to extract action items and calendar events
// from an email (#238, extended to also extract events per the follow-up that removed the action
// item judge). Never leaves the Mac — `baseUrl` defaults to localhost, and this is the only model
// call the worker makes now that judging (a second LM Studio call) is gone — see
// lmStudioClient.ts for the HTTP plumbing this shares with nothing else today.
import type { ActionItem, CalendarEvent } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";
import {
  DEFAULT_LM_STUDIO_BASE_URL,
  readSystemPrompt,
  requestStructuredCompletion,
  type LmStudioConfig,
} from "./lmStudioClient.js";

export interface ExtractionResult {
  actionItems: ActionItem[];
  events: CalendarEvent[];
}

export interface ActionItemExtractor {
  extract(email: EmailContent): Promise<ExtractionResult>;
}

export type { LmStudioConfig };

// Kept in its own file (rather than inline) so it reads and edits like prose, not a
// string embedded in TS. Read once at module load — see lmStudioClient.ts's readSystemPrompt
// for how this resolves both in dev and inside the packaged production binary.
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
          // Constrains the model to ISO 8601 (`yyyy-mm-dd`) when it does emit a due date, so
          // downstream `toGoogleTasksDue` in googleTasksClient.ts (which parses via `new
          // Date(...)`, and only reliably understands this format — bare `dd-mm-yyyy` is either
          // rejected or silently misread as `mm-dd-yyyy`) gets something it can actually use.
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
    throw new Error("LM Studio response was missing an actionItems array");
  }
  if (!Array.isArray(events)) {
    throw new Error("LM Studio response was missing an events array");
  }

  return { actionItems: actionItems as ActionItem[], events: events as CalendarEvent[] };
}

export function createLmStudioExtractor(config: LmStudioConfig = {}): ActionItemExtractor {
  const baseUrl = config.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async extract(email: EmailContent): Promise<ExtractionResult> {
      const parsed = await requestStructuredCompletion({
        baseUrl,
        fetchImpl,
        systemPrompt,
        userPrompt: buildPrompt(email),
        schemaName: "action_items_and_events",
        jsonSchema: extractionJsonSchema,
      });

      return parseExtractionResult(parsed);
    },
  };
}
