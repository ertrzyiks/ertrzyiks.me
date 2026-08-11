// The actual "handle one job" logic, independent of BullMQ. `worker.ts` wraps this
// in a `Worker` processor callback; tests call it directly with fake dependencies so
// the success/failure paths can be verified without a real Keychain, Gmail, or LM
// Studio in the loop.
import type { EmailJobResult } from "./actionItem.js";
import { noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import type { EmailFetcher } from "./gmail.js";
import type { ActionItemExtractor } from "./lmStudio.js";

export interface JobProcessorDeps {
  emailFetcher: EmailFetcher;
  actionItemExtractor: ActionItemExtractor;
  /** Trend-event emission (#315) — optional, defaults to a no-op so existing callers/tests are
   * unaffected by omitting it. */
  events?: EventEmitter;
}

// Throws on any failure (email fetch or extraction) so BullMQ marks the job
// `failed` with that error as `failedReason` — matching the Jobs API contract.
export async function processEmailJob(
  emailId: string,
  deps: JobProcessorDeps,
): Promise<EmailJobResult> {
  const events = deps.events ?? noopEventEmitter;
  const entity = "extract-action-items";

  events.emit({ entity, entityId: emailId, status: "active" });
  try {
    const email = await deps.emailFetcher.fetchEmail(emailId);
    const actionItems = await deps.actionItemExtractor.extract(email);
    events.emit({ entity, entityId: emailId, status: "completed" });
    return { emailId, actionItems };
  } catch (error) {
    events.emit({
      entity,
      entityId: emailId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
