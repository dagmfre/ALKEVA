# ALKEVA — one image, four entrypoints (web · api · worker · migrate).
#
# Why a single image rather than three:
#   - One `pnpm install` and one `pnpm -r build` for the whole workspace. Three
#     Dockerfiles would each re-resolve the same lockfile and each rebuild the
#     same two workspace packages (@alkeva/shared, @alkeva/db).
#   - The four processes then differ only by CMD, so the VM stores ONE image
#     instead of three near-identical ones. On a 20 GB boot disk that matters.
#
# Dev dependencies stay in the runtime layer on purpose: the worker and the
# migrate/seed jobs run their TypeScript through `tsx`, which is a devDependency.
# Pruning them would mean adding tsc build configs to two more packages for no
# gain on a single-VM deployment.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# argon2 falls back to node-gyp when no prebuild matches the platform, and
# pnpm-workspace.yaml explicitly allows its install script to run.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Prepare the pinned pnpm ahead of time: `corepack enable` only installs shims,
# and the tarball would otherwise be fetched on first use — inside a layer that
# runs as the unprivileged `node` user, where that write fails.
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
# Manifests only, so a source-only change does not invalidate the install layer.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/web/package.json      apps/web/package.json
COPY apps/api/package.json      apps/api/package.json
COPY apps/worker/package.json   apps/worker/package.json
COPY packages/db/package.json   packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
# ~660 packages resolve here, several of them large native binaries (next-swc,
# @swc/core, sharp-libvips). pnpm's defaults gave up on a socket timeout partway
# through on a slow link; these make the install survive a bad connection rather
# than failing the whole build near the end.
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    npm_config_network_concurrency=4
RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
# `pnpm -r build` compiles shared → db → api (tsc, for design:paramtypes) and
# runs `next build`. next.config.ts reads API_URL at server start, not here, so
# no API_URL is needed at build time.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm -r build

# ---- runtime ----------------------------------------------------------------
FROM build AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# node:22 ships an unprivileged `node` user (uid 1000). Nothing in the app
# writes to the image, so read-only ownership is enough.
USER node
CMD ["node", "apps/api/dist/main.js"]
