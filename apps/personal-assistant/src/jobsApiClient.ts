// HTTP client for the task-manager Jobs API (contract: #241, implementation: apps/task-manager).

export type JobStatusName = "pending" | "active" | "completed" | "failed";

export interface ActionItemPayload {
  title: string;
  description?: string;
  dueDate?: string;
}

// Mirrors task-manager's actionItem.ts `CalendarEvent` — one calendar-worthy event extracted
// alongside action items. `startTime` is required there (extraction never emits an event without
// one, see extractActionItems.system.md's Phase 3), `endTime` optional.
export interface CalendarEventPayload {
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime?: string;
}

export interface JobResultPayload {
  emailId: string;
  actionItems: ActionItemPayload[];
  events: CalendarEventPayload[];
}

export interface JobStatusResult {
  jobId: string;
  status: JobStatusName;
  result?: JobResultPayload;
  error?: string;
}

// Payload/result shapes for the sync-todoist queue's Jobs API endpoints
// (`/todoist-jobs*`), mirroring the extract-action-items ones above.
export interface TodoistPayload {
  actionItemId: number;
  title: string;
  description?: string;
  dueDate?: string;
}

export interface TodoistResultPayload {
  actionItemId: number;
  todoistTaskId: string;
}

export interface TodoistJobStatusResult {
  jobId: string;
  status: JobStatusName;
  result?: TodoistResultPayload;
  error?: string;
}

// Payload/result shapes for the sync-calendar-events queue's Jobs API endpoints
// (`/calendar-event-jobs*`), mirroring the sync-todoist ones above.
export interface CalendarEventJobPayload {
  calendarEventId: number;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime?: string;
}

export interface CalendarEventJobResultPayload {
  calendarEventId: number;
  googleEventId: string;
}

export interface CalendarEventJobStatusResult {
  jobId: string;
  status: JobStatusName;
  result?: CalendarEventJobResultPayload;
  error?: string;
}

export interface JobsApiClient {
  scheduleJob(emailId: string): Promise<{ jobId: string }>;
  /** Batch status lookup. Unknown job IDs are simply omitted from the result (per #241/task-manager). */
  getJobStatuses(jobIds: string[]): Promise<JobStatusResult[]>;
  /** Schedules a job on the sync-todoist queue for one action item. */
  scheduleTodoistJob(item: TodoistPayload): Promise<{ jobId: string }>;
  /** Batch status lookup for sync-todoist jobs. Unknown job IDs are omitted, same as getJobStatuses. */
  getTodoistJobStatuses(jobIds: string[]): Promise<TodoistJobStatusResult[]>;
  /** Schedules a job on the sync-calendar-events queue for one calendar event. */
  scheduleCalendarEventJob(item: CalendarEventJobPayload): Promise<{ jobId: string }>;
  /** Batch status lookup for sync-calendar-events jobs. Unknown job IDs are omitted, same as getJobStatuses. */
  getCalendarEventJobStatuses(jobIds: string[]): Promise<CalendarEventJobStatusResult[]>;
}

export interface JobsApiClientConfig {
  baseUrl: string;
  bearerToken: string;
  /** Injectable seam for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

export function createJobsApiClient(config: JobsApiClientConfig): JobsApiClient {
  const fetchFn = config.fetchFn ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  async function request(path: string, body: unknown): Promise<unknown> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bearerToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Jobs API request to ${path} failed with status ${response.status}: ${await response.text()}`,
      );
    }

    return response.json();
  }

  return {
    async scheduleJob(emailId) {
      return (await request("/jobs", { emailId })) as { jobId: string };
    },

    async getJobStatuses(jobIds) {
      if (jobIds.length === 0) return [];
      const body = (await request("/jobs/status", { jobIds })) as { results: JobStatusResult[] };
      return body.results;
    },

    async scheduleTodoistJob(item) {
      return (await request("/todoist-jobs", item)) as { jobId: string };
    },

    async getTodoistJobStatuses(jobIds) {
      if (jobIds.length === 0) return [];
      const body = (await request("/todoist-jobs/status", { jobIds })) as {
        results: TodoistJobStatusResult[];
      };
      return body.results;
    },

    async scheduleCalendarEventJob(item) {
      return (await request("/calendar-event-jobs", item)) as { jobId: string };
    },

    async getCalendarEventJobStatuses(jobIds) {
      if (jobIds.length === 0) return [];
      const body = (await request("/calendar-event-jobs/status", { jobIds })) as {
        results: CalendarEventJobStatusResult[];
      };
      return body.results;
    },
  };
}
