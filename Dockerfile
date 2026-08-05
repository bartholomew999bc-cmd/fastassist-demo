# FAST-Assist Studio — Production Docker Image
#
# Multi-stage build:
#   1. builder  — Node 20 Alpine: install deps and compile static assets
#   2. runtime  — nginx Alpine:   serve dist/ with SPA routing + PORT injection
#
# Cloud Run usage:
#   docker build -t gcr.io/PROJECT_ID/fast-assist-studio .
#
#   docker run -p 8080:8080 -e PORT=8080 -e OPENROUTER_API_KEY=... fast-assist-studio
#
# Firebase web config is embedded in the frontend bundle at build time —
# no build arguments required. See src/lib/firebase.ts.
# OPENROUTER_API_KEY is a runtime-only variable — never a build arg.
# PORT is injected by Cloud Run at runtime.

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install dependencies (layer cached unless lockfile changes)
COPY package.json package-lock.json ./
RUN NODE_ENV= npm ci --ignore-scripts --include=dev

# Copy source (respects .dockerignore)
COPY . .

# ── Application configuration ────────────────────────────────────────────────
ARG VITE_PROVIDER="hosted"
ARG VITE_INFERENCE_INTERVAL="1200"
ARG VITE_VIDEO_PATH="/videos/ultrasound.mp4"
ARG VITE_THEME="dark"
ARG VITE_DEBUG="false"

# ── Production safety: development bypass is always off in built images ───────
# import.meta.env.DEV is already `false` in production builds, making this
# redundant — but setting it explicitly provides an auditable guarantee.
ARG VITE_DEV_AUTH_BYPASS="false"

ENV VITE_PROVIDER=$VITE_PROVIDER \
    VITE_INFERENCE_INTERVAL=$VITE_INFERENCE_INTERVAL \
    VITE_VIDEO_PATH=$VITE_VIDEO_PATH \
    VITE_THEME=$VITE_THEME \
    VITE_DEBUG=$VITE_DEBUG \
    VITE_DEV_AUTH_BYPASS=false

RUN npm run build

# ── Bundle the inference proxy server ─────────────────────────────────────────
# Produces a self-contained CJS bundle (no node_modules needed at runtime).
RUN node_modules/.bin/esbuild api/server.ts \
      --bundle \
      --platform=node \
      --format=cjs \
      --outfile=dist-proxy.cjs

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Install envsubst (gettext) for PORT substitution, and Node.js to run the
# inference proxy server. nodejs is ~10 MB on Alpine — keeps the image lean.
RUN apk add --no-cache gettext nodejs

# Remove default nginx content and config
RUN rm -rf /usr/share/nginx/html/* \
    && rm -f /etc/nginx/conf.d/default.conf

# Copy built static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy the bundled inference proxy (served by Node.js on 127.0.0.1:9001)
COPY --from=builder /app/dist-proxy.cjs /app/dist-proxy.cjs

# Copy nginx config template (${PORT} is substituted at startup)
COPY nginx.template.conf /etc/nginx/templates/default.conf.template

# Copy and configure entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Cloud Run default port — informational only, Cloud Run ignores EXPOSE.
# The actual listening port is determined by $PORT at runtime.
EXPOSE 8080

# Health check using the dedicated /healthz endpoint.
# Cloud Run also performs its own health probing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-8080}/healthz || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
