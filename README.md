# ertrzyiks.me

A pnpm workspace containing the apps that make up ertrzyiks.me and its supporting services.

## Installation

You need Node.js and [pnpm](https://pnpm.io/).

To install all dependencies for every app run:
```
pnpm install
```

## Apps

### Home (ertrzyiks.me)

Astro site for the main site. See [apps/home/README.md](apps/home/README.md).

```
cd apps/home
pnpm dev
```

### Blog (blog.ertrzyiks.me)

Astro-based blog. See [apps/blog/README.md](apps/blog/README.md).

```
cd apps/blog
pnpm dev
```

### task-manager

Jobs API server (plus a Mac-only worker) for the email → action-items automation. See
[apps/task-manager/README.md](apps/task-manager/README.md).

```
cd apps/task-manager
pnpm dev
```

### personal-assistant

Orchestration service that polls Gmail and schedules jobs against `task-manager`. See
[apps/personal-assistant/README.md](apps/personal-assistant/README.md).

```
cd apps/personal-assistant
pnpm dev
```
