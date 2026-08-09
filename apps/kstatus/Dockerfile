# Build context is the repo root (see release_kstatus.yml) — this app is a pnpm workspace
# member and needs the shared lockfile/workspace manifest to install correctly.
#
# No Procfile: Dokku treats a Dockerfile app's CMD as its `web` process type by default (and
# proxies it accordingly) whenever there's no Procfile to say otherwise, so one isn't needed here.

FROM node:24.19.0-slim AS build
WORKDIR /repo

RUN npm install -g pnpm@11.20.0

# Only the files pnpm needs to resolve the workspace against the lockfile — not every app's
# package.json, just this one (pnpm silently narrows its workspace scope to whatever package.json
# files are actually present) plus `patches/`, since pnpm-workspace.yaml's `patchedDependencies`
# is validated against the lockfile on every install regardless of which app is being built.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/kstatus/package.json apps/kstatus/package.json
RUN pnpm install --frozen-lockfile

COPY apps/kstatus apps/kstatus
RUN pnpm --filter kstatus build

# Synthesizes a deploy-only `package.json` (name/version/type/dependencies only — no
# devDependencies, no workspace-relative anything) and lets `pnpm install` resolve
# production-only dependencies directly into `dist/`, rather than shipping the whole pnpm
# workspace's hoisted node_modules into the image.
RUN node -e " \
    const fs = require('fs'); \
    const pkg = JSON.parse(fs.readFileSync('apps/kstatus/package.json', 'utf8')); \
    const deployPkg = { \
      name: pkg.name, \
      version: pkg.version, \
      private: true, \
      type: pkg.type, \
      dependencies: pkg.dependencies, \
    }; \
    fs.writeFileSync('apps/kstatus/dist/package.json', JSON.stringify(deployPkg, null, 2) + '\n'); \
  "
WORKDIR /repo/apps/kstatus/dist
# `--ignore-workspace`: this dist/ package.json isn't a declared pnpm-workspace.yaml member, but
# without the flag pnpm still finds the workspace root above it and runs the install scoped to
# "all workspace projects" instead of this directory alone — which, since dist/'s lockfile-less
# package.json doesn't match what's on disk at the real workspace root, makes pnpm want to purge
# and rebuild /repo/node_modules and abort with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY (no
# TTY to confirm the purge in a `docker build`), rather than installing anything into dist/ at all.
#
# `--ignore-scripts`: matches task-manager/personal-assistant's Dockerfiles — no dependency here
# needs a build step, but skipping install scripts by default keeps this resilient if one is added.
RUN pnpm install --prod --ignore-workspace --ignore-scripts

FROM node:24.19.0-slim AS runtime
WORKDIR /app
COPY --from=build /repo/apps/kstatus/dist ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
