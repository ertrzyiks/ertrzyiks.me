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

// The Tasks API's `due` field wants a full RFC3339 timestamp (it only honours the date part, but
// rejects a bare `YYYY-MM-DD`) — but dueDate here comes straight from an LLM extraction with no
// format guarantee (the extraction JSON schema only constrains it to `string | null`, not a date
// format, see lmStudio.ts), so free-form values like "next Friday" or "ASAP" used to be sent
// through unchanged and Google rejected the whole task with "Request contains an invalid
// argument". Parsing via `Date` accepts both a bare `YYYY-MM-DD` and an already-RFC3339
// timestamp; anything genuinely unparseable is dropped rather than failing task creation over a
// decorative due date.
function toGoogleTasksDue(dueDate: string): string | undefined {
  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
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
