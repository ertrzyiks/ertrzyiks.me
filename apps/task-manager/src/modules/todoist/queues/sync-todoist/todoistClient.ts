export interface TodoistClient {
  createTask(input: { title: string; notes?: string; due?: string }): Promise<{ id: string }>;
}

export interface TodoistClientConfig {
  apiToken: string;
  /** Todoist project to create tasks in. Defaults to the user's Inbox. */
  projectId?: string;
}

interface TodoistTaskResponse {
  id: string;
}

const TODOIST_TASKS_URL = "https://api.todoist.com/api/v1/tasks";

/**
 * Wraps Todoist's REST API using a personal API token (see README.md's "Todoist sync" section —
 * unlike Google Tasks, this needs no OAuth dance: the token is generated once from Todoist's own
 * Settings > Integrations > Developer page and used as-is).
 *
 * `fetchImpl` is an injectable seam so callers/tests can pass a fake instead of touching the real
 * network (mirrors googleCalendarClient.ts's `calendarApi` seam).
 */
export function createTodoistClient(
  config: TodoistClientConfig,
  fetchImpl: typeof fetch = fetch,
): TodoistClient {
  return {
    async createTask({ title, notes, due }) {
      const response = await fetchImpl(TODOIST_TASKS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: title,
          description: notes,
          project_id: config.projectId,
          // `due_string` goes through Todoist's own natural-language due parser, which handles
          // both a bare `YYYY-MM-DD` and free-form text like "next Friday" or "ASAP" — unlike
          // Google Tasks' `due` field (see the old googleTasksClient.ts, since removed), so the
          // LLM-extracted dueDate (no format guarantee, see openRouter.ts) can be passed straight
          // through with no local parsing/validation.
          due_string: due,
        }),
      });

      if (!response.ok) {
        throw new Error(`Todoist API responded with ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as TodoistTaskResponse;

      if (!data.id) {
        throw new Error("Todoist API did not return an id for the created task");
      }

      return { id: data.id };
    },
  };
}
