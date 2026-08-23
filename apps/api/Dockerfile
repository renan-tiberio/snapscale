# syntax=docker/dockerfile:1.7

# Build context for this Dockerfile is ./apps/api (see docker-compose.yml),
# governed by apps/api/.dockerignore. Cross-package files (packages/*, root
# workspace manifests) come from the "workspace" additional build context,
# which docker-compose.yml points at the repo root — that's how a Dockerfile
# scoped to one app can still reach its pnpm workspace siblings.
#
# node:22-slim (Debian, glibc), not alpine: `sharp` ships prebuilt native
# bindings for glibc/musl both, but pinning to glibc removes one variable
# (and matches CI/most hosting images) without a verified reason to chase
# alpine's smaller size. Node 22 matches .nvmrc; local dev happens to run
# Node 24, but the container is intentionally pinned to what CI expects.

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---- deps: full workspace install (dev+prod) — needed to run the build ----
FROM base AS deps
# Root manifests + every workspace package's source, from the repo root.
# Copying the whole packages/ tree (not just package.json) means a package
# that doesn't exist yet (e.g. packages/otel mid-flight from a parallel
# change) is simply included if present and skipped if not — no special
# casing required here.
COPY --from=workspace package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY --from=workspace packages ./packages
# Other workspace members' manifests only (not their source) — pnpm's
# frozen-lockfile check walks the whole workspace, so it needs to see these
# even though this image never builds them.
COPY --from=workspace apps/web/package.json apps/web/package.json
COPY --from=workspace e2e/package.json e2e/package.json
# This app's own manifest, from the default (apps/api) context.
COPY package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile @snapscale/shared (and anything else api depends on) + api ----
FROM deps AS build
COPY . ./apps/api
# turbo resolves the dependency graph (^build) itself, so whatever apps/api
# currently depends on inside packages/* gets built first, automatically.
RUN pnpm turbo run build --filter=@snapscale/api...

# ---- prod-deps: production-only install, same base image sharp will run on ----
FROM base AS prod-deps
COPY --from=workspace package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=workspace apps/web/package.json apps/web/package.json
COPY --from=workspace e2e/package.json e2e/package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter=@snapscale/api...

# ---- runtime ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Pre-create the upload dir owned by the non-root user *before* declaring the
# volume mount point: Docker seeds a fresh named volume from the image's
# existing directory content (including ownership), so this is what makes
# `node` able to write into the volume later — an empty root-owned mount
# point would otherwise reject writes from a non-root process.
RUN mkdir -p apps/api/data/uploads && chown -R node:node apps/api
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/migrations ./apps/api/migrations
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
USER node
# No curl/wget in slim — Node 22 has global fetch, so the healthcheck needs
# nothing extra installed.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://localhost:4000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]
