import type { JobsApiClient } from "./jobsApiClient.js";
import { noopLogger, type Logger } from "./logger.js";
import type { Store } from "./store.js";

export interface TodoistSyncDeps {
  jobsApi: JobsApiClient;
  store: Store;
  logger?: Logger;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Schedules a sync-todoist job for every action item that doesn't have one yet
 * (`job_id IS NULL`), and stores the returned job ID.
 *
 * Unlike `discoverAndScheduleNewEmails` in poller.ts, a scheduling failure here is *not* recorded
 * anywhere terminal — `job_id` is simply left `NULL` so the item is retried next cycle. This is
 * safe under the same assumption poller.ts makes about its own scheduling failures (a thrown
 * error means the POST never got a response, so no job was actually created to duplicate), and
 * keeps the schema to exactly the two columns (`job_id`, `task_id`) this feature calls for — no
 * per-item error-tracking column, unlike `emails.error_message`.
 */
export async function scheduleUnsyncedActionItems(deps: TodoistSyncDeps): Promise<void> {
  const { jobsApi, store, logger = noopLogger } = deps;

  const items = store.getUnsyncedActionItems();

  for (const item of items) {
    try {
      const { jobId } = await jobsApi.scheduleTodoistJob({
        actionItemId: item.id,
        title: item.title,
        description: item.description ?? undefined,
        dueDate: item.dueDate ?? undefined,
      });
      store.setActionItemJobId(item.id, jobId);
      logger.info(`scheduled todoist sync job ${jobId} for action item ${item.id}`);
    } catch (err) {
      logger.error(
        `failed to schedule todoist sync job for action item ${item.id}: ${errorMessage(err)}`,
      );
    }
  }
}

/**
 * Polls the Jobs API for the status of every action item with a sync job scheduled but not yet
 * backfilled (`job_id` set, `task_id IS NULL`), and stores the outcome: `task_id` on success.
 * A failed job is logged and left stuck (same deferred-retry stance as poller.ts's job-failure
 * handling) — still-pending/active jobs are left untouched either way.
 */
export async function pollPendingTodoistJobs(deps: TodoistSyncDeps): Promise<void> {
  const { jobsApi, store, logger = noopLogger } = deps;

  const pending = store.getActionItemsAwaitingTaskSync();
  if (pending.length === 0) return;

  const statuses = await jobsApi.getTodoistJobStatuses(pending.map((item) => item.jobId));
  const statusByJobId = new Map(statuses.map((status) => [status.jobId, status]));

  for (const { id, jobId } of pending) {
    const status = statusByJobId.get(jobId);
    if (!status) continue; // Unknown to the Jobs API — leave pending, try again next cycle.

    if (status.status === "completed" && status.result) {
      store.setActionItemTaskId(id, status.result.todoistTaskId);
      logger.info(`action item ${id} synced to Todoist as ${status.result.todoistTaskId}`);
    } else if (status.status === "failed") {
      logger.warn(
        `todoist sync job ${jobId} for action item ${id} failed: ${status.error ?? "unknown error"}`,
      );
    }
    // pending/active: no-op, check again next cycle.
  }
}

export async function runTodoistSyncCycle(deps: TodoistSyncDeps): Promise<void> {
  await scheduleUnsyncedActionItems(deps);
  await pollPendingTodoistJobs(deps);
}
