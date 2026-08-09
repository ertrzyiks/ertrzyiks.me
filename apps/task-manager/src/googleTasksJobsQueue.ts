import type { GoogleTaskJobPayload } from "./googleTask.js";

// Mirrors jobsQueue.ts's JobLike/JobsQueue, typed to the sync-google-tasks payload instead of
// `{ emailId }` — kept as a separate small interface (rather than a generic JobsQueue<T>) to
// match this codebase's existing per-queue file convention (see actionItem.ts/googleTask.ts).
export interface GoogleTaskJobLike {
  id?: string;
  getState(): Promise<string>;
  returnvalue: unknown;
  failedReason?: string;
}

export interface GoogleTasksJobsQueue {
  add(name: string, data: GoogleTaskJobPayload): Promise<{ id?: string }>;
  getJob(jobId: string): Promise<GoogleTaskJobLike | undefined>;
}
