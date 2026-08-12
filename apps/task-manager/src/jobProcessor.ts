// The actual "handle one job" logic, independent of BullMQ. `worker.ts` wraps this
// in a `Worker` processor callback; tests call it directly with fake dependencies so
// the success/failure paths can be verified without a real Keychain, Gmail, or LM
// Studio in the loop.
import type { EmailJobResult } from "./actionItem.js";
import { noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import type { EmailContent, EmailFetcher } from "./gmail.js";
import { noopInspectionLogger, type InspectionLogger } from "./inspectionLog.js";
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
}

// Throws on any failure (email fetch or extraction) so BullMQ marks the job
// `failed` with that error as `failedReason` — matching the Jobs API contract.
export async function processEmailJob(
  emailId: string,
  deps: JobProcessorDeps,
): Promise<EmailJobResult> {
  const events = deps.events ?? noopEventEmitter;
  const inspectionLogger = deps.inspectionLogger ?? noopInspectionLogger;
  const entity = "extract-action-items";

  events.emit({ entity, entityId: emailId, status: "active" });

  // Fetched outside the try so a fetch failure (no `email` to log) is distinguished from an
  // extraction failure (where the email that was sent to the LLM is exactly what's worth
  // inspecting) below.
  let email: EmailContent;
  try {
    email = await deps.emailFetcher.fetchEmail(emailId);
  } catch (error) {
    events.emit({
      entity,
      entityId: emailId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  try {
    const actionItems = await deps.actionItemExtractor.extract(email);
    events.emit({ entity, entityId: emailId, status: "completed" });
    await inspectionLogger.record({ emailId, email, actionItems });
    return { emailId, actionItems };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    events.emit({ entity, entityId: emailId, status: "failed", error: message });
    await inspectionLogger.record({ emailId, email, error: message });
    throw error;
  }
}
