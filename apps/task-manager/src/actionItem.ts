// Shared job payload/result types for the `extract-action-items` queue.
// `worker.ts` (this package's consumer) and `queue.ts`/`app.ts` (the producer/Jobs
// API side) import these directly rather than duplicating the shape — see #241 for
// the wire contract these mirror.

export interface ActionItem {
  title: string;
  description: string;
  dueDate: string | null;
}

export interface EmailJobPayload {
  emailId: string;
}

export interface EmailJobResult {
  emailId: string;
  actionItems: ActionItem[];
}
