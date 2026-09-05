// Calls OpenRouter's cloud, OpenAI-compatible chat completions API to extract action items and
// calendar events from an email (#238, extended to also extract events per the follow-up that
// removed the action item judge; moved off a local LM Studio server onto OpenRouter so
// `extract-action-items` can run in the cloud alongside every other queue instead of needing a Mac
// running LM Studio — see this queue's README section). This is the only model call the worker
// makes — see openRouterClient.ts for the HTTP plumbing this shares with nothing else today.
//
// Unlike the local LM Studio setup this replaced, email content now leaves the machine running
// this worker and is sent to OpenRouter — and, by default (see `DEFAULT_OPENROUTER_MODEL` in
// openRouterClient.ts), to whichever provider its own free auto-router resolves to at the time —
// to be processed. This is a real trade-off against the "email content never leaves local
// processing" property the Mac-only worker used to guarantee, made in exchange for not needing a
// Mac online at all. Set `OPENROUTER_MODEL` (see server.ts) to pin a specific model/provider
// instead, if you'd rather know exactly where email content goes.
import type { ActionItem, CalendarEvent } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";
import {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  readSystemPrompt,
  requestJsonCompletion,
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

// Spells out the exact JSON shape in the prompt itself rather than via OpenRouter's
// `response_format` mechanism (used here until testing against a real account found several free
// models rejecting it outright — see openRouterClient.ts's header comment). Kept as a template
// literal appended to extractActionItems.system.md's own prose (below) rather than folded into
// that file, since this is a wire-format detail for this one client, not one of the "business"
// extraction rules that file (and its eval harness) is about — same reasoning the old JSON Schema
// object this replaced was kept in code rather than the prompt file.
const OUTPUT_FORMAT_INSTRUCTIONS = `Respond with a single JSON object and nothing else: no markdown code fences, no text before or after it. Match this shape exactly, with no extra fields:
{
  "actionItems": [
    { "title": string, "description": string, "dueDate": string or null }
  ],
  "events": [
    { "title": string, "description": string, "date": string, "startTime": string, "endTime": string or null }
  ]
}
Rules for the fields above:
- dueDate, date: "YYYY-MM-DD" format. Todoist's due_string field (see todoistClient.ts) parses
  free-form text too, but a consistent format here still avoids ambiguity a natural-language parser
  could get wrong — bare "dd-mm-yyyy" could be misread as "mm-dd-yyyy", for instance.
- startTime, endTime: "HH:MM" 24-hour format.
- dueDate is null when an action item has no due date. startTime is never null — see
  actionItems.system.md's Phase 3, rule 1: an event with no extractable start time isn't produced
  at all, so there is no event needing a null one. endTime is null when the email states no
  end time/duration for that event — never guess one.
- If there are no action items and/or no events, use an empty array for whichever is empty.`;

// Kept in its own file (rather than inline) so it reads and edits like prose, not a
// string embedded in TS. Read once at module load — see openRouterClient.ts's readSystemPrompt
// for how this resolves both in dev and once built to dist/.
const systemPrompt = `${readSystemPrompt("extractActionItems.system.md")}\n\n${OUTPUT_FORMAT_INSTRUCTIONS}`;

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

// `openrouter/free` (DEFAULT_OPENROUTER_MODEL) doesn't commit to one underlying model — each
// request can land on a different free provider, some more reliable or capable than others
// (observed in testing: one request's model returned clean JSON on the first try, another's model
// was upstream-rate-limited, another still ignored the prompt's JSON-only instruction). A retry
// re-rolls which model handles the request, so it's a real fix here rather than a blind "try again
// and hope" — applied even for a pinned `OPENROUTER_MODEL` too, since a directly-named model can
// just as plausibly fail transiently (a temporary upstream rate limit/outage, also seen in
// testing).
const EXTRACTION_ATTEMPTS = 3;

export function createOpenRouterExtractor(config: OpenRouterConfig): ActionItemExtractor {
  const baseUrl = config.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL;
  const model = config.model ?? DEFAULT_OPENROUTER_MODEL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async extract(email: EmailContent): Promise<ExtractionResult> {
      let lastError: unknown;

      for (let attempt = 1; attempt <= EXTRACTION_ATTEMPTS; attempt++) {
        try {
          const parsed = await requestJsonCompletion({
            baseUrl,
            apiKey: config.apiKey,
            model,
            fetchImpl,
            systemPrompt,
            userPrompt: buildPrompt(email),
          });

          return parseExtractionResult(parsed);
        } catch (error) {
          lastError = error;
        }
      }

      // Every attempt failed — surfaces as a normal job failure, retried again later per
      // queue.ts's backoff policy, same as any other extraction error.
      throw lastError;
    },
  };
}
