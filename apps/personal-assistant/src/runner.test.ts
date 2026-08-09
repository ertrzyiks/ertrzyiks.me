import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GmailClient } from "./gmailClient.js";
import type { JobsApiClient } from "./jobsApiClient.js";
import { startPolling } from "./runner.js";
import { createStore, type Store } from "./store.js";

class CountingGmailClient implements GmailClient {
  calls = 0;
  async listNewMessageIds() {
    this.calls++;
    return [];
  }
}

class NoopJobsApiClient implements JobsApiClient {
  async scheduleJob() {
    return { jobId: "unused" };
  }
  async getJobStatuses() {
    return [];
  }
  async scheduleGoogleTaskJob() {
    return { jobId: "unused" };
  }
  async getGoogleTaskJobStatuses() {
    return [];
  }
}

describe("startPolling", () => {
  let store: Store;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createStore(":memory:");
  });

  afterEach(() => {
    store.close();
    vi.useRealTimers();
  });

  it("runs a cycle immediately, then again on each interval tick", async () => {
    const gmail = new CountingGmailClient();
    const runner = startPolling({ gmail, jobsApi: new NoopJobsApiClient(), store }, 1000);

    await vi.advanceTimersByTimeAsync(0);
    expect(gmail.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(gmail.calls).toBe(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(gmail.calls).toBe(4);

    runner.stop();
  });

  it("stop() prevents further cycles", async () => {
    const gmail = new CountingGmailClient();
    const runner = startPolling({ gmail, jobsApi: new NoopJobsApiClient(), store }, 1000);
    await vi.advanceTimersByTimeAsync(0);
    const callsBeforeStop = gmail.calls;

    runner.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(gmail.calls).toBe(callsBeforeStop);
  });

  it("logs and continues when a cycle throws", async () => {
    const errors: string[] = [];
    const gmail: GmailClient = {
      listNewMessageIds: async () => {
        throw new Error("gmail is down");
      },
    };
    const runner = startPolling(
      {
        gmail,
        jobsApi: new NoopJobsApiClient(),
        store,
        logger: { info: () => {}, warn: () => {}, error: (m) => errors.push(m) },
      },
      1000,
    );

    await vi.advanceTimersByTimeAsync(0);

    expect(errors).toEqual(["poll cycle failed: gmail is down"]);
    runner.stop();
  });
});
