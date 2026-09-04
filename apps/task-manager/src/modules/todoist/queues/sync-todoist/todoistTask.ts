// Shared job payload/result types for the `sync-todoist` queue — mirrors actionItem.ts's role
// for `extract-action-items`. `todoistJobProcessor.ts` (this package's consumer) and `app.ts`
// (the producer/Jobs API side) import these directly.

export interface TodoistJobPayload {
  actionItemId: number;
  title: string;
  description?: string;
  dueDate?: string;
}

export interface TodoistJobResult {
  actionItemId: number;
  todoistTaskId: string;
}
