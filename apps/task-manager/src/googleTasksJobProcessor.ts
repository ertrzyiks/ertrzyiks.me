// The actual "handle one sync job" logic, independent of BullMQ — mirrors jobProcessor.ts.
// server.ts wraps this in a `Worker` processor callback for the `sync-google-tasks` queue; tests
// call it directly with a fake `GoogleTasksClient`.
import type { GoogleTaskJobPayload, GoogleTaskJobResult } from "./googleTask.js";
import type { GoogleTasksClient } from "./googleTasksClient.js";

export interface GoogleTasksJobProcessorDeps {
  googleTasksClient: GoogleTasksClient;
}

// Throws on any failure so BullMQ marks the job `failed` with that error as `failedReason` —
// matching the Jobs API contract used for extract-action-items (see jobProcessor.ts).
export async function processGoogleTaskJob(
  payload: GoogleTaskJobPayload,
  deps: GoogleTasksJobProcessorDeps,
): Promise<GoogleTaskJobResult> {
  const { id } = await deps.googleTasksClient.createTask({
    title: payload.title,
    notes: payload.description,
    due: payload.dueDate,
  });

  return { actionItemId: payload.actionItemId, googleTaskId: id };
}
