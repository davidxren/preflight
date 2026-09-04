# Build and run Preflight on a host with a persistent volume. SQLite needs a
# real filesystem, so this image is meant for a Fly machine (or any Node host
# with a disk), not for a serverless target.

FROM node:24-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 is a native module; these are needed only if no prebuilt
# binary matches the platform, and they stay out of the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runner
WORKDIR /app

# Sample mode by default (v1.1 hard rule 9): a container that is handed no
# configuration serves committed snapshots and makes no network call.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PREFLIGHT_DATA=sample \
    PREFLIGHT_DB_PATH=/data/preflight.db \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# No key is baked in (hard rule 10). Every secret arrives at run time, from
# `fly secrets` in deployment or `-e` locally.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Runs as root so the entrypoint can write to a volume mounted at /data, whose
# ownership is set by the host rather than by this image.
RUN mkdir -p /data && chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
