# Build context is the repo root (see release_personal_assistant.yml) — this app is a pnpm
# workspace member and needs the shared lockfile/workspace manifest to install correctly.
#
# `server.ts` (built here as `dist/server.js`) is a poller with no inbound HTTP traffic — see
# Procfile below and README.md for why this ships as a `worker:` process rather than `web:`.

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

# Dokku's Dockerfile builder reads a `Procfile` from the image's WORKDIR (see Procfile below), the
# same mechanism the old herokuish buildpack deploy relied on — so, like that deploy, this
# synthesizes a deploy-only `package.json` (name/version/type/dependencies only — no
# devDependencies, no workspace-relative anything) and lets plain `npm install` resolve
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
RUN npm install --omit=dev

FROM node:24.19.0-slim AS runtime
WORKDIR /app
COPY --from=build /repo/apps/personal-assistant/dist ./
COPY apps/personal-assistant/Procfile ./Procfile

ENV NODE_ENV=production
CMD ["node", "server.js"]
