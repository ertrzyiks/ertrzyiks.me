import type { Queue } from "bullmq";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import type { FastifyInstance } from "fastify";

export const BULL_BOARD_BASE_PATH = "/admin/queues";

/**
 * Mounts the Bull Board queue-inspection UI onto an existing Fastify instance.
 *
 * Needs concrete BullMQ `Queue`s (not the `JobsQueue`/`GoogleTasksJobsQueue` seams used by
 * `createApp`) to introspect job state — `server.ts` already builds them via `createQueue()`, so
 * they're passed straight through rather than re-derived here. One board covers both
 * `extract-action-items` and `sync-google-tasks`. No `readOnlyMode` is set on the adapter below,
 * so this is full read/write (retry/delete/re-queue), not a view-only board (#296).
 */
export async function registerBullBoard(app: FastifyInstance, queues: Queue[]): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: BULL_BOARD_BASE_PATH,
  });
}
