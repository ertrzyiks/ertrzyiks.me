import { describe, expect, it } from "vitest";
import { createTodoistClient } from "./todoistClient.js";

const CONFIG = { apiToken: "test-token" };

function fakeFetch(
  impl: (url: string, init: RequestInit) => Promise<{ ok: boolean; status?: number; body: unknown }>,
): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    const { ok, status, body } = await impl(url, init);
    return {
      ok,
      status: status ?? (ok ? 200 : 500),
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as typeof fetch;
}

describe("createTodoistClient", () => {
  it("creates a task and returns its id", async () => {
    const fetchImpl = fakeFetch(async () => ({ ok: true, body: { id: "todoist-1" } }));
    const client = createTodoistClient(CONFIG, fetchImpl);

    await expect(client.createTask({ title: "Send the report" })).resolves.toEqual({
      id: "todoist-1",
    });
  });

  it("posts to the Todoist v1 tasks endpoint with a bearer token", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = fakeFetch(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return { ok: true, body: { id: "todoist-1" } };
    });
    const client = createTodoistClient(CONFIG, fetchImpl);

    await client.createTask({ title: "Send the report" });

    expect(capturedUrl).toBe("https://api.todoist.com/api/v1/tasks");
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token",
    );
  });

  it("passes title, notes, and project through as content/description/project_id", async () => {
    let capturedBody: unknown;
    const fetchImpl = fakeFetch(async (_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, body: { id: "todoist-1" } };
    });
    const client = createTodoistClient({ ...CONFIG, projectId: "my-project" }, fetchImpl);

    await client.createTask({ title: "Send the report", notes: "Send the Q3 report" });

    expect(capturedBody).toEqual({
      content: "Send the report",
      description: "Send the Q3 report",
      project_id: "my-project",
      due_string: undefined,
    });
  });

  it("passes a due date through as due_string unchanged, no local parsing", async () => {
    let capturedBody: unknown;
    const fetchImpl = fakeFetch(async (_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, body: { id: "todoist-1" } };
    });
    const client = createTodoistClient(CONFIG, fetchImpl);

    await client.createTask({ title: "Send the report", due: "next Friday" });

    expect((capturedBody as { due_string: string }).due_string).toBe("next Friday");
  });

  it("throws with the response body when the API responds with a non-ok status", async () => {
    const fetchImpl = fakeFetch(async () => ({ ok: false, status: 403, body: { error: "nope" } }));
    const client = createTodoistClient(CONFIG, fetchImpl);

    await expect(client.createTask({ title: "Send the report" })).rejects.toThrow(
      "Todoist API responded with 403",
    );
  });

  it("throws when the API doesn't return an id", async () => {
    const fetchImpl = fakeFetch(async () => ({ ok: true, body: {} }));
    const client = createTodoistClient(CONFIG, fetchImpl);

    await expect(client.createTask({ title: "Send the report" })).rejects.toThrow(
      "Todoist API did not return an id",
    );
  });
});
