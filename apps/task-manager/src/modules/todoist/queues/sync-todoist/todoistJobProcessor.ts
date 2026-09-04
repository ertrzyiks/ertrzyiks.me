// The actual "handle one sync job" logic, independent of BullMQ — mirrors jobProcessor.ts.
// server.ts wraps this in a `Worker` processor callback for the `sync-todoist` queue; tests call
// it directly with a fake `TodoistClient`.
import { noopEventEmitter, type EventEmitter } from "../../../../axiomEvents.js";
import type { TodoistJobPayload, TodoistJobResult } from "./todoistTask.js";
import type { TodoistClient } from "./todoistClient.js";
import { noopJobLogger, type JobLogger } from "../../../../jobLogger.js";

export interface TodoistJobProcessorDeps {
  todoistClient: TodoistClient;
  /** Trend-event emission (#315) — optional, defaults to a no-op so existing callers/tests are
   * unaffected by omitting it. */
  events?: EventEmitter;
  /** Bull Board per-job progress notes (#348) — optional, defaults to a no-op. */
  log?: JobLogger;
}

// Throws on any failure so BullMQ marks the job `failed` with that error as `failedReason` —
// matching the Jobs API contract used for extract-action-items (see jobProcessor.ts).
export async function processTodoistJob(
  payload: TodoistJobPayload,
  deps: TodoistJobProcessorDeps,
): Promise<TodoistJobResult> {
  const events = deps.events ?? noopEventEmitter;
  const log = deps.log ?? noopJobLogger;
  const entity = "sync-todoist";
  const entityId = String(payload.actionItemId);

  events.emit({ entity, entityId, status: "active" });
  log(`Creating Todoist task "${payload.title}"`);
  try {
    const { id } = await deps.todoistClient.createTask({
      title: payload.title,
      notes: payload.description,
      due: payload.dueDate,
    });

    log(`Created Todoist task ${id}`);
    events.emit({ entity, entityId, status: "completed" });
    return { actionItemId: payload.actionItemId, todoistTaskId: id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Failed: ${message}`);
    events.emit({ entity, entityId, status: "failed", error: message });
    throw error;
  }
}
