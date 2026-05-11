# =============================================================================
# PRIVATE NETWORK — IMAGE CHANGES REQUIRED
# =============================================================================
# This file uses ONE public image (node) across all stages.
# Replace it with your internal mirror before building.
#
#  Stage              | Public image                 | Replace with
#  ------------------ | ---------------------------- | -------------------------
#  base/pruner/       |                              |
#  installer/builder  | node:22.11.0-alpine3.20      | <registry>/docker-virtual/node:22.11.0-alpine3.20
#  runner             | node:22.11.0-alpine3.20      | <registry>/docker-virtual/node:22.11.0-alpine3.20
#
# No nginx — using Node.js `serve@14.2.4` instead.
# `serve` is OpenShift-compatible: runs as non-root on port 8080.
#
# Also set the npm registry before running pnpm install:
#   RUN pnpm config set registry https://<your-registry>/api/npm/npm/
# =============================================================================

# PRIVATE NETWORK: change to <your-registry>/docker-virtual/node:22.11.0-alpine3.20
FROM node:22.11.0-alpine3.20 AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# ── Prune workspace to only what this app needs ──────────────────────────────
FROM base AS pruner
WORKDIR /app
# PRIVATE NETWORK: ensure turbo@2.3.3 is available in your npm proxy
RUN npm install -g turbo@2.3.3 --prefer-offline
COPY . .
RUN turbo prune --scope=@zabbix-portal/frontend --docker

# ── Install dependencies from pruned lockfile ────────────────────────────────
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# PRIVATE NETWORK: uncomment to point pnpm at your npm proxy:
# RUN pnpm config set registry https://<your-registry>/api/npm/npm/
RUN pnpm install --frozen-lockfile

# ── Build the frontend ────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=installer /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@zabbix-portal/frontend

# ── Runtime — OpenShift-compatible static file server ────────────────────────
# Using `serve` instead of nginx:
#   - Runs entirely as non-root (no CAP_NET_BIND_SERVICE, no port 80)
#   - Port 8080: OpenShift convention for unprivileged web apps
#   - OpenShift assigns a random UID at runtime but always GID 0 (root group).
#     Files are chowned 1001:0 + chmod g=u so any UID in group 0 can read them.
#   - /api/ proxying is handled at the Ingress/Route level, not in this container.
#
# PRIVATE NETWORK: change to <your-registry>/docker-virtual/node:22.11.0-alpine3.20
FROM node:22.11.0-alpine3.20 AS runner

# PRIVATE NETWORK: ensure serve@14.2.4 is available in your npm proxy
RUN npm install -g serve@14.2.4

# Prepare a writable app directory owned by 1001 with group-write for OpenShift
RUN mkdir -p /app/dist \
    && chown -R 1001:0 /app \
    && chmod -R g=u /app

COPY --from=builder --chown=1001:0 /app/apps/frontend/dist /app/dist

# Non-root user; OpenShift may override the UID but will keep GID 0
USER 1001

EXPOSE 8080

# -s  single-page app mode: unknown paths return index.html (replaces nginx try_files)
# -l  listen port
CMD ["serve", "-s", "/app/dist", "-l", "8080"]
