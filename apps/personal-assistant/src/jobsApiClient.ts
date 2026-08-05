// HTTP client for the task-manager Jobs API (contract: #241, implementation: apps/task-manager).

export type JobStatusName = "pending" | "active" | "completed" | "failed";

export interface ActionItemPayload {
  title: string;
  description?: string;
  dueDate?: string;
}

export interface JobResultPayload {
  emailId: string;
  actionItems: ActionItemPayload[];
}

export interface JobStatusResult {
  jobId: string;
  status: JobStatusName;
  result?: JobResultPayload;
  error?: string;
}

export interface JobsApiClient {
  scheduleJob(emailId: string): Promise<{ jobId: string }>;
  /** Batch status lookup. Unknown job IDs are simply omitted from the result (per #241/task-manager). */
  getJobStatuses(jobIds: string[]): Promise<JobStatusResult[]>;
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
  };
}
