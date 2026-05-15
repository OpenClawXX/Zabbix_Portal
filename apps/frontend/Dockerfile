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
FROM node:22.11.0-alpine3.20 AS builder

WORKDIR /app

# PRIVATE NETWORK: uncomment to point at your internal npm registry:
# RUN npm config set registry https://<your-registry>/api/npm/npm/ \
#     && npm config set strict-ssl false

COPY package.json ./
RUN npm install

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
# PRIVATE NETWORK: change to <your-registry>/docker-virtual/node:22.11.0-alpine3.20
FROM node:22.11.0-alpine3.20 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=42069
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.env ./.env

USER nextjs

EXPOSE 42069

CMD ["node", "server.js"]
