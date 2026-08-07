# Build context is the repo root (see release_task_manager.yml) — this app is a pnpm workspace
# member and needs the shared lockfile/workspace manifest to install correctly.
#
# `apps/task-manager` also contains `src/worker.ts`, the Mac-only worker that reads email content
# via the local Keychain/LM Studio (see README.md). It never runs on Dokku — only the Jobs API
# server (`server.ts`) is deployed here, so this image builds and ships `dist/server.js` only.

FROM node:24.19.0-slim AS build
WORKDIR /repo

RUN npm install -g pnpm@11.20.0

# Only the files pnpm needs to resolve the workspace against the lockfile — not every app's
# package.json, just this one (pnpm silently narrows its workspace scope to whatever package.json
# files are actually present) plus `patches/`, since pnpm-workspace.yaml's `patchedDependencies`
# is validated against the lockfile on every install regardless of which app is being built.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/task-manager/package.json apps/task-manager/package.json
RUN pnpm install --frozen-lockfile

COPY apps/task-manager apps/task-manager
RUN pnpm --filter task-manager build

# Synthesizes a deploy-only `package.json` (name/version/type/dependencies only — no
# devDependencies, no workspace-relative anything) and lets `pnpm install` resolve
# production-only dependencies directly into `dist/`, rather than shipping the whole pnpm
# workspace's hoisted node_modules into the image.
RUN node -e " \
    const fs = require('fs'); \
    const pkg = JSON.parse(fs.readFileSync('apps/task-manager/package.json', 'utf8')); \
    const deployPkg = { \
      name: pkg.name, \
      version: pkg.version, \
      private: true, \
      type: pkg.type, \
      dependencies: pkg.dependencies, \
    }; \
    fs.writeFileSync('apps/task-manager/dist/package.json', JSON.stringify(deployPkg, null, 2) + '\n'); \
  "
WORKDIR /repo/apps/task-manager/dist
# `--ignore-workspace`: this dist/ package.json isn't a declared pnpm-workspace.yaml member, but
# without the flag pnpm still finds the workspace root above it and runs the install scoped to
# "all workspace projects" instead of this directory alone — which, since dist/'s lockfile-less
# package.json doesn't match what's on disk at the real workspace root, makes pnpm want to purge
# and rebuild /repo/node_modules and abort with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY (no
# TTY to confirm the purge in a `docker build`), rather than installing anything into dist/ at all.
#
# `--ignore-scripts`: `slim` has no python3/make/g++, so bullmq's optional native msgpackr-extract
# binding can't compile here — msgpackr transparently falls back to its pure-JS implementation,
# confirmed working end-to-end against a real Redis in manual testing. `--ignore-workspace` also
# stops pnpm from reading pnpm-workspace.yaml's `allowBuilds`, so without `--ignore-scripts` pnpm
# now hard-fails with ERR_PNPM_IGNORED_BUILDS instead of silently skipping the build as before.
RUN pnpm install --prod --ignore-workspace --ignore-scripts

FROM node:24.19.0-slim AS runtime
WORKDIR /app
COPY --from=build /repo/apps/task-manager/dist ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
