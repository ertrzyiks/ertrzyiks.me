// The actual "handle one sync job" logic, independent of BullMQ — mirrors jobProcessor.ts.
// server.ts wraps this in a `Worker` processor callback for the `sync-google-tasks` queue; tests
// call it directly with a fake `GoogleTasksClient`.
import { noopEventEmitter, type EventEmitter } from "./axiomEvents.js";
import type { GoogleTaskJobPayload, GoogleTaskJobResult } from "./googleTask.js";
import type { GoogleTasksClient } from "./googleTasksClient.js";

export interface GoogleTasksJobProcessorDeps {
  googleTasksClient: GoogleTasksClient;
  /** Trend-event emission (#315) — optional, defaults to a no-op so existing callers/tests are
   * unaffected by omitting it. */
  events?: EventEmitter;
}

// Throws on any failure so BullMQ marks the job `failed` with that error as `failedReason` —
// matching the Jobs API contract used for extract-action-items (see jobProcessor.ts).
export async function processGoogleTaskJob(
  payload: GoogleTaskJobPayload,
  deps: GoogleTasksJobProcessorDeps,
): Promise<GoogleTaskJobResult> {
  const events = deps.events ?? noopEventEmitter;
  const entity = "sync-google-tasks";
  const entityId = String(payload.actionItemId);

  events.emit({ entity, entityId, status: "active" });
  try {
    const { id } = await deps.googleTasksClient.createTask({
      title: payload.title,
      notes: payload.description,
      due: payload.dueDate,
    });

    events.emit({ entity, entityId, status: "completed" });
    return { actionItemId: payload.actionItemId, googleTaskId: id };
  } catch (error) {
    events.emit({
      entity,
      entityId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
