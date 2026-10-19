# syntax=docker/dockerfile:1
#
# One image for the whole app: the API, which also serves the built web app.
#   docker build -t fantasy-dashboard --build-arg GIT_COMMIT=$(git rev-parse HEAD) .
# Locally: docker compose --profile app up --build   (http://localhost:8080)

# ── Build: install dev tooling, build the web app and bundle the API ─────────
FROM node:24-alpine AS build
WORKDIR /app

# Package manifests first, so the slow install step is cached until one changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
# Only what the build needs; the end-to-end tooling (Playwright) is skipped.
RUN npm ci -w @ffd/api -w @ffd/web -w @ffd/shared --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w @ffd/web && npm run build -w @ffd/api

# ── Runtime: production dependencies and build output only ───────────────────
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    TRUST_PROXY=1 \
    CACHE_DIR=/tmp/ffd-cache
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN npm ci --omit=dev -w @ffd/api && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY apps/api/drizzle apps/api/drizzle

# Last, so a new commit doesn't invalidate the cached layers above.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

# Don't run as root: the app only needs to read its files and write to /tmp.
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "--enable-source-maps", "apps/api/dist/server.js"]
