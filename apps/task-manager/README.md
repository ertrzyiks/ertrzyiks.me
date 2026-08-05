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
pnpm --filter task-manager dev   # requires REDIS_URL + JOBS_API_BEARER_TOKEN in the environment
```
