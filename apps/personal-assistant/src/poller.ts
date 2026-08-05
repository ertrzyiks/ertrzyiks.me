import type { GmailClient } from "./gmailClient.js";
import type { JobsApiClient } from "./jobsApiClient.js";
import type { Store } from "./store.js";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface PollDeps {
  gmail: GmailClient;
  jobsApi: JobsApiClient;
  store: Store;
  logger?: Logger;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Discovers message IDs Gmail has that aren't in the emails table yet, and schedules a
 * Jobs API job for each. Dedup happens by checking `store.emailExists` before scheduling,
 * so an email is recorded (and never re-queued) as soon as it's seen.
 */
export async function discoverAndScheduleNewEmails(deps: PollDeps): Promise<void> {
  const { gmail, jobsApi, store, logger = noopLogger } = deps;

  const messageIds = await gmail.listNewMessageIds();
  const newIds = messageIds.filter((id) => !store.emailExists(id));

  for (const emailId of newIds) {
    store.insertQueuedEmail(emailId);

    try {
      const { jobId } = await jobsApi.scheduleJob(emailId);
      store.setJobId(emailId, jobId);
      logger.info(`scheduled job ${jobId} for email ${emailId}`);
    } catch (err) {
      // Retry/alerting policy is explicitly deferred (#250) — for now, a scheduling failure
      // just marks the email failed so it isn't retried indefinitely; revisit if that proves
      // too aggressive.
      store.markEmailFailed(emailId, errorMessage(err));
      logger.error(`failed to schedule job for email ${emailId}: ${errorMessage(err)}`);
    }
  }
}

/**
 * Polls the Jobs API for the status of every email still queued with a job attached, and
 * stores the outcome: action items + status='completed' on success, status='failed' +
 * error_message on failure. Still-pending/active jobs are left untouched.
 */
export async function pollPendingJobStatuses(deps: PollDeps): Promise<void> {
  const { jobsApi, store, logger = noopLogger } = deps;

  const queued = store.getQueuedEmailsWithJobId();
  if (queued.length === 0) return;

  const statuses = await jobsApi.getJobStatuses(queued.map((q) => q.jobId));
  const statusByJobId = new Map(statuses.map((status) => [status.jobId, status]));

  for (const { emailId, jobId } of queued) {
    const status = statusByJobId.get(jobId);
    if (!status) continue; // Unknown to the Jobs API — leave queued, try again next cycle.

    if (status.status === "completed") {
      store.markEmailCompleted(emailId, status.result?.actionItems ?? []);
      logger.info(`email ${emailId} completed with ${status.result?.actionItems.length ?? 0} action item(s)`);
    } else if (status.status === "failed") {
      store.markEmailFailed(emailId, status.error ?? "job failed with no error message");
      logger.warn(`email ${emailId} failed: ${status.error ?? "unknown error"}`);
    }
    // pending/active: no-op, check again next cycle.
  }
}

export async function runPollCycle(deps: PollDeps): Promise<void> {
  await discoverAndScheduleNewEmails(deps);
  await pollPendingJobStatuses(deps);
}
