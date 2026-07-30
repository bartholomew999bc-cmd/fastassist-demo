# FAST-Assist Studio — Production Docker Image
#
# Multi-stage build:
#   1. builder  — Node 20 Alpine: install deps and compile static assets
#   2. runtime  — nginx Alpine:   serve dist/ with SPA routing + PORT injection
#
# Cloud Run usage:
#   docker build \
#     --build-arg VITE_FIREBASE_API_KEY=... \
#     --build-arg VITE_FIREBASE_AUTH_DOMAIN=... \
#     --build-arg VITE_FIREBASE_PROJECT_ID=... \
#     --build-arg VITE_FIREBASE_STORAGE_BUCKET=... \
#     --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=... \
#     --build-arg VITE_FIREBASE_APP_ID=... \
#     --build-arg VITE_OPENROUTER_API_KEY=... \
#     -t gcr.io/PROJECT_ID/fast-assist-studio .
#
#   docker run -p 8080:8080 -e PORT=8080 fast-assist-studio
#
# All VITE_ variables are inlined at build time by Vite's bundler.
# They are NOT available as runtime env vars inside the container.
# PORT is the only runtime environment variable — injected by Cloud Run.

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (layer cached unless lockfile changes)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source (respects .dockerignore)
COPY . .

# ── Firebase Authentication (required) ───────────────────────────────────────
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_STORAGE_BUCKET=""
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_FIREBASE_MEASUREMENT_ID=""

# ── AI Inference ─────────────────────────────────────────────────────────────
ARG VITE_OPENROUTER_API_KEY=""

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

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID \
    VITE_OPENROUTER_API_KEY=$VITE_OPENROUTER_API_KEY \
    VITE_PROVIDER=$VITE_PROVIDER \
    VITE_INFERENCE_INTERVAL=$VITE_INFERENCE_INTERVAL \
    VITE_VIDEO_PATH=$VITE_VIDEO_PATH \
    VITE_THEME=$VITE_THEME \
    VITE_DEBUG=$VITE_DEBUG \
    VITE_DEV_AUTH_BYPASS=false

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Install envsubst (provided by gettext) for PORT substitution at startup.
# wget is already in the base image for health checks.
RUN apk add --no-cache gettext

# Remove default nginx content and config
RUN rm -rf /usr/share/nginx/html/* \
    && rm -f /etc/nginx/conf.d/default.conf

# Copy built static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

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
