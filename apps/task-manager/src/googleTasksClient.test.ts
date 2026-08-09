import { describe, expect, it } from "vitest";
import type { tasks_v1 } from "googleapis";
import { createGoogleTasksClient } from "./googleTasksClient.js";

const CONFIG = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};

function fakeTasksApi(
  insertImpl: (params: unknown) => Promise<{ data: tasks_v1.Schema$Task }>,
): tasks_v1.Tasks {
  return {
    tasks: {
      insert: insertImpl,
    },
  } as unknown as tasks_v1.Tasks;
}

describe("createGoogleTasksClient", () => {
  it("creates a task and returns its id", async () => {
    const tasksApi = fakeTasksApi(async () => ({ data: { id: "gtask-1" } }));
    const client = createGoogleTasksClient(CONFIG, tasksApi);

    await expect(client.createTask({ title: "Send the report" })).resolves.toEqual({
      id: "gtask-1",
    });
  });

  it("defaults to the @default task list", async () => {
    let capturedParams: unknown;
    const tasksApi = fakeTasksApi(async (params) => {
      capturedParams = params;
      return { data: { id: "gtask-1" } };
    });
    const client = createGoogleTasksClient(CONFIG, tasksApi);

    await client.createTask({ title: "Send the report" });

    expect((capturedParams as { tasklist: string }).tasklist).toBe("@default");
  });

  it("honors a configured taskListId", async () => {
    let capturedParams: unknown;
    const tasksApi = fakeTasksApi(async (params) => {
      capturedParams = params;
      return { data: { id: "gtask-1" } };
    });
    const client = createGoogleTasksClient({ ...CONFIG, taskListId: "my-list" }, tasksApi);

    await client.createTask({ title: "Send the report" });

    expect((capturedParams as { tasklist: string }).tasklist).toBe("my-list");
  });

  it("passes title and notes through to requestBody", async () => {
    let capturedParams: unknown;
    const tasksApi = fakeTasksApi(async (params) => {
      capturedParams = params;
      return { data: { id: "gtask-1" } };
    });
    const client = createGoogleTasksClient(CONFIG, tasksApi);

    await client.createTask({ title: "Send the report", notes: "Send the Q3 report" });

    expect((capturedParams as { requestBody: tasks_v1.Schema$Task }).requestBody).toEqual({
      title: "Send the report",
      notes: "Send the Q3 report",
      due: undefined,
    });
  });

  it("converts a bare YYYY-MM-DD due date to RFC3339 midnight UTC", async () => {
    let capturedParams: unknown;
    const tasksApi = fakeTasksApi(async (params) => {
      capturedParams = params;
      return { data: { id: "gtask-1" } };
    });
    const client = createGoogleTasksClient(CONFIG, tasksApi);

    await client.createTask({ title: "Send the report", due: "2026-08-08" });

    expect((capturedParams as { requestBody: tasks_v1.Schema$Task }).requestBody.due).toBe(
      "2026-08-08T00:00:00.000Z",
    );
  });

  it("passes an already-RFC3339 due date through unchanged", async () => {
    let capturedParams: unknown;
    const tasksApi = fakeTasksApi(async (params) => {
      capturedParams = params;
      return { data: { id: "gtask-1" } };
    });
    const client = createGoogleTasksClient(CONFIG, tasksApi);

    await client.createTask({ title: "Send the report", due: "2026-08-08T12:30:00.000Z" });

    expect((capturedParams as { requestBody: tasks_v1.Schema$Task }).requestBody.due).toBe(
      "2026-08-08T12:30:00.000Z",
    );
  });

  it("throws when the API doesn't return an id", async () => {
    const tasksApi = fakeTasksApi(async () => ({ data: {} }));
    const client = createGoogleTasksClient(CONFIG, tasksApi);

    await expect(client.createTask({ title: "Send the report" })).rejects.toThrow(
      "Google Tasks API did not return an id",
    );
  });
});
