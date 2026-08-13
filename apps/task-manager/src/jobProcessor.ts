// The actual "handle one job" logic, independent of BullMQ. `worker.ts` wraps this
// in a `Worker` processor callback; tests call it directly with fake dependencies so
// the success/failure paths can be verified without a real Keychain, Gmail, or LM
// Studio in the loop.
import type { ActionItem, EmailJobResult } from "./actionItem.js";
import { noopActionItemJudge, type ActionItemJudge } from "./actionItemJudge.js";
import { noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import type { EmailContent, EmailFetcher } from "./gmail.js";
import {
  noopInspectionLogger,
  type InspectionLogger,
  type RejectedActionItem,
} from "./inspectionLog.js";
import { noopJobLogger, type JobLogger } from "./jobLogger.js";
import type { ActionItemExtractor } from "./lmStudio.js";

export interface JobProcessorDeps {
  emailFetcher: EmailFetcher;
  actionItemExtractor: ActionItemExtractor;
  /** Trend-event emission (#315) — optional, defaults to a no-op so existing callers/tests are
   * unaffected by omitting it. */
  events?: EventEmitter;
  /** On-disk email content/action-items inspection trail — optional, defaults to a no-op so
   * existing callers/tests are unaffected by omitting it. See inspectionLog.ts. */
  inspectionLogger?: InspectionLogger;
  /** Judges each item the extractor produces and drops the ones it rejects — optional, defaults
   * to a no-op that keeps everything so existing callers/tests are unaffected by omitting it.
   * See actionItemJudge.ts. */
  actionItemJudge?: ActionItemJudge;
  /** Bull Board per-job progress notes (#348) — optional, defaults to a no-op. */
  log?: JobLogger;
}

// Exported so eval/runFixtureSuite.ts can run the exact same extract-then-judge filtering a real
// job does, instead of an eval harness that only ever exercised the extractor half of the
// pipeline.
export async function judgeActionItems(
  email: EmailContent,
  actionItems: ActionItem[],
  judge: ActionItemJudge,
): Promise<{ kept: ActionItem[]; rejected: RejectedActionItem[] }> {
  // One judge call per action item, run concurrently — each call is independent (a bad verdict on
  // one item says nothing about another), so there's no reason to serialize them.
  const verdicts = await Promise.all(
    actionItems.map(async (actionItem) => ({
      actionItem,
      verdict: await judge.judge(email, actionItem),
    })),
  );

  const kept: ActionItem[] = [];
  const rejected: RejectedActionItem[] = [];
  for (const { actionItem, verdict } of verdicts) {
    if (verdict.keep) {
      kept.push(actionItem);
    } else {
      rejected.push({ actionItem, reason: verdict.reason });
    }
  }
  return { kept, rejected };
}

// Throws on any failure (email fetch, extraction, or judging) so BullMQ marks the job
// `failed` with that error as `failedReason` — matching the Jobs API contract.
export async function processEmailJob(
  emailId: string,
  deps: JobProcessorDeps,
): Promise<EmailJobResult> {
  const events = deps.events ?? noopEventEmitter;
  const inspectionLogger = deps.inspectionLogger ?? noopInspectionLogger;
  const actionItemJudge = deps.actionItemJudge ?? noopActionItemJudge;
  const log = deps.log ?? noopJobLogger;
  const entity = "extract-action-items";

  events.emit({ entity, entityId: emailId, status: "active" });
  log(`Fetching email ${emailId} from Gmail`);

  // Fetched outside the try so a fetch failure (no `email` to log) is distinguished from an
  // extraction/judging failure (where the email that was sent to the LLM is exactly what's worth
  // inspecting) below.
  let email: EmailContent;
  try {
    email = await deps.emailFetcher.fetchEmail(emailId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed: ${message}`);
    events.emit({ entity, entityId: emailId, status: "failed", error: message });
    throw error;
  }

  try {
    log(`Extracting action items from "${email.subject}"`);
    const extracted = await deps.actionItemExtractor.extract(email);
    log(`Judging ${extracted.length} extracted action item(s)`);
    const { kept, rejected } = await judgeActionItems(email, extracted, actionItemJudge);
    log(`Kept ${kept.length}, rejected ${rejected.length} action item(s)`);

    events.emit({ entity, entityId: emailId, status: "completed" });
    await inspectionLogger.record({
      emailId,
      email,
      actionItems: kept,
      ...(rejected.length > 0 ? { rejectedActionItems: rejected } : {}),
    });
    return { emailId, actionItems: kept };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed: ${message}`);
    events.emit({ entity, entityId: emailId, status: "failed", error: message });
    await inspectionLogger.record({ emailId, email, error: message });
    throw error;
  }
}
