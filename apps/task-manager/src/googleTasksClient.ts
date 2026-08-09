import { google, type tasks_v1 } from "googleapis";

export interface GoogleTasksClient {
  createTask(input: { title: string; notes?: string; due?: string }): Promise<{ id: string }>;
}

export interface GoogleTasksClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Google Tasks list to create tasks in. Defaults to the user's default list. */
  taskListId?: string;
}

function buildTasksApi(config: GoogleTasksClientConfig): tasks_v1.Tasks {
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
  auth.setCredentials({ refresh_token: config.refreshToken });
  return google.tasks({ version: "v1", auth });
}

// The Tasks API's `due` field wants a full RFC3339 timestamp (it only honours the date part,
// but rejects a bare `YYYY-MM-DD`) — action items only ever carry a date, so this pins the time
// to midnight UTC rather than asking every caller to do the conversion.
function toGoogleTasksDue(dueDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? `${dueDate}T00:00:00.000Z` : dueDate;
}

/**
 * Wraps the Google Tasks API using a dedicated `tasks` OAuth credential (see
 * scripts/google-tasks-oauth) — separate from the `gmail.readonly` credential the Mac worker
 * uses, even though in practice both can be minted from the same GCP OAuth client.
 *
 * `tasksApi` is an injectable seam so callers can pass a fake in tests without touching real
 * Google OAuth (mirrors personal-assistant/src/gmailClient.ts's `gmailApi` seam).
 */
export function createGoogleTasksClient(
  config: GoogleTasksClientConfig,
  tasksApi: tasks_v1.Tasks = buildTasksApi(config),
): GoogleTasksClient {
  const taskListId = config.taskListId ?? "@default";

  return {
    async createTask({ title, notes, due }) {
      const response = await tasksApi.tasks.insert({
        tasklist: taskListId,
        requestBody: {
          title,
          notes,
          due: due ? toGoogleTasksDue(due) : undefined,
        },
      });

      if (!response.data.id) {
        throw new Error("Google Tasks API did not return an id for the created task");
      }

      return { id: response.data.id };
    },
  };
}
