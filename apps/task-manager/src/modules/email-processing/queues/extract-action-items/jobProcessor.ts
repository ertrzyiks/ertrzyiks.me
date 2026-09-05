// The actual "handle one job" logic, independent of BullMQ. `worker.ts` wraps this
// in a `Worker` processor callback; tests call it directly with fake dependencies so
// the success/failure paths can be verified without a real Gmail or OpenRouter
// call in the loop.
import type { EmailJobResult } from "./actionItem.js";
import { noopEventEmitter, type EventEmitter } from "../../../../axiomEvents.js";
import type { EmailContent, EmailFetcher } from "./gmail.js";
import { noopInspectionLogger, type InspectionLogger } from "./inspectionLog.js";
import { noopJobLogger, type JobLogger } from "../../../../jobLogger.js";
import type { ActionItemExtractor } from "./openRouter.js";

export interface JobProcessorDeps {
  emailFetcher: EmailFetcher;
  actionItemExtractor: ActionItemExtractor;
  /** Trend-event emission (#315) — optional, defaults to a no-op so existing callers/tests are
   * unaffected by omitting it. */
  events?: EventEmitter;
  /** On-disk email content/action-items inspection trail — optional, defaults to a no-op so
   * existing callers/tests are unaffected by omitting it. See inspectionLog.ts. */
  inspectionLogger?: InspectionLogger;
  /** Bull Board per-job progress notes (#348) — optional, defaults to a no-op. */
  log?: JobLogger;
}

// Throws on any failure (email fetch or extraction) so BullMQ marks the job `failed` with that
// error as `failedReason` — matching the Jobs API contract.
export async function processEmailJob(
  emailId: string,
  deps: JobProcessorDeps,
): Promise<EmailJobResult> {
  const events = deps.events ?? noopEventEmitter;
  const inspectionLogger = deps.inspectionLogger ?? noopInspectionLogger;
  const log = deps.log ?? noopJobLogger;
  const entity = "extract-action-items";

  events.emit({ entity, entityId: emailId, status: "active" });
  log(`Fetching email ${emailId} from Gmail`);

  // Fetched outside the try so a fetch failure (no `email` to log) is distinguished from an
  // extraction failure (where the email that was sent to the LLM is exactly what's worth
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
    log(`Extracting action items and events from "${email.subject}"`);
    const { actionItems, events: calendarEvents } = await deps.actionItemExtractor.extract(email);
    log(`Extracted ${actionItems.length} action item(s) and ${calendarEvents.length} event(s)`);

    events.emit({ entity, entityId: emailId, status: "completed" });
    await inspectionLogger.record({ emailId, email, actionItems, events: calendarEvents });
    return { emailId, actionItems, events: calendarEvents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed: ${message}`);
    events.emit({ entity, entityId: emailId, status: "failed", error: message });
    await inspectionLogger.record({ emailId, email, error: message });
    throw error;
  }
}
