# syntax=docker/dockerfile:1.7

# ---- dependencies (all, for building) ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build server (tsc) and web (vite) ----
FROM deps AS build
COPY server ./server
COPY web ./web
RUN npm run build

# ---- production dependencies only ----
FROM node:24-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund \
 && rm -rf node_modules/.cache

# ---- runtime: no shell, no package manager, non-root by default ----
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3103 \
    WEB_DIST=/app/dist/web \
    OPENAPI_PATH=/app/openapi.yaml
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/migrations ./dist/migrations
COPY docs/openapi.yaml ./openapi.yaml
COPY package.json ./
USER nonroot
EXPOSE 3103
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "dist/server/cli.js", "healthcheck"]
CMD ["dist/server/index.js"]
