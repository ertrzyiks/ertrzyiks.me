import type { Queue } from "bullmq";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import type { FastifyInstance } from "fastify";

export const BULL_BOARD_BASE_PATH = "/admin/queues";

/**
 * Mounts the Bull Board queue-inspection UI onto an existing Fastify instance.
 *
 * Dev-only: this needs a concrete BullMQ `Queue` (not the `JobsQueue` seam
 * used by `createApp`) to introspect job state, so it's wired up from the
 * dev entrypoint only and never touches the production `server.ts` path.
 */
export async function registerBullBoard(app: FastifyInstance, queue: Queue): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: BULL_BOARD_BASE_PATH,
  });
}
