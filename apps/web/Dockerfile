# syntax=docker/dockerfile:1.7

# Build context is ./apps/web (see docker-compose.yml), governed by
# apps/web/.dockerignore. The "workspace" additional build context (repo
# root, wired in docker-compose.yml) supplies packages/* and the root
# workspace manifests — same pattern as apps/api/Dockerfile.

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY --from=workspace package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY --from=workspace packages ./packages
COPY --from=workspace apps/api/package.json apps/api/package.json
COPY --from=workspace e2e/package.json e2e/package.json
COPY package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY . ./apps/web
# Vite inlines `VITE_*` env vars into the bundle at BUILD time (there is no
# runtime env injection point for a static build) — so the API origin has
# to be supplied as a build arg, not a compose `environment:` entry. Default
# matches the browser-facing origin from README.md / .env.example.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm turbo run build --filter=@snapscale/web...

# ---- runtime: nginx serves the static bundle ----
# `vite preview` is explicitly documented by Vite as not meant for
# production; nginx:alpine is a real static-file server (gzip, correct
# cache headers, SPA fallback) and has no native-module concerns the way
# apps/api's sharp dependency does, so alpine is fine here.
FROM nginx:1.27-alpine AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN printf 'server {\n\
  listen 5173;\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 5173
# FIX-E: busybox `wget` resolves `localhost` to `::1` first (`/etc/hosts`
# lists it before `127.0.0.1`); nginx here only `listen`s on the IPv4
# wildcard, so that first resolution attempt always gets "Connection
# refused" and the healthcheck never passes even though the app serves 200s
# correctly. Target 127.0.0.1 explicitly instead of relying on `localhost`'s
# resolution order.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["wget", "-q", "-O", "-", "http://127.0.0.1:5173/"]
CMD ["nginx", "-g", "daemon off;"]
