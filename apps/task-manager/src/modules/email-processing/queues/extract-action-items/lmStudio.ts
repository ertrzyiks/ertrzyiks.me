// Calls LM Studio's local OpenAI-compatible server to extract action items from
// an email (#238). Never leaves the Mac — `baseUrl` defaults to localhost, and this
// is one of two model calls the worker makes (the other, actionItemJudge.ts, judges what this
// one extracts) — see lmStudioClient.ts for the HTTP plumbing both share.
import type { ActionItem } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";
import {
  DEFAULT_LM_STUDIO_BASE_URL,
  readSystemPrompt,
  requestStructuredCompletion,
  type LmStudioConfig,
} from "./lmStudioClient.js";

export interface ActionItemExtractor {
  extract(email: EmailContent): Promise<ActionItem[]>;
}

export type { LmStudioConfig };

// Kept in its own file (rather than inline) so it reads and edits like prose, not a
// string embedded in TS. Read once at module load — see lmStudioClient.ts's readSystemPrompt
// for how this resolves both in dev and inside the packaged production binary.
const systemPrompt = readSystemPrompt("extractActionItems.system.md");

const actionItemsJsonSchema = {
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
  },
  required: ["actionItems"],
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

function parseActionItems(parsed: unknown): ActionItem[] {
  const actionItems = (parsed as { actionItems?: unknown }).actionItems;
  if (!Array.isArray(actionItems)) {
    throw new Error("LM Studio response was missing an actionItems array");
  }

  return actionItems as ActionItem[];
}

export function createLmStudioExtractor(config: LmStudioConfig = {}): ActionItemExtractor {
  const baseUrl = config.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async extract(email: EmailContent): Promise<ActionItem[]> {
      const parsed = await requestStructuredCompletion({
        baseUrl,
        fetchImpl,
        systemPrompt,
        userPrompt: buildPrompt(email),
        schemaName: "action_items",
        jsonSchema: actionItemsJsonSchema,
      });

      return parseActionItems(parsed);
    },
  };
}
