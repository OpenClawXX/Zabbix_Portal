# =============================================================================
# PRIVATE NETWORK — IMAGE CHANGES REQUIRED
# =============================================================================
# Replace the public image with your internal mirror before building.
#
#  Stage    | Public image            | Replace with
#  -------- | ----------------------- | ------------------------------------------
#  builder  | node:22.11.0-alpine3.20 | <registry>/docker-virtual/node:22.11.0-alpine3.20
#  runner   | node:22.11.0-alpine3.20 | <registry>/docker-virtual/node:22.11.0-alpine3.20
#
# Build context: apps/frontend/
#   docker build -t zabbix-portal-frontend apps/frontend/
# =============================================================================

# ── Build ─────────────────────────────────────────────────────────────────────
# PRIVATE NETWORK: change to <your-registry>/docker-virtual/node:22.11.0-alpine3.20
FROM node:22.2-alpine AS builder

WORKDIR /app

# PRIVATE NETWORK: uncomment to point at your internal npm registry:
# RUN npm config set registry https://<your-registry>/api/npm/npm/ \
#     && npm config set strict-ssl false

COPY package.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
# PRIVATE NETWORK: change to <your-registry>/docker-virtual/node:22.11.0-alpine3.20
FROM node:22.2-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=42069
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=1001:0 /app/public ./public
COPY --from=builder --chown=1001:0 /app/.next/standalone ./
COPY --from=builder --chown=1001:0 /app/.next/static ./.next/static

USER 1001

EXPOSE 42069

CMD ["node", "server.js"]
