# task-manager

Jobs API server for the email → action-items automation (see [#248](https://github.com/ertrzyiks/ertrzyiks.me/issues/248)).
Exposes the BullMQ + Redis queue over HTTP for `personal-assistant` to schedule action-item
extraction jobs and poll their status/result.

The Mac worker that actually processes jobs (colocated in this package per #245) is built
separately in #249.

## Environment variables

| Variable                | Required | Description                                              |
| ------------------------ | -------- | ---------------------------------------------------------- |
| `REDIS_URL`              | yes      | Connection string for the BullMQ-backing Redis instance    |
| `JOBS_API_BEARER_TOKEN`  | yes      | Shared secret every request must present as `Authorization: Bearer <token>` |
| `PORT`                   | no       | HTTP port to listen on (default `3000`)                    |

## Endpoints

All endpoints require `Authorization: Bearer <JOBS_API_BEARER_TOKEN>`.

- `POST /jobs` — `{ emailId }` → `201 { jobId }`
- `GET /jobs/:jobId` — `200 { jobId, status, result?, error? }`, `404` if unknown
- `POST /jobs/status` — `{ jobIds: [...] }` → `200 { results: [{ jobId, status, result?, error? }, ...] }` (unknown job IDs are omitted from `results`)

`status` is one of `pending | active | completed | failed`, collapsing BullMQ's internal states
per the contract in #241.

## Development

```bash
pnpm install
pnpm --filter task-manager test
```

### Local dev workflow

1. Copy the env file and adjust the bearer token if you like:

   ```bash
   cp apps/task-manager/.env.example apps/task-manager/.env
   ```

2. Start a local Redis container (via `docker-compose.yml`, scoped to this package, no auth —
   dev-only, unrelated to the real Redis instance provisioned via Terraform):

   ```bash
   pnpm --filter task-manager dev:redis
   ```

3. Run the dev server:

   ```bash
   pnpm --filter task-manager dev
   ```

   This runs `src/devServer.ts` instead of the production `src/server.ts` entrypoint. It loads
   `apps/task-manager/.env` (via `dotenv`) and additionally mounts the
   [Bull Board](https://github.com/felixmosh/bull-board) queue-inspection UI, which the
   production server never does — `server.ts` (what Dokku actually runs via `pnpm start`) has no
   dependency on `dotenv` or `@bull-board/*` at all.

4. Open the queue UI at **http://localhost:3000/admin/queues** (send the same
   `Authorization: Bearer <JOBS_API_BEARER_TOKEN>` header/cookie the API expects — the auth hook
   in `app.ts` guards every route, Bull Board included). Post a job and watch it show up:

   ```bash
   curl -X POST http://localhost:3000/jobs \
     -H "Authorization: Bearer local-dev-token" \
     -H "Content-Type: application/json" \
     -d '{"emailId":"email-123"}'
   ```

5. When you're done, stop the Redis container:

   ```bash
   pnpm --filter task-manager dev:redis:down
   ```
