# Build context is the repo root (see release_personal_assistant.yml) — this app is a pnpm
# workspace member and needs the shared lockfile/workspace manifest to install correctly.
#
# `server.ts` (built here as `dist/server.js`) is mainly a poller with no meaningful inbound
# traffic — its only HTTP surface is the liveness endpoint from healthServer.ts. No Procfile:
# Dokku treats a Dockerfile app's CMD as its `web` process type by default (and proxies it
# accordingly) whenever there's no Procfile to say otherwise, so one isn't needed here.

FROM node:24.19.0-slim AS build
WORKDIR /repo

RUN npm install -g pnpm@11.20.0

# Only the files pnpm needs to resolve the workspace against the lockfile — not every app's
# package.json, just this one (pnpm silently narrows its workspace scope to whatever package.json
# files are actually present) plus `patches/`, since pnpm-workspace.yaml's `patchedDependencies`
# is validated against the lockfile on every install regardless of which app is being built.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/personal-assistant/package.json apps/personal-assistant/package.json
RUN pnpm install --frozen-lockfile

COPY apps/personal-assistant apps/personal-assistant
RUN pnpm --filter personal-assistant build

# Synthesizes a deploy-only `package.json` (name/version/type/dependencies only — no
# devDependencies, no workspace-relative anything) and lets `pnpm install` resolve
# production-only dependencies directly into `dist/`, rather than shipping the whole pnpm
# workspace's hoisted node_modules into the image.
RUN node -e " \
    const fs = require('fs'); \
    const pkg = JSON.parse(fs.readFileSync('apps/personal-assistant/package.json', 'utf8')); \
    const deployPkg = { \
      name: pkg.name, \
      version: pkg.version, \
      private: true, \
      type: pkg.type, \
      dependencies: pkg.dependencies, \
    }; \
    fs.writeFileSync('apps/personal-assistant/dist/package.json', JSON.stringify(deployPkg, null, 2) + '\n'); \
  "
WORKDIR /repo/apps/personal-assistant/dist
RUN pnpm install --prod

FROM node:24.19.0-slim AS runtime
WORKDIR /app
COPY --from=build /repo/apps/personal-assistant/dist ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
