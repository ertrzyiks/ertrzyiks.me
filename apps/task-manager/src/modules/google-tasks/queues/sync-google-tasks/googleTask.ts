// Shared job payload/result types for the `sync-google-tasks` queue — mirrors actionItem.ts's
// role for `extract-action-items`. `googleTasksJobProcessor.ts` (this package's consumer) and
// `app.ts` (the producer/Jobs API side) import these directly.

export interface GoogleTaskJobPayload {
  actionItemId: number;
  title: string;
  description?: string;
  dueDate?: string;
}

export interface GoogleTaskJobResult {
  actionItemId: number;
  googleTaskId: string;
}
