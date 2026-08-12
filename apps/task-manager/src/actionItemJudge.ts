// A second LM Studio call, independent of lmStudio.ts's extraction call, that re-reads the
// original email alongside one proposed action item and decides whether it should actually be
// kept — see prompts/judgeActionItem.system.md for the expectations it's judging against.
// jobProcessor.ts runs this once per extracted action item and drops the ones it rejects, so a
// bad extraction (grounded in a CTA link, or a newsletter that shouldn't have produced anything)
// gets caught before it ever reaches Google Tasks. Same "never leaves the Mac" constraint as
// extraction — this is still local-only, just a second local call instead of a new destination.
import type { ActionItem } from "./actionItem.js";
import type { EmailContent } from "./gmail.js";
import {
  DEFAULT_LM_STUDIO_BASE_URL,
  readSystemPrompt,
  requestStructuredCompletion,
  type LmStudioConfig,
} from "./lmStudioClient.js";

export interface ActionItemJudgeVerdict {
  keep: boolean;
  reason: string;
}

export interface ActionItemJudge {
  judge(email: EmailContent, actionItem: ActionItem): Promise<ActionItemJudgeVerdict>;
}

// The default when no judge dep is configured — mirrors noopEventEmitter/noopInspectionLogger's
// shape elsewhere in this package, so existing callers/tests are unaffected by omitting it.
export const noopActionItemJudge: ActionItemJudge = {
  async judge() {
    return { keep: true, reason: "judging disabled" };
  },
};

const systemPrompt = readSystemPrompt("judgeActionItem.system.md");

const verdictJsonSchema = {
  type: "object",
  properties: {
    keep: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["keep", "reason"],
  additionalProperties: false,
} as const;

function buildPrompt(email: EmailContent, actionItem: ActionItem): string {
  return [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    "",
    email.body,
    "",
    "--- Proposed action item ---",
    `Title: ${actionItem.title}`,
    `Description: ${actionItem.description}`,
    `Due date: ${actionItem.dueDate ?? "(none)"}`,
  ].join("\n");
}

function parseVerdict(parsed: unknown): ActionItemJudgeVerdict {
  const { keep, reason } = parsed as { keep?: unknown; reason?: unknown };
  if (typeof keep !== "boolean") {
    throw new Error("LM Studio response was missing a boolean keep field");
  }
  if (typeof reason !== "string") {
    throw new Error("LM Studio response was missing a reason field");
  }

  return { keep, reason };
}

export function createLmStudioActionItemJudge(config: LmStudioConfig = {}): ActionItemJudge {
  const baseUrl = config.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async judge(email: EmailContent, actionItem: ActionItem): Promise<ActionItemJudgeVerdict> {
      const parsed = await requestStructuredCompletion({
        baseUrl,
        fetchImpl,
        systemPrompt,
        userPrompt: buildPrompt(email, actionItem),
        schemaName: "action_item_verdict",
        jsonSchema: verdictJsonSchema,
      });

      return parseVerdict(parsed);
    },
  };
}
